from datetime import datetime
from typing import Any, List, Optional
from sqlalchemy import or_, and_, func
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import BlogPost as BlogPostModel, BlogPostStatus, User
from schemas import BlogPost

router = APIRouter(
    prefix="/api/blog",
    tags=["blog"],
)


@router.get("/posts")
def get_public_posts(
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=50),
    search: Optional[str] = None,
    tags: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
) -> Any:
    """
    Получение списка опубликованных постов блога для публичной части.
    """
    skip = (page - 1) * limit
    
    # Базовый запрос только для опубликованных постов
    query = db.query(BlogPostModel).filter(
        BlogPostModel.status == BlogPostStatus.PUBLISHED,
        BlogPostModel.published_at.isnot(None),
        BlogPostModel.published_at <= datetime.utcnow()
    )
    
    # Поиск по заголовку, подзаголовку, анонсу или контенту
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                BlogPostModel.title.ilike(search_term),
                BlogPostModel.subtitle.ilike(search_term),
                BlogPostModel.excerpt.ilike(search_term),
                BlogPostModel.content.ilike(search_term)
            )
        )
    
    # Фильтр по тегам
    if tags:
        for tag in tags:
            query = query.filter(BlogPostModel.tags.contains([tag]))
    
    # Сортировка по дате публикации (новые сначала)
    query = query.order_by(BlogPostModel.published_at.desc().nullslast())
    
    # Получаем посты с пагинацией
    posts = query.offset(skip).limit(limit).all()
    
    # Преобразуем в Pydantic схемы
    from schemas import BlogPostList
    
    post_schemas = []
    for post in posts:
        post_dict = {
            "id": post.id,
            "title": post.title,
            "subtitle": post.subtitle,
            "excerpt": post.excerpt,
            "slug": post.slug,
            "cover_image": post.cover_image,
            "published_at": post.published_at,
            "created_at": post.created_at,
            "status": post.status,
            "seo_score": post.seo_score,
            "word_count": post.word_count,
            "reading_time": post.reading_time,
            "tags": post.tags,
            "author_name": post.author.full_name if post.author else "Автор",
            "content": post.content
        }
        post_schemas.append(BlogPostList(**post_dict))
    
    # Подсчитываем общее количество статей с теми же фильтрами
    total_query = db.query(BlogPostModel).filter(
        BlogPostModel.status == BlogPostStatus.PUBLISHED,
        BlogPostModel.published_at.isnot(None),
        BlogPostModel.published_at <= datetime.utcnow()
    )
    
    # Применяем те же фильтры поиска и тегов
    if search:
        search_term = f"%{search}%"
        total_query = total_query.filter(
            or_(
                BlogPostModel.title.ilike(search_term),
                BlogPostModel.subtitle.ilike(search_term),
                BlogPostModel.excerpt.ilike(search_term),
                BlogPostModel.content.ilike(search_term)
            )
        )
    
    if tags:
        for tag in tags:
            total_query = total_query.filter(BlogPostModel.tags.contains([tag]))
    
    return {
        "posts": post_schemas,
        "total": total_query.count(),
        "page": page,
        "limit": limit,
        "has_more": len(posts) == limit
    }


@router.get("/posts/{slug}")
def get_public_post(
    slug: str,
    db: Session = Depends(get_db),
) -> Any:
    """
    Получение отдельного опубликованного поста блога по slug.
    """
    post = db.query(BlogPostModel).filter(
        BlogPostModel.slug == slug,
        BlogPostModel.status == BlogPostStatus.PUBLISHED,
        BlogPostModel.published_at.isnot(None),
        BlogPostModel.published_at <= datetime.utcnow()
    ).first()
    
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    
    # Преобразуем в Pydantic схему
    from schemas import BlogPost
    
    post_dict = {
        "id": post.id,
        "title": post.title,
        "subtitle": post.subtitle,
        "excerpt": post.excerpt,
        "content": post.content,
        "slug": post.slug,
        "cover_image": post.cover_image,
        "published_at": post.published_at,
        "created_at": post.created_at,
        "status": post.status,
        "seo_score": post.seo_score,
        "word_count": post.word_count,
        "reading_time": post.reading_time,
        "tags": post.tags,
        "meta_title": post.meta_title,
        "meta_description": post.meta_description,
        "canonical_url": post.canonical_url,
        "og_title": post.og_title,
        "og_description": post.og_description,
        "og_image": post.og_image,
        "twitter_title": post.twitter_title,
        "twitter_description": post.twitter_description,
        "twitter_image": post.twitter_image,
        "json_ld": post.json_ld,
        "author_name": post.author.full_name if post.author else "Автор",
        "author_id": post.author_id,
        "updated_at": post.updated_at
    }
    
    return BlogPost(**post_dict)


@router.get("/posts/{slug}/navigation")
def get_post_navigation(
    slug: str,
    db: Session = Depends(get_db),
) -> Any:
    """
    Получение навигации между статьями (предыдущая/следующая).
    """
    # Получаем текущий пост
    current_post = db.query(BlogPostModel).filter(
        BlogPostModel.slug == slug,
        BlogPostModel.status == BlogPostStatus.PUBLISHED,
        BlogPostModel.published_at.isnot(None),
        BlogPostModel.published_at <= datetime.utcnow()
    ).first()
    
    if not current_post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    
    # Получаем все опубликованные посты, отсортированные по дате публикации
    all_posts = db.query(BlogPostModel).filter(
        BlogPostModel.status == BlogPostStatus.PUBLISHED,
        BlogPostModel.published_at.isnot(None),
        BlogPostModel.published_at <= datetime.utcnow()
    ).order_by(BlogPostModel.published_at.desc().nullslast()).all()
    
    # Находим индекс текущего поста
    current_index = None
    for i, post in enumerate(all_posts):
        if post.id == current_post.id:
            current_index = i
            break
    
    prev_post = None
    next_post = None
    
    if current_index is not None:
        # Предыдущая статья (более новая)
        if current_index < len(all_posts) - 1:
            prev_post = all_posts[current_index + 1]
        
        # Следующая статья (более старая)
        if current_index > 0:
            next_post = all_posts[current_index - 1]
    
    # Преобразуем в Pydantic схемы
    from schemas import BlogPostList
    
    def convert_to_schema(post):
        if not post:
            return None
        post_dict = {
            "id": post.id,
            "title": post.title,
            "subtitle": post.subtitle,
            "excerpt": post.excerpt,
            "slug": post.slug,
            "cover_image": post.cover_image,
            "published_at": post.published_at,
            "created_at": post.created_at,
            "status": post.status,
            "seo_score": post.seo_score,
            "word_count": post.word_count,
            "reading_time": post.reading_time,
            "tags": post.tags,
            "author_name": post.author.full_name if post.author else "Автор",
            "content": post.content
        }
        return BlogPostList(**post_dict)
    
    return {
        "prev_post": convert_to_schema(prev_post),
        "next_post": convert_to_schema(next_post)
    }


@router.get("/posts/{slug}/related")
def get_related_posts(
    slug: str,
    limit: int = Query(3, ge=1, le=10),
    db: Session = Depends(get_db),
) -> Any:
    """
    Получение похожих постов по тегам.
    """
    # Получаем текущий пост
    current_post = db.query(BlogPostModel).filter(
        BlogPostModel.slug == slug,
        BlogPostModel.status == BlogPostStatus.PUBLISHED
    ).first()
    
    if not current_post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    
    # Ищем посты с похожими тегами
    query = db.query(BlogPostModel).filter(
        BlogPostModel.id != current_post.id,
        BlogPostModel.status == BlogPostStatus.PUBLISHED,
        BlogPostModel.published_at.isnot(None),
        BlogPostModel.published_at <= datetime.utcnow()
    )
    
    # Если у поста есть теги, ищем по ним
    if current_post.tags:
        tag_conditions = []
        for tag in current_post.tags:
            tag_conditions.append(BlogPostModel.tags.contains([tag]))
        
        if tag_conditions:
            query = query.filter(or_(*tag_conditions))
    
    # Сортировка по дате публикации
    posts = query.order_by(BlogPostModel.published_at.desc().nullslast()).limit(limit).all()
    
    # Преобразуем в Pydantic схемы
    from schemas import BlogPostList
    
    post_schemas = []
    for post in posts:
        post_dict = {
            "id": post.id,
            "title": post.title,
            "subtitle": post.subtitle,
            "excerpt": post.excerpt,
            "slug": post.slug,
            "cover_image": post.cover_image,
            "published_at": post.published_at,
            "created_at": post.created_at,
            "status": post.status,
            "seo_score": post.seo_score,
            "word_count": post.word_count,
            "reading_time": post.reading_time,
            "tags": post.tags,
            "author_name": post.author.full_name if post.author else "Автор",
            "content": post.content
        }
        post_schemas.append(BlogPostList(**post_dict))
    
    return {
        "posts": post_schemas,
        "total": len(posts)
    }


@router.get("/tags")
def get_public_tags(
    db: Session = Depends(get_db),
) -> Any:
    """
    Получение всех тегов из опубликованных постов.
    """
    # Получаем все опубликованные посты
    published_posts = db.query(BlogPostModel).filter(
        BlogPostModel.status == BlogPostStatus.PUBLISHED,
        BlogPostModel.published_at.isnot(None),
        BlogPostModel.published_at <= datetime.utcnow()
    ).all()
    
    # Собираем все уникальные теги
    all_tags = set()
    for post in published_posts:
        if post.tags:
            all_tags.update(post.tags)
    
    # Сортируем теги по алфавиту
    sorted_tags = sorted(list(all_tags))
    
    return {
        "tags": sorted_tags,
        "total": len(sorted_tags)
    }


@router.get("/posts/{slug}/meta")
def get_post_meta(
    slug: str,
    db: Session = Depends(get_db),
) -> Any:
    """
    Получение SEO-метаданных поста.
    """
    post = db.query(BlogPostModel).filter(
        BlogPostModel.slug == slug,
        BlogPostModel.status == BlogPostStatus.PUBLISHED,
        BlogPostModel.published_at.isnot(None),
        BlogPostModel.published_at <= datetime.utcnow()
    ).first()
    
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    
    return {
        "title": post.meta_title or post.title,
        "description": post.meta_description or post.excerpt,
        "keywords": post.meta_keywords,
        "canonical_url": post.canonical_url,
        "og_title": post.og_title or post.title,
        "og_description": post.og_description or post.excerpt,
        "og_image": post.og_image or post.cover_image,
        "twitter_title": post.twitter_title or post.title,
        "twitter_description": post.twitter_description or post.excerpt,
        "twitter_image": post.twitter_image or post.cover_image,
        "json_ld": post.json_ld
    } 