import re
import json
from typing import Dict, List, Tuple
from datetime import datetime
from urllib.parse import quote
import unicodedata


def generate_slug(title: str) -> str:
    """
    Генерирует SEO-friendly slug из заголовка
    """
    # Нормализуем Unicode символы
    title = unicodedata.normalize('NFD', title)
    
    # Приводим к нижнему регистру
    title = title.lower()
    
    # Заменяем кириллицу на латиницу
    cyrillic_map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    }
    
    for cyr, lat in cyrillic_map.items():
        title = title.replace(cyr, lat)
    
    # Заменяем пробелы и специальные символы на дефисы
    title = re.sub(r'[^\w\s-]', '', title)
    title = re.sub(r'[-\s]+', '-', title)
    
    # Убираем дефисы в начале и конце
    title = title.strip('-')
    
    return title


def analyze_seo(content: str, title: str, meta_description: str = None) -> Dict:
    """
    Анализирует SEO параметры контента
    """
    # Подсчет слов
    words = re.findall(r'\b\w+\b', content.lower())
    word_count = len(words)
    
    # Время чтения (средняя скорость 200 слов в минуту)
    reading_time = max(1, word_count // 200)
    
    # Анализ ключевых слов
    word_freq = {}
    for word in words:
        if len(word) > 2:  # Игнорируем короткие слова
            word_freq[word] = word_freq.get(word, 0) + 1
    
    # Сортируем по частоте
    keyword_density = dict(sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:10])
    
    # SEO оценка
    seo_score = 0
    suggestions = []
    
    # Проверка длины заголовка
    if 30 <= len(title) <= 60:
        seo_score += 20
    else:
        suggestions.append("Заголовок должен быть 30-60 символов")
    
    # Проверка длины описания
    if meta_description:
        if 120 <= len(meta_description) <= 160:
            seo_score += 15
        else:
            suggestions.append("Meta description должен быть 120-160 символов")
    
    # Проверка длины контента
    if word_count >= 300:
        seo_score += 25
    else:
        suggestions.append("Контент должен содержать минимум 300 слов")
    
    # Проверка наличия подзаголовков
    if re.search(r'<h[2-6]>', content):
        seo_score += 15
    else:
        suggestions.append("Добавьте подзаголовки (H2-H6)")
    
    # Проверка наличия изображений с alt
    alt_images = re.findall(r'<img[^>]*alt=["\']([^"\']+)["\'][^>]*>', content)
    if alt_images:
        seo_score += 10
    else:
        suggestions.append("Добавьте alt-атрибуты к изображениям")
    
    # Проверка внутренних ссылок
    internal_links = re.findall(r'href=["\']/[^"\']+["\']', content)
    if internal_links:
        seo_score += 10
    else:
        suggestions.append("Добавьте внутренние ссылки")
    
    # Проверка внешних ссылок
    external_links = re.findall(r'href=["\']https?://[^"\']+["\']', content)
    if external_links:
        seo_score += 5
    else:
        suggestions.append("Добавьте внешние ссылки")
    
    return {
        "seo_score": min(100, seo_score),
        "word_count": word_count,
        "reading_time": reading_time,
        "keyword_density": keyword_density,
        "suggestions": suggestions
    }


def generate_json_ld(blog_post) -> Dict:
    """
    Генерирует JSON-LD разметку для статьи
    """
    article_schema = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": blog_post.title,
        "description": blog_post.excerpt or blog_post.meta_description,
        "image": blog_post.cover_image,
        "author": {
            "@type": "Person",
            "name": blog_post.author.full_name if blog_post.author else "Автор"
        },
        "publisher": {
            "@type": "Organization",
            "name": "Appointo",
            "logo": {
                "@type": "ImageObject",
                "url": "https://appointo.ru/logo.png"
            }
        },
        "datePublished": blog_post.published_at.isoformat() if blog_post.published_at else None,
        "dateModified": blog_post.updated_at.isoformat(),
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": f"https://appointo.ru/blog/{blog_post.slug}"
        }
    }
    
    breadcrumb_schema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": 1,
                "name": "Главная",
                "item": "https://appointo.ru"
            },
            {
                "@type": "ListItem",
                "position": 2,
                "name": "Блог",
                "item": "https://appointo.ru/blog"
            },
            {
                "@type": "ListItem",
                "position": 3,
                "name": blog_post.title,
                "item": f"https://appointo.ru/blog/{blog_post.slug}"
            }
        ]
    }
    
    return {
        "article": article_schema,
        "breadcrumb": breadcrumb_schema
    }


def ping_search_engines(sitemap_url: str) -> Dict:
    """
    Отправляет ping в поисковые системы
    """
    import requests
    
    search_engines = {
        "google": f"https://www.google.com/ping?sitemap={sitemap_url}",
        "yandex": f"https://blogs.yandex.ru/pings/?status=success&url={sitemap_url}"
    }
    
    results = {}
    
    for engine, url in search_engines.items():
        try:
            response = requests.get(url, timeout=10)
            results[engine] = {
                "status": response.status_code,
                "success": response.status_code == 200
            }
        except Exception as e:
            results[engine] = {
                "status": "error",
                "success": False,
                "error": str(e)
            }
    
    return results


def generate_meta_tags(blog_post) -> Dict:
    """
    Генерирует meta теги для статьи
    """
    meta_tags = {
        "title": blog_post.meta_title or blog_post.title,
        "description": blog_post.meta_description or blog_post.excerpt,
        "canonical": blog_post.canonical_url or f"https://appointo.ru/blog/{blog_post.slug}",
        "robots": f"{'noindex' if blog_post.robots_noindex else 'index'},{'nofollow' if blog_post.robots_nofollow else 'follow'}",
        "og": {
            "title": blog_post.og_title or blog_post.title,
            "description": blog_post.og_description or blog_post.excerpt,
            "image": blog_post.og_image or blog_post.cover_image,
            "url": f"https://appointo.ru/blog/{blog_post.slug}",
            "type": "article"
        },
        "twitter": {
            "card": "summary_large_image",
            "title": blog_post.twitter_title or blog_post.title,
            "description": blog_post.twitter_description or blog_post.excerpt,
            "image": blog_post.twitter_image or blog_post.cover_image
        }
    }
    
    return meta_tags 