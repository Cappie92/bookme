# DeDato Blog Article AI-Only Template

Use this template to generate a blog article for import into DeDato.

Rules:
- Return only one complete Markdown file.
- Do not add fields that are not listed below.
- Keep `excerpt` and `meta_description` within 160 characters.
- If you are unsure about `slug`, leave it empty.
- Keep `status` as `draft`.
- Write the article body in clean Markdown.
- Do not include explanations outside the template.

```markdown
---
title: "Заголовок статьи"
slug: ""
subtitle: "Необязательно"
excerpt: "Короткий анонс статьи до 160 символов."

meta_title: "SEO-заголовок до ~60 символов"
meta_description: "SEO-описание до 160 символов."
canonical_url: ""
robots_noindex: false
robots_nofollow: false

og_title: ""
og_description: ""
og_image: ""

twitter_title: ""
twitter_description: ""
twitter_image: ""

cover_image: ""
cover_image_alt: ""

tags:
  - "тег-1"
  - "тег-2"

status: draft
published_at: ""
scheduled_at: ""
---

# Введение

2–3 абзаца, которые быстро вводят в тему статьи.

## Основная мысль 1

Подробный текст.

## Основная мысль 2

Подробный текст.

## Практические выводы

- пункт 1
- пункт 2
- пункт 3

## Итог

Короткий финальный вывод.
```
