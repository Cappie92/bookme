from datetime import datetime, timedelta
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_

from auth import get_current_active_user, require_admin, require_admin_or_moderator, require_moderator_permission
from database import get_db
from models import BlogPost as BlogPostModel, User, UserRole, Salon, Master, Booking, BookingStatus, BlogPostStatus, salon_masters, CalculatorSettings
from schemas import BlogPost, BlogPostCreate, BlogPostUpdate, BlogPostList, BlogPostPreview
from schemas import User as UserSchema
from schemas import UserStats, AdminStats

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin_or_moderator)],
)


@router.get("/users")
def get_users(
    skip: int = 0,
    limit: int = 100,
    role: UserRole = None,
    search: str = None,
    user_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_view_users")),
) -> Any:
    """
    Получение списка пользователей с фильтрацией.
    """
    query = db.query(User)
    
    # Фильтр по роли
    if role:
        if role == UserRole.INDIE:
            # Для независимых мастеров показываем как indie, так и master с can_work_independently=True
            query = query.join(Master, User.id == Master.user_id, isouter=True).filter(
                or_(
                    User.role == UserRole.INDIE,
                    and_(User.role == UserRole.MASTER, Master.can_work_independently == True)
                )
            )
        else:
            query = query.filter(User.role == role)
    
    # Фильтр по ID
    if user_id:
        query = query.filter(User.id == user_id)
    
    # Поиск по имени или email
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (User.full_name.ilike(search_term)) |
            (User.email.ilike(search_term)) |
            (User.phone.ilike(search_term))
        )
    
    # Сортировка по дате создания (новые сначала)
    query = query.order_by(User.created_at.desc())
    
    users = query.offset(skip).limit(limit).all()
    
    # Ручная сериализация для избежания проблем с Pydantic
    result = []
    for user in users:
        result.append({
            "id": user.id,
            "phone": user.phone,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "birth_date": user.birth_date,
            "is_active": user.is_active,
            "is_verified": user.is_verified,
            "is_always_free": user.is_always_free,
            "created_at": user.created_at,
            "updated_at": user.updated_at
        })
    
    return result


@router.get("/users/{user_id}")
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_view_users")),
) -> Any:
    """
    Получение информации о конкретном пользователе.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден"
        )
    
    return {
        "id": user.id,
        "phone": user.phone,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "birth_date": user.birth_date,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "created_at": user.created_at,
        "updated_at": user.updated_at
    }


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    user_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_edit_users")),
) -> Any:
    """
    Обновление информации о пользователе.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден"
        )
    
    # Нельзя изменить роль другого администратора (только суперадмин может)
    if user.role == UserRole.ADMIN and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для изменения администратора"
        )
    
    try:
        # Обновляем разрешенные поля
        allowed_fields = ['full_name', 'email', 'phone', 'role', 'is_active', 'is_verified', 'is_always_free']
        
        # Логируем изменение статуса "всегда бесплатно"
        old_always_free = user.is_always_free
        new_always_free = user_data.get('is_always_free', old_always_free)
        
        for field, value in user_data.items():
            if field in allowed_fields:
                if field == 'role' and value:
                    setattr(user, field, UserRole(value))
                else:
                    setattr(user, field, value)
        
        user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        
        # Логируем изменение статуса "всегда бесплатно" если оно произошло
        if old_always_free != new_always_free:
            from models import AlwaysFreeLog
            log_entry = AlwaysFreeLog(
                user_id=user_id,
                admin_user_id=current_user.id,
                old_status=old_always_free,
                new_status=new_always_free,
                reason=user_data.get('reason', 'Изменение статуса через админку')
            )
            db.add(log_entry)
            db.commit()
        
        return {
            "id": user.id,
            "phone": user.phone,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "birth_date": user.birth_date,
            "is_active": user.is_active,
            "is_verified": user.is_verified,
            "is_always_free": user.is_always_free,
            "created_at": user.created_at,
            "updated_at": user.updated_at
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при обновлении пользователя: {str(e)}"
        )


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_delete_users")),
) -> Any:
    """
    Удаление пользователя.
    """
    # Проверяем, что пользователь существует
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден"
        )
    
    # Нельзя удалить самого себя
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя удалить самого себя"
        )
    
    # Нельзя удалить другого администратора (только суперадмин может)
    if user.role == UserRole.ADMIN and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для удаления администратора"
        )
    
    try:
        # Удаляем все связанные данные пользователя
        # Бронирования
        bookings = db.query(Booking).filter(Booking.client_id == user.id).all()
        for booking in bookings:
            db.delete(booking)
        
        # Профили мастера/салона
        if user.master_profile:
            db.delete(user.master_profile)
        if user.salon_profile:
            db.delete(user.salon_profile)
        if user.indie_profile:
            db.delete(user.indie_profile)
        
        # Права модератора
        from models import ModeratorPermissions
        permissions = db.query(ModeratorPermissions).filter(ModeratorPermissions.user_id == user.id).first()
        if permissions:
            db.delete(permissions)
        
        # Удаляем самого пользователя
        db.delete(user)
        db.commit()
        
        return {"message": "Пользователь успешно удален"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при удалении пользователя: {str(e)}"
        )


@router.get("/stats/users", response_model=UserStats)
def get_user_stats(
    db: Session = Depends(get_db), current_user: User = Depends(require_moderator_permission("can_view_stats"))
) -> Any:
    """
    Получение статистики по пользователям.
    """
    now = datetime.utcnow()
    today = now.date()
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    # Общая статистика
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()

    # Пользователи по ролям
    users_by_role = {}
    for role in UserRole:
        if role == UserRole.INDIE:
            # Для независимых мастеров считаем как indie, так и master с can_work_independently=True
            count = db.query(User).join(Master, User.id == Master.user_id, isouter=True).filter(
                or_(
                    User.role == UserRole.INDIE,
                    and_(User.role == UserRole.MASTER, Master.can_work_independently == True)
                )
            ).count()
        else:
            count = db.query(User).filter(User.role == role).count()
        users_by_role[role] = count

    # Новые пользователи
    new_users_today = db.query(User).filter(User.created_at >= today).count()

    new_users_this_week = db.query(User).filter(User.created_at >= week_ago).count()

    new_users_this_month = db.query(User).filter(User.created_at >= month_ago).count()

    return {
        "total_users": total_users,
        "active_users": active_users,
        "users_by_role": users_by_role,
        "new_users_today": new_users_today,
        "new_users_this_week": new_users_this_week,
        "new_users_this_month": new_users_this_month,
    }


@router.get("/stats")
def get_admin_stats(
    db: Session = Depends(get_db), current_user: User = Depends(require_moderator_permission("can_view_stats"))
) -> Any:
    """
    Получение статистики для админ панели.
    """
    now = datetime.utcnow()
    today = now.date()
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    # Общая статистика
    total_users = db.query(User).count()
    total_salons = db.query(Salon).filter(Salon.is_active == True).count()
    total_masters = db.query(Master).count()
    total_bookings = db.query(Booking).count()
    total_blog_posts = db.query(BlogPostModel).filter(BlogPostModel.status == BlogPostStatus.PUBLISHED).count()

    # Новые пользователи
    new_users_today = db.query(User).filter(User.created_at >= today).count()
    new_users_this_week = db.query(User).filter(User.created_at >= week_ago).count()
    new_users_this_month = db.query(User).filter(User.created_at >= month_ago).count()

    # Бронирования
    bookings_today = db.query(Booking).filter(Booking.start_time >= today).count()
    bookings_this_week = db.query(Booking).filter(Booking.start_time >= week_ago).count()
    bookings_this_month = db.query(Booking).filter(Booking.start_time >= month_ago).count()

    # Средняя продолжительность записи
    bookings_with_duration = db.query(Booking).filter(
        Booking.start_time.isnot(None),
        Booking.end_time.isnot(None),
        Booking.end_time > Booking.start_time
    ).all()
    
    if bookings_with_duration:
        durations = []
        for booking in bookings_with_duration:
            duration_hours = (booking.end_time - booking.start_time).total_seconds() / 3600
            if duration_hours > 0:
                durations.append(duration_hours)
        
        average_booking_duration = round(sum(durations) / len(durations), 1) if durations else 0
    else:
        average_booking_duration = 0

    # Конверсия (отношение завершенных записей к общему количеству)
    total_completed = db.query(Booking).filter(Booking.status == BookingStatus.COMPLETED).count()
    conversion_rate = round((total_completed / total_bookings * 100) if total_bookings > 0 else 0, 1)

    # Пользователи по ролям
    users_by_role = {}
    for role in UserRole:
        if role == UserRole.INDIE:
            count = db.query(User).join(Master, User.id == Master.user_id, isouter=True).filter(
                or_(
                    User.role == UserRole.INDIE,
                    and_(User.role == UserRole.MASTER, Master.can_work_independently == True)
                )
            ).count()
        else:
            count = db.query(User).filter(User.role == role).count()
        users_by_role[role.value] = count

    # Активность за неделю
    weekly_activity = []
    for i in range(7):
        day_date = today - timedelta(days=i)
        day_bookings = db.query(Booking).filter(
            func.date(Booking.start_time) == day_date
        ).count()
        day_users = db.query(User).filter(
            func.date(User.created_at) == day_date
        ).count()
        
        day_names = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
        day_name = day_names[day_date.weekday()]
        
        weekly_activity.append({
            'day': day_name,
            'bookings': day_bookings,
            'users': day_users
        })
    
    # Разворачиваем массив, чтобы показать неделю в правильном порядке
    weekly_activity.reverse()

    # Топ салонов по активности
    top_salons_query = db.query(
        Salon.name,
        func.count(Booking.id).label('bookings'),
        func.count(salon_masters.c.master_id).label('masters')
    ).outerjoin(Booking, Salon.id == Booking.salon_id).outerjoin(salon_masters, Salon.id == salon_masters.c.salon_id).group_by(Salon.id, Salon.name).order_by(func.count(Booking.id).desc()).limit(5).all()

    top_salons = []
    for salon in top_salons_query:
        top_salons.append({
            'name': salon.name,
            'bookings': salon.bookings,
            'masters': salon.masters,
            'rating': 4.5  # Пока статичное значение, можно добавить реальный рейтинг
        })

    return {
        "total_users": total_users,
        "total_salons": total_salons,
        "total_masters": total_masters,
        "total_bookings": total_bookings,
        "total_blog_posts": total_blog_posts,
        "new_users_today": new_users_today,
        "new_users_this_week": new_users_this_week,
        "new_users_this_month": new_users_this_month,
        "bookings_today": bookings_today,
        "bookings_this_week": bookings_this_week,
        "bookings_this_month": bookings_this_month,
        "average_booking_duration": average_booking_duration,
        "conversion_rate": conversion_rate,
        "users_by_role": users_by_role,
        "weekly_activity": weekly_activity,
        "top_salons": top_salons,
        "last_updated": now
    }


@router.get("/dashboard/stats", response_model=AdminStats)
def get_dashboard_stats(
    db: Session = Depends(get_db), current_user: User = Depends(require_moderator_permission("can_view_stats"))
) -> Any:
    """
    Получение расширенной статистики для дашборда администратора.
    """
    now = datetime.utcnow()
    today = now.date()
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    # Общая статистика
    total_users = db.query(User).count()
    total_salons = db.query(Salon).filter(Salon.is_active == True).count()
    total_masters = db.query(Master).count()
    total_bookings = db.query(Booking).count()
    total_blog_posts = db.query(BlogPostModel).filter(BlogPostModel.status == BlogPostStatus.PUBLISHED).count()

    # Новые пользователи
    new_users_today = db.query(User).filter(User.created_at >= today).count()
    new_users_this_week = db.query(User).filter(User.created_at >= week_ago).count()
    new_users_this_month = db.query(User).filter(User.created_at >= month_ago).count()

    # Бронирования
    bookings_today = db.query(Booking).filter(Booking.start_time >= today).count()
    bookings_this_week = db.query(Booking).filter(Booking.start_time >= week_ago).count()
    bookings_this_month = db.query(Booking).filter(Booking.start_time >= month_ago).count()

    # Средняя продолжительность записи
    bookings_with_duration = db.query(Booking).filter(
        Booking.start_time.isnot(None),
        Booking.end_time.isnot(None),
        Booking.end_time > Booking.start_time
    ).all()
    
    if bookings_with_duration:
        durations = []
        for booking in bookings_with_duration:
            duration_hours = (booking.end_time - booking.start_time).total_seconds() / 3600
            if duration_hours > 0:
                durations.append(duration_hours)
        
        average_booking_duration = round(sum(durations) / len(durations), 1) if durations else 0
    else:
        average_booking_duration = 0

    # Конверсия (отношение завершенных записей к общему количеству)
    total_completed = db.query(Booking).filter(Booking.status == BookingStatus.COMPLETED).count()
    conversion_rate = round((total_completed / total_bookings * 100) if total_bookings > 0 else 0, 1)

    # Пользователи по ролям
    users_by_role = {}
    for role in UserRole:
        if role == UserRole.INDIE:
            count = db.query(User).join(Master, User.id == Master.user_id, isouter=True).filter(
                or_(
                    User.role == UserRole.INDIE,
                    and_(User.role == UserRole.MASTER, Master.can_work_independently == True)
                )
            ).count()
        else:
            count = db.query(User).filter(User.role == role).count()
        users_by_role[role.value] = count

    # Активность за неделю
    weekly_activity = []
    for i in range(7):
        day_date = today - timedelta(days=i)
        day_bookings = db.query(Booking).filter(
            func.date(Booking.start_time) == day_date
        ).count()
        day_users = db.query(User).filter(
            func.date(User.created_at) == day_date
        ).count()
        
        day_names = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
        day_name = day_names[day_date.weekday()]
        
        weekly_activity.append({
            'day': day_name,
            'bookings': day_bookings,
            'users': day_users
        })
    
    # Разворачиваем массив, чтобы показать неделю в правильном порядке
    weekly_activity.reverse()

    # Топ салонов по активности
    top_salons_query = db.query(
        Salon.name,
        func.count(Booking.id).label('bookings'),
        func.count(salon_masters.c.master_id).label('masters')
    ).outerjoin(Booking, Salon.id == Booking.salon_id).outerjoin(salon_masters, Salon.id == salon_masters.c.salon_id).group_by(Salon.id, Salon.name).order_by(func.count(Booking.id).desc()).limit(5).all()

    top_salons = []
    for salon in top_salons_query:
        top_salons.append({
            'name': salon.name,
            'bookings': salon.bookings,
            'masters': salon.masters,
            'rating': 4.5  # Пока статичное значение, можно добавить реальный рейтинг
        })

    return {
        "total_users": total_users,
        "total_salons": total_salons,
        "total_masters": total_masters,
        "total_bookings": total_bookings,
        "total_blog_posts": total_blog_posts,
        "new_users_today": new_users_today,
        "new_users_this_week": new_users_this_week,
        "new_users_this_month": new_users_this_month,
        "bookings_today": bookings_today,
        "bookings_this_week": bookings_this_week,
        "bookings_this_month": bookings_this_month,
        "average_booking_duration": average_booking_duration,
        "conversion_rate": conversion_rate,
        "users_by_role": users_by_role,
        "weekly_activity": weekly_activity,
        "top_salons": top_salons,
        "last_updated": now
    }


from utils.seo import generate_slug, analyze_seo, generate_json_ld, ping_search_engines, generate_meta_tags
from models import BlogPostStatus

# Управление блогом
@router.get("/blog/posts", response_model=List[BlogPostList])
def get_blog_posts(
    skip: int = 0,
    limit: int = 100,
    status: BlogPostStatus = None,
    search: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_view_blog")),
) -> Any:
    """
    Получение списка постов блога с фильтрацией.
    """
    query = db.query(BlogPostModel).join(User, BlogPostModel.author_id == User.id)
    
    # Фильтр по статусу
    if status:
        query = query.filter(BlogPostModel.status == status)
    
    # Поиск по заголовку или контенту
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (BlogPostModel.title.ilike(search_term)) |
            (BlogPostModel.content.ilike(search_term)) |
            (BlogPostModel.excerpt.ilike(search_term))
        )
    
    # Сортировка по дате создания (новые сначала)
    query = query.order_by(BlogPostModel.created_at.desc())
    
    posts = query.offset(skip).limit(limit).all()
    
    # Преобразуем в Pydantic схемы
    from schemas import BlogPostList
    result = []
    for post in posts:
        post_dict = {
            "id": post.id,
            "title": post.title,
            "subtitle": post.subtitle,
            "slug": post.slug,
            "excerpt": post.excerpt,
            "cover_image": post.cover_image,
            "status": post.status,
            "published_at": post.published_at,
            "created_at": post.created_at,
            "author_name": post.author.full_name if post.author else "Неизвестный автор",
            "word_count": post.word_count,
            "reading_time": post.reading_time,
            "content": post.content  # Добавляем полный контент
        }
        result.append(BlogPostList(**post_dict))
    
    return result


@router.get("/blog/posts/{post_id}", response_model=BlogPost)
def get_blog_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Получение конкретного поста блога.
    """
    post = db.query(BlogPostModel).filter(BlogPostModel.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
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
        "cover_image_alt": post.cover_image_alt,
        "tags": post.tags,
        "meta_title": post.meta_title,
        "meta_description": post.meta_description,
        "canonical_url": post.canonical_url,
        "robots_noindex": post.robots_noindex,
        "robots_nofollow": post.robots_nofollow,
        "og_title": post.og_title,
        "og_description": post.og_description,
        "og_image": post.og_image,
        "twitter_title": post.twitter_title,
        "twitter_description": post.twitter_description,
        "twitter_image": post.twitter_image,
        "json_ld": post.json_ld,
        "status": post.status,
        "published_at": post.published_at,
        "scheduled_at": post.scheduled_at,
        "seo_score": post.seo_score,
        "word_count": post.word_count,
        "reading_time": post.reading_time,
        "keyword_density": post.keyword_density,
        "author_id": post.author_id,
        "created_at": post.created_at,
        "updated_at": post.updated_at,
        "author_name": post.author.full_name if post.author else "Неизвестный автор"
    }
    return BlogPost(**post_dict)


@router.post("/blog/posts", response_model=BlogPost)
def create_blog_post(
    post_in: BlogPostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Создание нового поста блога.
    """
    # Генерируем slug если не указан
    if not post_in.slug:
        post_in.slug = generate_slug(post_in.title)
    
    # Проверяем уникальность slug
    existing_post = db.query(BlogPostModel).filter(BlogPostModel.slug == post_in.slug).first()
    if existing_post:
        counter = 1
        while db.query(BlogPostModel).filter(BlogPostModel.slug == f"{post_in.slug}-{counter}").first():
            counter += 1
        post_in.slug = f"{post_in.slug}-{counter}"
    
    # Анализируем SEO
    seo_analysis = analyze_seo(post_in.content, post_in.title, post_in.meta_description)
    
    # Создаем объект модели
    post = BlogPostModel(
        title=post_in.title,
        subtitle=post_in.subtitle,
        slug=post_in.slug,
        excerpt=post_in.excerpt,
        content=post_in.content,
        cover_image=post_in.cover_image,
        cover_image_alt=post_in.cover_image_alt,
        tags=post_in.tags,
        meta_title=post_in.meta_title,
        meta_description=post_in.meta_description,
        canonical_url=post_in.canonical_url,
        robots_noindex=post_in.robots_noindex,
        robots_nofollow=post_in.robots_nofollow,
        og_title=post_in.og_title,
        og_description=post_in.og_description,
        og_image=post_in.og_image,
        twitter_title=post_in.twitter_title,
        twitter_description=post_in.twitter_description,
        twitter_image=post_in.twitter_image,
        json_ld=post_in.json_ld,
        status=post_in.status,
        published_at=post_in.published_at,
        scheduled_at=post_in.scheduled_at,
        author_id=current_user.id,
        seo_score=seo_analysis["seo_score"],
        word_count=seo_analysis["word_count"],
        reading_time=seo_analysis["reading_time"],
        keyword_density=seo_analysis["keyword_density"]
    )
    
    db.add(post)
    db.commit()
    db.refresh(post)
    
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
        "cover_image_alt": post.cover_image_alt,
        "tags": post.tags,
        "meta_title": post.meta_title,
        "meta_description": post.meta_description,
        "canonical_url": post.canonical_url,
        "robots_noindex": post.robots_noindex,
        "robots_nofollow": post.robots_nofollow,
        "og_title": post.og_title,
        "og_description": post.og_description,
        "og_image": post.og_image,
        "twitter_title": post.twitter_title,
        "twitter_description": post.twitter_description,
        "twitter_image": post.twitter_image,
        "json_ld": post.json_ld,
        "status": post.status,
        "published_at": post.published_at,
        "scheduled_at": post.scheduled_at,
        "seo_score": post.seo_score,
        "word_count": post.word_count,
        "reading_time": post.reading_time,
        "keyword_density": post.keyword_density,
        "author_id": post.author_id,
        "created_at": post.created_at,
        "updated_at": post.updated_at,
        "author_name": post.author.full_name if post.author else "Неизвестный автор"
    }
    return BlogPost(**post_dict)


@router.put("/blog/posts/{post_id}", response_model=BlogPost)
def update_blog_post(
    post_id: int,
    post_in: BlogPostUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Обновление поста блога.
    """
    post = db.query(BlogPostModel).filter(BlogPostModel.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Обновляем поля
    update_data = post_in.dict(exclude_unset=True)
    
    # Если изменился заголовок и не указан slug, генерируем новый
    if "title" in update_data and not update_data.get("slug"):
        update_data["slug"] = generate_slug(update_data["title"])
    
    # Если изменился контент, обновляем SEO анализ
    if "content" in update_data or "title" in update_data or "meta_description" in update_data:
        content = update_data.get("content", post.content)
        title = update_data.get("title", post.title)
        meta_description = update_data.get("meta_description", post.meta_description)
        
        seo_analysis = analyze_seo(content, title, meta_description)
        update_data.update({
            "seo_score": seo_analysis["seo_score"],
            "word_count": seo_analysis["word_count"],
            "reading_time": seo_analysis["reading_time"],
            "keyword_density": seo_analysis["keyword_density"]
        })
    
    # Обновляем JSON-LD если изменились основные поля
    if any(field in update_data for field in ["title", "excerpt", "cover_image", "published_at"]):
        update_data["json_ld"] = generate_json_ld(post)
    
    for field, value in update_data.items():
        setattr(post, field, value)

    db.commit()
    db.refresh(post)
    
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
        "cover_image_alt": post.cover_image_alt,
        "tags": post.tags,
        "meta_title": post.meta_title,
        "meta_description": post.meta_description,
        "canonical_url": post.canonical_url,
        "robots_noindex": post.robots_noindex,
        "robots_nofollow": post.robots_nofollow,
        "og_title": post.og_title,
        "og_description": post.og_description,
        "og_image": post.og_image,
        "twitter_title": post.twitter_title,
        "twitter_description": post.twitter_description,
        "twitter_image": post.twitter_image,
        "json_ld": post.json_ld,
        "status": post.status,
        "published_at": post.published_at,
        "scheduled_at": post.scheduled_at,
        "seo_score": post.seo_score,
        "word_count": post.word_count,
        "reading_time": post.reading_time,
        "keyword_density": post.keyword_density,
        "author_id": post.author_id,
        "created_at": post.created_at,
        "updated_at": post.updated_at,
        "author_name": post.author.full_name if post.author else "Неизвестный автор"
    }
    return BlogPost(**post_dict)


@router.delete("/blog/posts/{post_id}")
def delete_blog_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Удаление поста блога.
    """
    post = db.query(BlogPostModel).filter(BlogPostModel.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    db.delete(post)
    db.commit()
    return {"message": "Post deleted successfully"}


@router.post("/blog/posts/{post_id}/publish")
def publish_blog_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Публикация поста блога.
    """
    post = db.query(BlogPostModel).filter(BlogPostModel.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    post.status = BlogPostStatus.PUBLISHED
    post.published_at = datetime.utcnow()
    
    # Генерируем JSON-LD
    post.json_ld = generate_json_ld(post)
    
    db.commit()
    
    # Отправляем ping в поисковые системы
    sitemap_url = "https://appointo.ru/sitemap.xml"
    ping_results = ping_search_engines(sitemap_url)
    
    return {
        "message": "Post published successfully",
        "ping_results": ping_results
    }


@router.post("/blog/posts/{post_id}/schedule")
def schedule_blog_post(
    post_id: int,
    scheduled_at: datetime,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Планирование публикации поста блога.
    """
    post = db.query(BlogPostModel).filter(BlogPostModel.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    post.status = BlogPostStatus.SCHEDULED
    post.scheduled_at = scheduled_at
    
    db.commit()
    
    return {"message": "Post scheduled successfully"}


@router.get("/blog/posts/{post_id}/preview", response_model=BlogPostPreview)
def preview_blog_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Предварительный просмотр поста блога.
    """
    post = db.query(BlogPostModel).filter(BlogPostModel.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Генерируем HTML контент (здесь можно добавить Markdown to HTML конвертацию)
    html_content = post.content  # Пока возвращаем как есть
    
    # Анализируем SEO
    seo_analysis = analyze_seo(post.content, post.title, post.meta_description)
    
    return {
        "html_content": html_content,
        "seo_analysis": seo_analysis
    }


@router.get("/blog/tags")
def get_blog_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Получение всех тегов блога.
    """
    # Получаем все теги из всех постов
    all_tags = set()
    posts = db.query(BlogPostModel).all()
    
    for post in posts:
        if post.tags:
            all_tags.update(post.tags)
    
    return {"tags": sorted(list(all_tags))}


# API для калькулятора
@router.get("/calculator/settings")
def get_calculator_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Any:
    """
    Получение настроек калькулятора.
    """
    settings = db.query(CalculatorSettings).first()
    
    if not settings:
        # Создаем настройки по умолчанию
        settings = CalculatorSettings(
            salon_base_rate=5000,
            salon_branch_pricing={
                "1": 0,
                "2": 1000,
                "3": 2000,
                "4-7": 3000,
                "8+": 5000
            },
            salon_employee_pricing={
                "5": 0,
                "10": 500,
                "15": 1000,
                "20": 1500,
                "25": 2000,
                "30": 2500
            },
            master_base_rate=2000,
            master_booking_pricing={
                "До 100": 10.0,
                "101-150": 8.0,
                "151+": 6.0
            }
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    
    return {
        "salon_base_rate": settings.salon_base_rate,
        "salon_branch_pricing": settings.salon_branch_pricing,
        "salon_employee_pricing": settings.salon_employee_pricing,
        "master_base_rate": settings.master_base_rate,
        "master_booking_pricing": settings.master_booking_pricing
    }


@router.put("/calculator/settings")
def update_calculator_settings(
    settings_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Any:
    """
    Обновление настроек калькулятора.
    """
    settings = db.query(CalculatorSettings).first()
    
    if not settings:
        settings = CalculatorSettings()
        db.add(settings)
    
    # Обновляем настройки
    if "salon_base_rate" in settings_data:
        settings.salon_base_rate = settings_data["salon_base_rate"]
    if "salon_branch_pricing" in settings_data:
        settings.salon_branch_pricing = settings_data["salon_branch_pricing"]
    if "salon_employee_pricing" in settings_data:
        settings.salon_employee_pricing = settings_data["salon_employee_pricing"]
    if "master_base_rate" in settings_data:
        settings.master_base_rate = settings_data["master_base_rate"]
    if "master_booking_pricing" in settings_data:
        settings.master_booking_pricing = settings_data["master_booking_pricing"]
    
    settings.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(settings)
    
    return {
        "salon_base_rate": settings.salon_base_rate,
        "salon_branch_pricing": settings.salon_branch_pricing,
        "salon_employee_pricing": settings.salon_employee_pricing,
        "master_base_rate": settings.master_base_rate,
        "master_booking_pricing": settings.master_booking_pricing
    }


@router.post("/calculator/calculate")
def calculate_price(
    calculation_data: dict,
    db: Session = Depends(get_db),
) -> Any:
    """
    Расчет стоимости на основе настроек калькулятора.
    """
    settings = db.query(CalculatorSettings).first()
    
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Настройки калькулятора не найдены"
        )
    
    client_type = calculation_data.get("clientType")
    
    if client_type == "salon":
        # Расчет для салона
        branch_count = calculation_data.get("branchCount", "1")
        employee_count = calculation_data.get("employeeCount", 5)
        
        # Базовая ставка
        base_price = settings.salon_base_rate
        
        # Наценка за филиалы (последовательное суммирование)
        branch_price = 0
        if branch_count == "1":
            branch_price = 0  # Первый филиал входит в базовую цену
        elif branch_count == "2":
            branch_price = settings.salon_branch_pricing.get("2", 0)  # Доплата за второй филиал
        elif branch_count == "3":
            branch_price = settings.salon_branch_pricing.get("2", 0) + settings.salon_branch_pricing.get("3", 0)  # Доплата за 2-й + 3-й
        elif branch_count == "4-7":
            branch_price = settings.salon_branch_pricing.get("2", 0) + settings.salon_branch_pricing.get("3", 0) + settings.salon_branch_pricing.get("4-7", 0)  # Доплата за 2-й + 3-й + 4-7-й
        elif branch_count == "8+":
            branch_price = settings.salon_branch_pricing.get("2", 0) + settings.salon_branch_pricing.get("3", 0) + settings.salon_branch_pricing.get("4-7", 0) + settings.salon_branch_pricing.get("8+", 0)  # Доплата за все
        
        # Наценка за работников (умножаем на количество работников)
        employee_price_per_employee = 0
        employee_counts = sorted([int(k) for k in settings.salon_employee_pricing.keys()])
        
        # Ищем подходящий тариф для количества работников
        for count in employee_counts:
            if employee_count <= count:
                employee_price_per_employee = settings.salon_employee_pricing[str(count)]
                break
        else:
            # Если больше максимального, берем последнее значение
            employee_price_per_employee = settings.salon_employee_pricing[str(employee_counts[-1])]
        
        employee_price = employee_price_per_employee * employee_count
        
        total_price = base_price + branch_price + employee_price
        
        return {
            "monthly_price": total_price,
            "yearly_price": int(total_price * 12 * 0.8),  # Скидка 20%
            "breakdown": {
                "base_rate": base_price,
                "branch_price": branch_price,
                "employee_price": employee_price,
                "employee_count": employee_count,
                "available_employee_counts": employee_counts
            }
        }
    
    elif client_type == "individual":
        # Расчет для мастера
        monthly_bookings = calculation_data.get("monthlyBookings", "До 100")
        
        # Базовая ставка
        base_price = settings.master_base_rate
        
        # Стоимость пакета бронирований
        booking_price_per_unit = float(settings.master_booking_pricing.get(monthly_bookings, 10.0))
        
        # Максимальное количество бронирований в пакете
        max_bookings = {
            "До 100": 100,
            "101-150": 150,
            "151+": 200
        }.get(monthly_bookings, 100)
        
        booking_package_price = booking_price_per_unit * max_bookings
        
        total_price = base_price + booking_package_price
        
        return {
            "monthly_price": int(total_price),
            "yearly_price": int(total_price * 12 * 0.8),  # Скидка 20%
            "breakdown": {
                "base_rate": base_price,
                "booking_package_price": int(booking_package_price),
                "booking_price_per_unit": booking_price_per_unit,
                "max_bookings": max_bookings
            }
        }
    
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный тип клиента"
        )


# API для управления услугами
@router.get("/services")
def get_services(
    skip: int = 0,
    limit: int = 100,
    service_type: str = None,
    search: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_view_blog")),  # Используем существующее право
) -> Any:
    """Получение списка услуг с фильтрацией по типу"""
    from models import Service
    
    query = db.query(Service)
    
    # Фильтр по типу услуги
    if service_type:
        query = query.filter(Service.service_type == service_type)
    
    # Поиск по названию
    if search:
        search_term = f"%{search}%"
        query = query.filter(Service.name.ilike(search_term))
    
    services = query.offset(skip).limit(limit).all()
    
    result = []
    for service in services:
        result.append({
            "id": service.id,
            "name": service.name,
            "description": service.description,
            "duration": service.duration,
            "price": service.price,
            "service_type": service.service_type or "subscription",
            "salon_id": service.salon_id,
            "indie_master_id": service.indie_master_id,
            "created_at": service.created_at
        })
    
    return result


@router.put("/services/{service_id}/type")
def update_service_type(
    service_id: int,
    service_type_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_edit_blog")),  # Используем существующее право
) -> Any:
    """Обновление типа услуги"""
    from models import Service
    
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Услуга не найдена"
        )
    
    new_type = service_type_data.get('service_type')
    if new_type not in ['free', 'subscription', 'volume_based']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный тип услуги. Допустимые значения: free, subscription, volume_based"
        )
    
    service.service_type = new_type
    db.commit()
    db.refresh(service)
    
    return {
        "id": service.id,
        "name": service.name,
        "service_type": service.service_type,
        "message": "Тип услуги обновлен"
    }


@router.post("/services/check-access")
def check_service_access(
    access_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_view_users")),
) -> Any:
    """Проверка доступа пользователя к услуге"""
    from utils.subscription_limits import check_service_access
    
    service_id = access_data.get('service_id')
    user_id = access_data.get('user_id')
    
    if not service_id or not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Требуются service_id и user_id"
        )
    
    result = check_service_access(db, user_id, service_id)
    return result


# API для логов всегда бесплатно
@router.get("/always-free-logs")
def get_always_free_logs(
    skip: int = 0,
    limit: int = 100,
    user_id: int = None,
    admin_user_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_view_users")),
) -> Any:
    """Получение логов изменений статуса 'всегда бесплатно'"""
    from models import AlwaysFreeLog
    
    query = db.query(AlwaysFreeLog)
    
    # Фильтры
    if user_id:
        query = query.filter(AlwaysFreeLog.user_id == user_id)
    if admin_user_id:
        query = query.filter(AlwaysFreeLog.admin_user_id == admin_user_id)
    
    # Сортировка по дате (новые сначала)
    query = query.order_by(AlwaysFreeLog.created_at.desc())
    
    logs = query.offset(skip).limit(limit).all()
    
    result = []
    for log in logs:
        # Получаем имена пользователей
        user = db.query(User).filter(User.id == log.user_id).first()
        admin = db.query(User).filter(User.id == log.admin_user_id).first()
        
        result.append({
            "id": log.id,
            "user_id": log.user_id,
            "admin_user_id": log.admin_user_id,
            "old_status": log.old_status,
            "new_status": log.new_status,
            "reason": log.reason,
            "created_at": log.created_at,
            "user_name": user.full_name if user else "Неизвестный пользователь",
            "admin_name": admin.full_name if admin else "Неизвестный администратор"
        })
    
    return result


@router.get("/always-free-stats")
def get_always_free_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_view_users")),
) -> Any:
    """Получение статистики по всегда бесплатным пользователям"""
    from models import AlwaysFreeLog
    
    # Общее количество всегда бесплатных пользователей
    always_free_count = db.query(User).filter(User.is_always_free == True).count()
    
    # Общее количество пользователей
    total_users = db.query(User).count()
    
    # Количество изменений за последние 30 дней
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    recent_changes = db.query(AlwaysFreeLog).filter(
        AlwaysFreeLog.created_at >= thirty_days_ago
    ).count()
    
    # Последние изменения
    recent_logs = db.query(AlwaysFreeLog).order_by(
        AlwaysFreeLog.created_at.desc()
    ).limit(5).all()
    
    recent_changes_list = []
    for log in recent_logs:
        user = db.query(User).filter(User.id == log.user_id).first()
        admin = db.query(User).filter(User.id == log.admin_user_id).first()
        
        recent_changes_list.append({
            "id": log.id,
            "user_name": user.full_name if user else "Неизвестный пользователь",
            "admin_name": admin.full_name if admin else "Неизвестный администратор",
            "old_status": log.old_status,
            "new_status": log.new_status,
            "created_at": log.created_at
        })
    
    return {
        "always_free_count": always_free_count,
        "total_users": total_users,
        "always_free_percentage": round((always_free_count / total_users * 100), 2) if total_users > 0 else 0,
        "recent_changes_count": recent_changes,
        "recent_changes": recent_changes_list
    }


# API для промо-кодов
@router.post("/promo-codes")
def create_promo_code(
    promo_code_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_create_promo_codes")),
) -> Any:
    """Создание нового промо-кода"""
    from models import PromoCode, SubscriptionType
    from schemas import PromoCodeCreate
    
    # Валидация данных
    try:
        promo_code = PromoCodeCreate(**promo_code_data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ошибка валидации: {str(e)}"
        )
    
    # Проверяем уникальность кода
    existing_code = db.query(PromoCode).filter(PromoCode.code == promo_code.code).first()
    if existing_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Промо-код с таким кодом уже существует"
        )
    
    # Создаем промо-код
    db_promo_code = PromoCode(
        code=promo_code.code,
        max_uses=promo_code.max_uses,
        expires_at=promo_code.expires_at,
        subscription_type=SubscriptionType(promo_code.subscription_type),
        subscription_duration_days=promo_code.subscription_duration_days,
        is_active=promo_code.is_active,
        created_by=current_user.id
    )
    
    db.add(db_promo_code)
    db.commit()
    db.refresh(db_promo_code)
    
    return {
        "id": db_promo_code.id,
        "code": db_promo_code.code,
        "max_uses": db_promo_code.max_uses,
        "used_count": db_promo_code.used_count,
        "expires_at": db_promo_code.expires_at,
        "subscription_type": db_promo_code.subscription_type.value,
        "subscription_duration_days": db_promo_code.subscription_duration_days,
        "is_active": db_promo_code.is_active,
        "created_at": db_promo_code.created_at,
        "created_by": db_promo_code.created_by,
        "message": "Промо-код успешно создан"
    }


@router.get("/promo-codes")
def get_promo_codes(
    skip: int = 0,
    limit: int = 100,
    subscription_type: str = None,
    is_active: bool = None,
    search: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_view_promo_codes")),
) -> Any:
    """Получение списка промо-кодов с фильтрацией"""
    from models import PromoCode, SubscriptionType
    
    query = db.query(PromoCode)
    
    # Фильтры
    if subscription_type:
        query = query.filter(PromoCode.subscription_type == SubscriptionType(subscription_type))
    
    if is_active is not None:
        query = query.filter(PromoCode.is_active == is_active)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(PromoCode.code.ilike(search_term))
    
    # Сортировка по дате создания (новые сначала)
    query = query.order_by(PromoCode.created_at.desc())
    
    promo_codes = query.offset(skip).limit(limit).all()
    
    result = []
    for promo_code in promo_codes:
        # Получаем имя создателя
        creator = db.query(User).filter(User.id == promo_code.created_by).first()
        
        # Определяем статус
        now = datetime.utcnow()
        if not promo_code.is_active:
            status = "deactivated"
        elif promo_code.expires_at and promo_code.expires_at < now:
            status = "expired"
        elif promo_code.used_count >= promo_code.max_uses:
            status = "fully_used"
        else:
            status = "active"
        
        result.append({
            "id": promo_code.id,
            "code": promo_code.code,
            "max_uses": promo_code.max_uses,
            "used_count": promo_code.used_count,
            "expires_at": promo_code.expires_at,
            "subscription_type": promo_code.subscription_type.value,
            "subscription_duration_days": promo_code.subscription_duration_days,
            "is_active": promo_code.is_active,
            "created_at": promo_code.created_at,
            "created_by": promo_code.created_by,
            "creator_name": creator.full_name if creator else "Неизвестный",
            "remaining_uses": promo_code.max_uses - promo_code.used_count,
            "is_expired": promo_code.expires_at and promo_code.expires_at < now,
            "status": status
        })
    
    return result


@router.get("/promo-codes/{promo_code_id}")
def get_promo_code(
    promo_code_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_view_promo_codes")),
) -> Any:
    """Получение информации о конкретном промо-коде"""
    from models import PromoCode
    
    promo_code = db.query(PromoCode).filter(PromoCode.id == promo_code_id).first()
    if not promo_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Промо-код не найден"
        )
    
    # Получаем имя создателя
    creator = db.query(User).filter(User.id == promo_code.created_by).first()
    
    # Определяем статус
    now = datetime.utcnow()
    if not promo_code.is_active:
        status = "deactivated"
    elif promo_code.expires_at and promo_code.expires_at < now:
        status = "expired"
    elif promo_code.used_count >= promo_code.max_uses:
        status = "fully_used"
    else:
        status = "active"
    
    return {
        "id": promo_code.id,
        "code": promo_code.code,
        "max_uses": promo_code.max_uses,
        "used_count": promo_code.used_count,
        "expires_at": promo_code.expires_at,
        "subscription_type": promo_code.subscription_type.value,
        "subscription_duration_days": promo_code.subscription_duration_days,
        "is_active": promo_code.is_active,
        "created_at": promo_code.created_at,
        "created_by": promo_code.created_by,
        "creator_name": creator.full_name if creator else "Неизвестный",
        "remaining_uses": promo_code.max_uses - promo_code.used_count,
        "is_expired": promo_code.expires_at and promo_code.expires_at < now,
        "status": status
    }


@router.put("/promo-codes/{promo_code_id}")
def update_promo_code(
    promo_code_id: int,
    promo_code_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_edit_promo_codes")),
) -> Any:
    """Редактирование промо-кода (только срок и лимиты)"""
    from models import PromoCode
    
    promo_code = db.query(PromoCode).filter(PromoCode.id == promo_code_id).first()
    if not promo_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Промо-код не найден"
        )
    
    # Обновляем только разрешенные поля
    allowed_fields = ['max_uses', 'expires_at', 'is_active']
    
    for field, value in promo_code_data.items():
        if field in allowed_fields:
            if field == 'max_uses' and value < promo_code.used_count:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Максимальное количество использований не может быть меньше уже использованного"
                )
            setattr(promo_code, field, value)
    
    db.commit()
    db.refresh(promo_code)
    
    return {
        "id": promo_code.id,
        "code": promo_code.code,
        "max_uses": promo_code.max_uses,
        "used_count": promo_code.used_count,
        "expires_at": promo_code.expires_at,
        "subscription_type": promo_code.subscription_type.value,
        "subscription_duration_days": promo_code.subscription_duration_days,
        "is_active": promo_code.is_active,
        "message": "Промо-код успешно обновлен"
    }


@router.delete("/promo-codes/{promo_code_id}")
def delete_promo_code(
    promo_code_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_delete_promo_codes")),
) -> Any:
    """Удаление промо-кода"""
    from models import PromoCode, PromoCodeActivation
    
    promo_code = db.query(PromoCode).filter(PromoCode.id == promo_code_id).first()
    if not promo_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Промо-код не найден"
        )
    
    # Удаляем все активации промо-кода
    activations = db.query(PromoCodeActivation).filter(PromoCodeActivation.promo_code_id == promo_code_id).all()
    for activation in activations:
        db.delete(activation)
    
    # Удаляем сам промо-код
    db.delete(promo_code)
    db.commit()
    
    return {"message": "Промо-код успешно удален"}


@router.post("/promo-codes/{promo_code_id}/deactivate")
def deactivate_promo_code(
    promo_code_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_edit_promo_codes")),
) -> Any:
    """Деактивация промо-кода (устанавливает max_uses = used_count)"""
    from models import PromoCode
    
    promo_code = db.query(PromoCode).filter(PromoCode.id == promo_code_id).first()
    if not promo_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Промо-код не найден"
        )
    
    # Устанавливаем max_uses равным used_count
    promo_code.max_uses = promo_code.used_count
    promo_code.is_active = False
    
    db.commit()
    db.refresh(promo_code)
    
    return {
        "id": promo_code.id,
        "code": promo_code.code,
        "max_uses": promo_code.max_uses,
        "used_count": promo_code.used_count,
        "is_active": promo_code.is_active,
        "message": "Промо-код успешно деактивирован"
    }


@router.get("/promo-codes/{promo_code_id}/analytics")
def get_promo_code_analytics(
    promo_code_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_view_promo_codes")),
) -> Any:
    """Получение аналитики по промо-коду"""
    from models import PromoCode, PromoCodeActivation
    
    promo_code = db.query(PromoCode).filter(PromoCode.id == promo_code_id).first()
    if not promo_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Промо-код не найден"
        )
    
    # Получаем все активации
    activations = db.query(PromoCodeActivation).filter(
        PromoCodeActivation.promo_code_id == promo_code_id
    ).all()
    
    # Базовая статистика
    total_activations = len(activations)
    unique_users = len(set(activation.user_id for activation in activations))
    
    # Конверсия в платных пользователей (заглушка)
    conversion_rate = 0.0  # TODO: Реализовать реальную логику
    total_revenue_after_expiry = 0.0  # TODO: Реализовать реальную логику
    average_days_to_payment = None  # TODO: Реализовать реальную логику
    
    # Активации по дням (за последние 30 дней)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    activations_by_day = []
    
    for i in range(30):
        day = datetime.utcnow() - timedelta(days=i)
        day_activations = len([
            a for a in activations 
            if a.activated_at.date() == day.date()
        ])
        activations_by_day.append({
            "date": day.date().isoformat(),
            "activations": day_activations
        })
    
    # Топ пользователей
    user_activations = {}
    for activation in activations:
        user_id = activation.user_id
        if user_id not in user_activations:
            user_activations[user_id] = 0
        user_activations[user_id] += 1
    
    top_users = []
    for user_id, count in sorted(user_activations.items(), key=lambda x: x[1], reverse=True)[:10]:
        user = db.query(User).filter(User.id == user_id).first()
        top_users.append({
            "user_id": user_id,
            "user_name": user.full_name if user else "Неизвестный",
            "activations": count
        })
    
    return {
        "total_activations": total_activations,
        "unique_users": unique_users,
        "conversion_rate": conversion_rate,
        "total_revenue_after_expiry": total_revenue_after_expiry,
        "average_days_to_payment": average_days_to_payment,
        "activations_by_day": activations_by_day,
        "top_users": top_users
    }


@router.get("/promo-codes/stats")
def get_promo_codes_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator_permission("can_view_promo_codes")),
) -> Any:
    """Получение общей статистики по промо-кодам"""
    from models import PromoCode, PromoCodeActivation
    
    # Общая статистика
    total_promo_codes = db.query(PromoCode).count()
    active_promo_codes = db.query(PromoCode).filter(PromoCode.is_active == True).count()
    
    now = datetime.utcnow()
    expired_promo_codes = db.query(PromoCode).filter(
        PromoCode.expires_at < now
    ).count()
    
    deactivated_promo_codes = db.query(PromoCode).filter(
        PromoCode.is_active == False
    ).count()
    
    # Статистика активаций
    total_activations = db.query(PromoCodeActivation).count()
    total_revenue = 0.0  # TODO: Реализовать реальную логику
    
    # Топ промо-кодов по активациям
    top_promo_codes_query = db.query(
        PromoCode.code,
        PromoCode.subscription_type,
        func.count(PromoCodeActivation.id).label('activations')
    ).outerjoin(
        PromoCodeActivation, PromoCode.id == PromoCodeActivation.promo_code_id
    ).group_by(
        PromoCode.id, PromoCode.code, PromoCode.subscription_type
    ).order_by(
        func.count(PromoCodeActivation.id).desc()
    ).limit(10).all()
    
    top_promo_codes = []
    for promo_code in top_promo_codes_query:
        top_promo_codes.append({
            "code": promo_code.code,
            "subscription_type": promo_code.subscription_type.value,
            "activations": promo_code.activations
        })
    
    return {
        "total_promo_codes": total_promo_codes,
        "active_promo_codes": active_promo_codes,
        "expired_promo_codes": expired_promo_codes,
        "deactivated_promo_codes": deactivated_promo_codes,
        "total_activations": total_activations,
        "total_revenue": total_revenue,
        "top_promo_codes": top_promo_codes
    }
