"""
Парсинг Markdown + YAML frontmatter для импорта статей блога (preview, без записи в БД).
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import markdown
import nh3
import yaml
from pydantic import ValidationError

from schemas import BlogPostImportFrontmatter, BlogPostImportPreviewResponse

# Ключи frontmatter, которые мы осознанно обрабатываем (остальное — предупреждение).
KNOWN_FRONTMATTER_KEYS = frozenset(
    {
        "title",
        "slug",
        "subtitle",
        "excerpt",
        "meta_title",
        "meta_description",
        "canonical_url",
        "robots_noindex",
        "robots_nofollow",
        "og_title",
        "og_description",
        "og_image",
        "twitter_title",
        "twitter_description",
        "twitter_image",
        "cover_image",
        "cover_image_alt",
        "tags",
        "status",
        "published_at",
        "scheduled_at",
    }
)

FRONTMATTER_PATTERN = re.compile(r"^---\s*\r?\n(.*?)\r?\n---\s*(?:\r?\n|$)", re.DOTALL)

MARKDOWN_EXTENSIONS = [
    "markdown.extensions.fenced_code",
    "markdown.extensions.tables",
    "markdown.extensions.nl2br",
    "markdown.extensions.sane_lists",
]


def _split_frontmatter(raw_text: str) -> Tuple[Dict[str, Any], str, Optional[str]]:
    """
    Возвращает (frontmatter_dict, body_markdown, yaml_error).
    Если блока --- нет: пустой dict, весь текст — body, yaml_error None.
    """
    text = raw_text.lstrip("\ufeff")
    m = FRONTMATTER_PATTERN.match(text)
    if not m:
        return {}, text.strip(), None
    yaml_block = m.group(1)
    body = text[m.end() :].lstrip("\r\n")
    try:
        loaded = yaml.safe_load(yaml_block)
    except yaml.YAMLError as e:
        return {}, body, str(e).strip() or "Ошибка разбора YAML"
    if loaded is None:
        return {}, body, None
    if not isinstance(loaded, dict):
        return {}, body, "Frontmatter должен быть YAML-объектом (ключ: значение), не списком и не строкой"
    return loaded, body, None


def _markdown_to_safe_html(md_body: str) -> str:
    html = markdown.markdown(md_body.strip() or "", extensions=MARKDOWN_EXTENSIONS)
    return nh3.clean(html)


def parse_blog_import_markdown(
    raw_text: str,
    *,
    max_body_chars: int = 1_500_000,
) -> BlogPostImportPreviewResponse:
    errors: List[str] = []
    warnings: List[str] = []

    if not raw_text or not raw_text.strip():
        return BlogPostImportPreviewResponse(
            parsed_fields={},
            content_html="",
            warnings=[],
            errors=["Файл пустой"],
        )

    if len(raw_text) > max_body_chars:
        return BlogPostImportPreviewResponse(
            parsed_fields={},
            content_html="",
            warnings=[],
            errors=[f"Файл слишком большой (максимум {max_body_chars} символов)"],
        )

    fm_raw, body, yaml_err = _split_frontmatter(raw_text)
    if yaml_err:
        return BlogPostImportPreviewResponse(
            parsed_fields={},
            content_html="",
            warnings=[],
            errors=[f"Не удалось прочитать YAML-блок в начале файла. Проверьте синтаксис frontmatter: {yaml_err}"],
        )

    if not fm_raw and raw_text.strip().startswith("---"):
        warnings.append("Начальный блок frontmatter выглядит незавершённым. Проверьте, что он закрыт строкой `---`.")

    for key in fm_raw:
        if key not in KNOWN_FRONTMATTER_KEYS:
            warnings.append(f"Поле «{key}» пока не поддерживается в MVP-импорте и было пропущено.")

    if not fm_raw:
        warnings.append("Frontmatter не найден. Импорт продолжен только по телу статьи; метаданные нужно заполнить вручную.")

    try:
        fm = BlogPostImportFrontmatter.model_validate(fm_raw)
    except ValidationError as e:
        for err in e.errors():
            loc = ".".join(str(x) for x in err.get("loc", ()))
            msg = err.get("msg", "ошибка валидации")
            errors.append(f"{loc}: {msg}" if loc else msg)
        return BlogPostImportPreviewResponse(
            parsed_fields={},
            content_html="",
            warnings=warnings,
            errors=errors or ["Ошибка валидации frontmatter"],
        )

    title = (fm.title or "").strip()
    if not title:
        errors.append("Не найден обязательный `title` в frontmatter.")

    body_stripped = (body or "").strip()
    if not body_stripped:
        errors.append("Тело статьи пустое. После frontmatter добавьте Markdown-контент статьи.")

    if errors:
        return BlogPostImportPreviewResponse(
            parsed_fields={},
            content_html="",
            warnings=warnings,
            errors=errors,
        )

    content_html = _markdown_to_safe_html(body_stripped)

    if fm.status and str(fm.status).lower() not in ("draft", "scheduled", "published"):
        warnings.append(f"Значение status «{fm.status}» не распознано. Статья будет импортирована как черновик.")
    elif fm.status and str(fm.status).lower() != "draft":
        warnings.append("В MVP импорт всегда создаёт черновик. Статус из файла не применяется автоматически.")

    if not (fm.excerpt or "").strip():
        warnings.append("Поле `excerpt` пустое. Это не ошибка, но рекомендуется добавить короткий анонс.")
    if not (fm.meta_description or "").strip():
        warnings.append("Поле `meta_description` пустое. Это не ошибка, но желательно заполнить для SEO.")
    if not (fm.slug or "").strip():
        warnings.append("`slug` не указан. При сохранении он будет создан из заголовка автоматически.")

    # MVP: всегда черновик в форме; даты публикации из файла не подставляем.
    if fm.published_at:
        warnings.append("`published_at` из файла не применяется в MVP. Дата публикации задаётся вручную после импорта.")
    if fm.scheduled_at:
        warnings.append("`scheduled_at` из файла не применяется в MVP. При необходимости укажите дату вручную в форме.")

    parsed_fields: Dict[str, Any] = {
        "title": title,
        "subtitle": (fm.subtitle or "").strip(),
        "slug": (fm.slug or "").strip(),
        "excerpt": (fm.excerpt or "").strip()[:160],
        "cover_image": (fm.cover_image or "").strip(),
        "cover_image_alt": (fm.cover_image_alt or "").strip(),
        "tags": list(fm.tags or []),
        "meta_title": (fm.meta_title or "").strip(),
        "meta_description": (fm.meta_description or "").strip()[:160],
        "canonical_url": (fm.canonical_url or "").strip(),
        "robots_noindex": bool(fm.robots_noindex),
        "robots_nofollow": bool(fm.robots_nofollow),
        "og_title": (fm.og_title or "").strip(),
        "og_description": (fm.og_description or "").strip(),
        "og_image": (fm.og_image or "").strip(),
        "twitter_title": (fm.twitter_title or "").strip(),
        "twitter_description": (fm.twitter_description or "").strip(),
        "twitter_image": (fm.twitter_image or "").strip(),
        "json_ld": None,
        "status": "draft",
        "scheduled_at": "",
    }

    return BlogPostImportPreviewResponse(
        parsed_fields=parsed_fields,
        content_html=content_html,
        warnings=warnings,
        errors=[],
    )
