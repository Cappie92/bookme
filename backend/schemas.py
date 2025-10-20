from datetime import datetime, time, date
from enum import Enum
from typing import List, Optional, Any

from pydantic import BaseModel, EmailStr, Field, field_validator

from models import BookingStatus, EditRequestStatus, OwnerType, UserRole, SalonMasterInvitationStatus


# Базовые схемы
class UserBase(BaseModel):
    email: EmailStr
    phone: str = Field(..., pattern=r"^\+?1?\d{9,15}$")
    full_name: str
    role: UserRole
    birth_date: Optional[date] = None


class UserCreate(UserBase):
    password: str
    role: UserRole


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    birth_date: Optional[date] = None


class User(UserBase):
    id: int
    role: UserRole
    is_active: bool
    is_verified: Optional[bool] = False
    is_always_free: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Схемы для салона
class SalonBase(BaseModel):
    name: str
    description: Optional[str] = None
    domain: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    logo: Optional[str] = None  # URL логотипа салона
    yandex_maps_widget: Optional[str] = None  # Виджет Яндекс.Карт
    city: str
    timezone: str
    is_active: Optional[bool] = True
    
    # Настройки оплаты
    payment_on_visit: Optional[bool] = True
    payment_advance: Optional[bool] = False
    
    # Настройки автоматизации ограничений
    missed_sessions_advance_payment_threshold: Optional[int] = Field(3, ge=1, le=100, description="Количество пропущенных сеансов для обязательной предоплаты")
    missed_sessions_blacklist_threshold: Optional[int] = Field(5, ge=1, le=100, description="Количество пропущенных сеансов для попадания в черный список")
    cancellation_grace_period_hours: Optional[int] = Field(24, ge=1, le=168, description="Время отмены без санкций (в часах)")


class SalonCreate(SalonBase):
    pass


class SalonUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    domain: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    logo: Optional[str] = None
    yandex_maps_widget: Optional[str] = None
    city: Optional[str] = None
    timezone: Optional[str] = None
    is_active: Optional[bool] = None
    
    # Настройки оплаты
    payment_on_visit: Optional[bool] = None
    payment_advance: Optional[bool] = None


class SalonPaymentUpdate(BaseModel):
    payment_on_visit: Optional[bool] = None
    payment_advance: Optional[bool] = None


class Salon(SalonBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Упрощенные схемы для создания профиля салона
class SalonCreateSimple(BaseModel):
    description: Optional[str] = None
    domain: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    city: str
    timezone: str


class SalonOut(BaseModel):
    id: int
    user_id: int
    name: str
    description: Optional[str] = None
    domain: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    working_hours: Optional[str] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    logo: Optional[str] = None
    yandex_maps_widget: Optional[str] = None
    city: Optional[str] = None
    timezone: Optional[str] = None
    
    # Настройки автоматизации ограничений
    missed_sessions_advance_payment_threshold: Optional[int] = None
    missed_sessions_blacklist_threshold: Optional[int] = None
    cancellation_grace_period_hours: Optional[int] = None
    is_active: Optional[bool] = True
    
    # Настройки оплаты
    payment_on_visit: Optional[bool] = True
    payment_advance: Optional[bool] = False
    
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Схемы для услуг
class ServiceBase(BaseModel):
    name: str
    description: Optional[str] = None
    duration: int
    price: float
    service_type: Optional[str] = "subscription"  # free, subscription, volume_based


class ServiceCreate(ServiceBase):
    salon_id: int
    indie_master_id: Optional[int] = None


class ServiceUpdate(ServiceBase):
    pass


class Service(ServiceBase):
    id: int
    salon_id: int
    indie_master_id: Optional[int]
    service_type: Optional[str] = "subscription"
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Услуги
class ServiceCreateSalon(BaseModel):
    name: str
    category_id: int
    price: float
    duration: int


class ServiceOut(BaseModel):
    id: int
    name: str
    category_id: int
    category_name: str
    price: float
    duration: int
    salon_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# Схемы для мастера
class MasterBase(BaseModel):
    bio: Optional[str] = None
    experience_years: Optional[int] = None
    name: str
    specialization: str
    experience: int
    phone: str
    email: EmailStr
    logo: Optional[str] = None  # URL логотипа мастера
    city: str
    timezone: str


class MasterCreate(MasterBase):
    services: List[int]  # список ID услуг
    salon_id: int


class MasterUpdate(MasterBase):
    services: Optional[List[int]] = None
    city: Optional[str] = None
    timezone: Optional[str] = None


class Master(MasterBase):
    id: int
    user_id: int
    salon_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MasterProfileUpdate(BaseModel):
    can_work_independently: Optional[bool] = None
    can_work_in_salon: Optional[bool] = None
    website: Optional[str] = None
    domain: Optional[str] = None
    logo: Optional[str] = None
    background_color: Optional[str] = None
    bio: Optional[str] = None
    experience_years: Optional[int] = None
    city: Optional[str] = None
    timezone: Optional[str] = None
    
    # Настройки автоматизации ограничений
    missed_sessions_advance_payment_threshold: Optional[int] = Field(3, ge=1, le=100, description="Количество пропущенных сеансов для обязательной предоплаты")
    missed_sessions_blacklist_threshold: Optional[int] = Field(5, ge=1, le=100, description="Количество пропущенных сеансов для попадания в черный список")
    cancellation_grace_period_hours: Optional[int] = Field(24, ge=1, le=168, description="Время отмены без санкций (в часах)")


# Схемы для мастера-индивидуала
class IndieMasterBase(MasterBase):
    domain: Optional[str] = None
    address: str
    
    # Настройки оплаты
    payment_on_visit: Optional[bool] = True
    payment_advance: Optional[bool] = False


class IndieMasterCreate(IndieMasterBase):
    services: List[int]


class IndieMasterUpdate(IndieMasterBase):
    services: Optional[List[int]] = None
    
    # Настройки автоматизации ограничений
    missed_sessions_advance_payment_threshold: Optional[int] = None
    missed_sessions_blacklist_threshold: Optional[int] = None
    cancellation_grace_period_hours: Optional[int] = None


class IndieMasterPaymentUpdate(BaseModel):
    payment_on_visit: Optional[bool] = None
    payment_advance: Optional[bool] = None


class IndieMaster(IndieMasterBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Схемы для расписания
class ScheduleBase(BaseModel):
    day_of_week: int
    start_time: datetime
    end_time: datetime
    is_available: bool = True


class ScheduleCreate(ScheduleBase):
    pass


class ScheduleUpdate(ScheduleBase):
    pass


class Schedule(ScheduleBase):
    id: int
    master_id: Optional[int]
    indie_master_id: Optional[int]

    class Config:
        from_attributes = True


# Схемы для бронирования
class BookingBase(BaseModel):
    service_id: int
    master_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    salon_id: Optional[int] = None
    branch_id: Optional[int] = None
    start_time: datetime
    end_time: datetime
    status: BookingStatus = BookingStatus.CREATED
    notes: Optional[str] = None
    
    # Информация об оплате
    payment_method: Optional[str] = None  # 'on_visit' или 'advance'
    payment_amount: Optional[float] = None  # Сумма к оплате


class BookingCreate(BookingBase):
    client_name: str  # Обязательное имя клиента
    service_name: str  # Обязательное название услуги
    service_duration: int  # Обязательная продолжительность услуги в минутах
    service_price: float  # Обязательная стоимость услуги


class BookingUpdate(BaseModel):
    service_id: Optional[int] = None
    master_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    salon_id: Optional[int] = None
    branch_id: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class BookingEditRequestBase(BaseModel):
    proposed_start: datetime
    proposed_end: datetime


class BookingEditRequestCreate(BookingEditRequestBase):
    booking_id: int


class BookingEditRequest(BookingEditRequestBase):
    id: int
    booking_id: int
    status: EditRequestStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookingEditRequestUpdate(BaseModel):
    status: EditRequestStatus


class Booking(BaseModel):
    id: int
    client_id: Optional[int] = None
    service_id: int
    master_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    salon_id: Optional[int] = None
    branch_id: Optional[int] = None
    start_time: datetime
    end_time: datetime
    status: BookingStatus
    notes: Optional[str] = None
    
    # Информация об оплате
    payment_method: Optional[str] = None
    payment_amount: Optional[float] = None
    is_paid: Optional[bool] = None
    
    created_at: datetime
    updated_at: datetime
    edit_requests: List[Any] = []  # Убираем циклическую зависимость
    
    # Дополнительные поля для отображения
    salon_name: Optional[str] = None
    master_name: Optional[str] = None
    service_name: Optional[str] = None
    branch_name: Optional[str] = None
    branch_address: Optional[str] = None

    class Config:
        from_attributes = True


# Схемы для блога
from models import BlogPostStatus

class BlogPostBase(BaseModel):
    title: str
    subtitle: Optional[str] = None
    slug: Optional[str] = None
    excerpt: Optional[str] = Field(None, max_length=160)
    content: str
    cover_image: Optional[str] = None
    cover_image_alt: Optional[str] = None
    tags: List[str] = []
    meta_title: Optional[str] = None
    meta_description: Optional[str] = Field(None, max_length=160)
    canonical_url: Optional[str] = None
    robots_noindex: bool = False
    robots_nofollow: bool = False
    og_title: Optional[str] = None
    og_description: Optional[str] = None
    og_image: Optional[str] = None
    twitter_title: Optional[str] = None
    twitter_description: Optional[str] = None
    twitter_image: Optional[str] = None
    json_ld: Optional[dict] = None
    status: BlogPostStatus = BlogPostStatus.DRAFT
    published_at: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    seo_score: Optional[int] = Field(None, ge=0, le=100)
    word_count: Optional[int] = None
    reading_time: Optional[int] = None
    keyword_density: Optional[dict] = None


class BlogPostCreate(BlogPostBase):
    pass


class BlogPostUpdate(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    slug: Optional[str] = None
    excerpt: Optional[str] = Field(None, max_length=160)
    content: Optional[str] = None
    cover_image: Optional[str] = None
    cover_image_alt: Optional[str] = None
    tags: Optional[List[str]] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = Field(None, max_length=160)
    canonical_url: Optional[str] = None
    robots_noindex: Optional[bool] = None
    robots_nofollow: Optional[bool] = None
    og_title: Optional[str] = None
    og_description: Optional[str] = None
    og_image: Optional[str] = None
    twitter_title: Optional[str] = None
    twitter_description: Optional[str] = None
    twitter_image: Optional[str] = None
    json_ld: Optional[dict] = None
    status: Optional[BlogPostStatus] = None
    published_at: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    seo_score: Optional[int] = Field(None, ge=0, le=100)
    word_count: Optional[int] = None
    reading_time: Optional[int] = None
    keyword_density: Optional[dict] = None


class BlogPost(BlogPostBase):
    id: int
    author_id: int
    created_at: datetime
    updated_at: datetime
    author_name: Optional[str] = None

    class Config:
        from_attributes = True


class BlogPostList(BaseModel):
    id: int
    title: str
    subtitle: Optional[str] = None
    slug: str
    excerpt: Optional[str] = None
    cover_image: Optional[str] = None
    status: BlogPostStatus
    published_at: Optional[datetime] = None
    created_at: datetime
    author_name: Optional[str] = None
    word_count: Optional[int] = None
    reading_time: Optional[int] = None
    content: str  # Добавляем поле для полного текста статьи

    class Config:
        from_attributes = True


class BlogPostSEO(BaseModel):
    seo_score: int = Field(..., ge=0, le=100)
    word_count: int
    reading_time: int
    keyword_density: dict
    suggestions: List[str] = []


class BlogPostPreview(BaseModel):
    html_content: str
    seo_analysis: BlogPostSEO


# Схемы для аутентификации
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None


class LoginRequest(BaseModel):
    phone: str
    password: str


class VerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)


# Схемы для статистики
class BookingStats(BaseModel):
    total_bookings: int
    completed_bookings: int
    cancelled_bookings: int
    revenue: float
    average_rating: Optional[float]


class MasterStats(BookingStats):
    master_id: int
    master_name: str


class SalonStats(BookingStats):
    salon_id: int
    salon_name: str
    masters_stats: List[MasterStats]


class UserStats(BaseModel):
    total_users: int
    active_users: int
    users_by_role: dict[UserRole, int]
    new_users_today: int
    new_users_this_week: int
    new_users_this_month: int


class AvailabilitySlotBase(BaseModel):
    day_of_week: int = Field(
        ..., ge=0, le=6, description="День недели (0-6, где 0 - понедельник)"
    )
    start_time: time
    end_time: time


class AvailabilitySlotCreate(AvailabilitySlotBase):
    owner_type: OwnerType
    owner_id: int


class AvailabilitySlot(AvailabilitySlotBase):
    id: int
    owner_type: OwnerType
    owner_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AdminStats(BaseModel):
    total_users: int
    total_salons: int
    total_masters: int
    total_bookings: int
    total_blog_posts: int
    new_users_today: int
    new_users_this_week: int
    new_users_this_month: int
    bookings_today: int
    bookings_this_week: int
    bookings_this_month: int
    average_booking_duration: float
    conversion_rate: float
    users_by_role: dict[str, int]
    weekly_activity: List[dict]
    top_salons: List[dict]
    last_updated: datetime


# Краткая схема для отображения бронирований в кабинете клиента
class BookingShort(BaseModel):
    id: int
    display_name: str  # Название салона или имя мастера
    service_name: str
    price: float
    date: datetime

    class Config:
        from_attributes = True


# Краткая схема для будущих бронирований
class BookingFutureShort(BaseModel):
    id: int
    salon_name: str
    master_name: str
    service_name: str
    price: float
    duration: int
    date: datetime
    start_time: datetime
    end_time: datetime
    status: Optional[str] = None
    branch_name: Optional[str] = None
    branch_address: Optional[str] = None
    # Добавляем недостающие поля для правильной работы фронтенда
    master_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    service_id: Optional[int] = None
    salon_id: Optional[int] = None
    branch_id: Optional[int] = None

    class Config:
        from_attributes = True


# Краткая схема для прошедших бронирований
class BookingPastShort(BaseModel):
    id: int
    salon_name: str
    master_name: str
    service_name: str
    price: float
    duration: int
    date: datetime
    start_time: datetime
    end_time: datetime
    status: Optional[str] = None
    branch_name: Optional[str] = None
    branch_address: Optional[str] = None
    # Добавляем недостающие поля для правильной работы фронтенда
    master_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    service_id: Optional[int] = None
    salon_id: Optional[int] = None
    branch_id: Optional[int] = None

    class Config:
        from_attributes = True


# Категории услуг
class ServiceCategoryCreate(BaseModel):
    name: str


class ServiceCategoryOut(BaseModel):
    id: int
    name: str
    salon_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6)


class SetPasswordRequest(BaseModel):
    password: str = Field(..., min_length=6)


class MasterScheduleSlot(BaseModel):
    schedule_date: date = Field(..., description="Конкретная дата")
    hour: int = Field(..., ge=0, le=23)
    minute: int = Field(..., ge=0, le=59)
    is_working: bool
    work_type: Optional[str] = Field(None, description="Тип работы: 'personal' или 'salon'")
    has_conflict: bool = Field(False, description="Есть ли конфликт с другой работой")
    conflict_type: Optional[str] = Field(None, description="Тип конфликта: 'salon_conflict' или 'personal_conflict'")


class MasterScheduleUpdate(BaseModel):
    slots: List[MasterScheduleSlot]


class MasterScheduleResponse(BaseModel):
    slots: List[MasterScheduleSlot]


# Схемы для категорий услуг мастера
class MasterServiceCategoryCreate(BaseModel):
    name: str


class MasterServiceCategoryOut(BaseModel):
    id: int
    name: str
    master_id: int
    created_at: datetime
    service_count: Optional[int] = 0

    class Config:
        from_attributes = True


# Схемы для услуг мастера
class MasterServiceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    duration: int
    price: float
    category_id: int


class MasterServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    duration: Optional[int] = None
    price: Optional[float] = None
    category_id: Optional[int] = None


class MasterServiceOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    duration: int
    price: float
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    master_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class InvitationResponse(BaseModel):
    response: str = Field(..., description="'accept' или 'decline'")


class InvitationOut(BaseModel):
    id: int
    salon_id: int
    salon_name: str
    salon_phone: str
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Схемы для модератора
class ModeratorPermissionsBase(BaseModel):
    can_view_users: bool = False
    can_edit_users: bool = False
    can_delete_users: bool = False
    can_ban_users: bool = False
    can_view_blog: bool = False
    can_create_blog: bool = False
    can_edit_blog: bool = False
    can_delete_blog: bool = False
    can_publish_blog: bool = False
    can_view_salons: bool = False
    can_edit_salons: bool = False
    can_delete_salons: bool = False
    can_view_masters: bool = False
    can_edit_masters: bool = False
    can_delete_masters: bool = False
    can_view_bookings: bool = False
    can_edit_bookings: bool = False
    can_delete_bookings: bool = False
    can_view_stats: bool = False
    can_view_settings: bool = False
    can_edit_settings: bool = False


class ModeratorPermissionsCreate(ModeratorPermissionsBase):
    pass


class ModeratorPermissionsUpdate(BaseModel):
    can_view_users: Optional[bool] = None
    can_edit_users: Optional[bool] = None
    can_delete_users: Optional[bool] = None
    can_ban_users: Optional[bool] = None
    can_view_blog: Optional[bool] = None
    can_create_blog: Optional[bool] = None
    can_edit_blog: Optional[bool] = None
    can_delete_blog: Optional[bool] = None
    can_publish_blog: Optional[bool] = None
    can_view_salons: Optional[bool] = None
    can_edit_salons: Optional[bool] = None
    can_delete_salons: Optional[bool] = None
    can_view_masters: Optional[bool] = None
    can_edit_masters: Optional[bool] = None
    can_delete_masters: Optional[bool] = None
    can_view_bookings: Optional[bool] = None
    can_edit_bookings: Optional[bool] = None
    can_delete_bookings: Optional[bool] = None
    can_view_stats: Optional[bool] = None
    can_view_settings: Optional[bool] = None
    can_edit_settings: Optional[bool] = None


class ModeratorPermissions(ModeratorPermissionsBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ModeratorCreate(BaseModel):
    email: EmailStr
    phone: str = Field(..., pattern=r"^\+?1?\d{9,15}$")
    full_name: str
    password: str
    permissions: ModeratorPermissionsCreate


class ModeratorUpdate(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    permissions: Optional[ModeratorPermissionsUpdate] = None


class ModeratorOut(BaseModel):
    id: int
    email: EmailStr
    phone: str
    full_name: str
    role: UserRole
    is_active: bool
    is_verified: bool
    created_at: datetime
    updated_at: datetime
    permissions: Optional[ModeratorPermissions] = None

    class Config:
        from_attributes = True


# Схемы для подписок
class SubscriptionBase(BaseModel):
    subscription_type: str  # 'salon' или 'master'
    status: str = 'pending'  # 'active', 'expired', 'pending', 'cancelled'
    salon_branches: int = 1
    salon_employees: int = 0
    master_bookings: int = 0
    valid_until: datetime
    price: float
    auto_renewal: bool = True
    payment_method: str = 'card'


class SubscriptionCreate(SubscriptionBase):
    user_id: int


class SubscriptionUpdate(BaseModel):
    status: Optional[str] = None
    salon_branches: Optional[int] = None
    salon_employees: Optional[int] = None
    master_bookings: Optional[int] = None
    valid_until: Optional[datetime] = None
    price: Optional[float] = None
    auto_renewal: Optional[bool] = None
    payment_method: Optional[str] = None


class Subscription(SubscriptionBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SubscriptionOut(BaseModel):
    id: int
    user_id: int
    subscription_type: str
    status: str
    salon_branches: int
    salon_employees: int
    master_bookings: int
    end_date: datetime  # Используем то же имя, что и в модели
    price: float
    auto_renewal: bool
    payment_method: str = "card"  # Дефолтное значение

    class Config:
        from_attributes = True


class SubscriptionUpgradeRequest(BaseModel):
    subscription_type: str
    salon_branches: Optional[int] = None
    salon_employees: Optional[int] = None
    master_bookings: Optional[int] = None
    payment_period: str = 'month'  # 'month' или 'year'


# Схемы для балансов
class BalanceBase(BaseModel):
    balance: int  # В копейках
    currency: str = "RUB"


class BalanceCreate(BalanceBase):
    user_id: int


class BalanceUpdate(BaseModel):
    balance: Optional[int] = None
    currency: Optional[str] = None


class Balance(BalanceBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BalanceOut(BaseModel):
    balance: float  # В рублях для отображения
    currency: str
    balance_kopecks: int  # В копейках для точности
    available_balance: Optional[float] = None
    reserved_total: Optional[float] = None

    class Config:
        from_attributes = True


class TransactionBase(BaseModel):
    amount: int  # В копейках
    transaction_type: str
    description: Optional[str] = None
    subscription_id: Optional[int] = None


class TransactionCreate(TransactionBase):
    user_id: int


class Transaction(TransactionBase):
    id: int
    user_id: int
    balance_before: int
    balance_after: int
    created_at: datetime

    class Config:
        from_attributes = True


class TransactionOut(BaseModel):
    id: int
    amount: float  # В рублях для отображения
    amount_kopecks: int  # В копейках для точности
    transaction_type: str
    description: Optional[str] = None
    subscription_id: Optional[int] = None
    balance_before: float
    balance_after: float
    created_at: datetime

    class Config:
        from_attributes = True


class DepositRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Сумма пополнения в рублях")
    payment_method: str = "card"


class SubscriptionStatusOut(BaseModel):
    subscription_id: Optional[int] = None
    status: str
    is_active: bool
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    days_remaining: int
    daily_rate: float
    total_price: float
    balance: float
    can_continue: bool
    next_charge_date: Optional[datetime] = None
    max_branches: int = 1  # Максимальное количество филиалов
    max_employees: int = 0  # Максимальное количество работников
    reserved_days: Optional[int] = 0

    class Config:
        from_attributes = True


# Схемы для филиалов салона
class SalonBranchBase(BaseModel):
    name: str
    address: Optional[str] = None
    description: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    working_hours: Optional[str] = None
    manager_id: Optional[int] = None
    is_active: bool = True
    
    # Поля для управления сайтом филиала
    url_slug: Optional[str] = None  # Название в URL
    yandex_map_embed: Optional[str] = None  # Интерактивный блок Яндекс карты
    background_color: Optional[str] = None  # Цвет фона страницы филиала
    logo_path: Optional[str] = None  # Путь к логотипу филиала
    use_salon_logo: Optional[bool] = False  # Использовать логотип организации


class SalonBranchCreate(SalonBranchBase):
    pass


class SalonBranchUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    working_hours: Optional[str] = None
    manager_id: Optional[int] = None
    is_active: Optional[bool] = None
    
    # Поля для управления сайтом филиала
    url_slug: Optional[str] = None
    yandex_map_embed: Optional[str] = None
    background_color: Optional[str] = None
    logo_path: Optional[str] = None
    use_salon_logo: Optional[bool] = None


class SalonBranch(SalonBranchBase):
    id: int
    salon_id: int
    manager_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SalonBranchOut(BaseModel):
    id: int
    salon_id: int
    name: str
    address: Optional[str] = None
    description: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    working_hours: Optional[str] = None
    manager_id: Optional[int] = None
    manager_name: Optional[str] = None
    is_active: bool
    
    # Поля для управления сайтом филиала
    url_slug: Optional[str] = None
    yandex_map_embed: Optional[str] = None
    background_color: Optional[str] = None
    logo_path: Optional[str] = None
    use_salon_logo: Optional[bool] = None
    
    created_at: datetime
    updated_at: datetime
    places_count: int = 0

    class Config:
        from_attributes = True


# Схемы для управления филиалами
class BranchManagerAssignment(BaseModel):
    branch_id: int
    manager_id: int


class BranchManagerInfo(BaseModel):
    id: int
    full_name: str
    phone: str
    email: Optional[str] = None
    role: UserRole


# Схемы для приглашений управляющих
class BranchManagerInvitationCreate(BaseModel):
    branch_id: int
    user_id: int
    message: Optional[str] = None


class BranchManagerInvitationUpdate(BaseModel):
    status: SalonMasterInvitationStatus
    message: Optional[str] = None


class BranchManagerInvitation(BaseModel):
    id: int
    salon_id: int
    branch_id: int
    user_id: int
    status: SalonMasterInvitationStatus
    message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    # Дополнительная информация
    salon_name: Optional[str] = None
    branch_name: Optional[str] = None
    user_name: Optional[str] = None
    
    class Config:
        from_attributes = True


# Схемы для мест салона
class SalonPlaceBase(BaseModel):
    name: str
    description: Optional[str] = None
    capacity: int = 1
    is_active: bool = True
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    width: float = 100
    height: float = 100


class SalonPlaceCreate(SalonPlaceBase):
    branch_id: Optional[int] = None


class SalonPlaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    capacity: Optional[int] = None
    is_active: Optional[bool] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    branch_id: Optional[int] = None


class SalonPlace(SalonPlaceBase):
    id: int
    salon_id: int
    branch_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SalonPlaceOut(BaseModel):
    id: int
    salon_id: int
    branch_id: Optional[int] = None
    branch_name: Optional[str] = None
    name: str
    description: Optional[str] = None
    capacity: int
    is_active: bool
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    width: float
    height: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Схемы для расписания мест
class PlaceScheduleSlot(BaseModel):
    place_id: int
    place_name: str
    date: date
    hour: int
    minute: int
    is_occupied: bool
    master_name: Optional[str] = None
    master_id: Optional[int] = None


class PlaceScheduleResponse(BaseModel):
    date: date
    slots: List[PlaceScheduleSlot]
    working_hours: dict


# Схемы для схемы салона
class SalonLayout(BaseModel):
    places: List[SalonPlaceOut]
    branches: List[SalonBranchOut]
    layout_data: Optional[dict] = None  # Дополнительные данные для схемы


class PlaceOccupancyStats(BaseModel):
    place_id: int
    place_name: str
    total_hours: int
    occupied_hours: int
    occupancy_rate: float
    masters_count: int


class EmailVerificationRequest(BaseModel):
    email: EmailStr


class EmailVerificationResponse(BaseModel):
    message: str
    success: bool


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetResponse(BaseModel):
    message: str
    success: bool


class VerifyEmailRequest(BaseModel):
    token: str


class VerifyEmailResponse(BaseModel):
    message: str
    success: bool
    user_id: Optional[int] = None


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6)


class ResetPasswordResponse(BaseModel):
    message: str
    success: bool
    user_id: Optional[int] = None


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ResendVerificationResponse(BaseModel):
    message: str
    success: bool


class PhoneVerificationRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\+?1?\d{9,15}$")


class PhoneVerificationResponse(BaseModel):
    message: str
    success: bool
    call_id: Optional[str] = None
    verification_number: Optional[str] = None


class VerifyPhoneRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\+?1?\d{9,15}$")
    call_id: str = Field(..., min_length=1)
    phone_digits: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")


class VerifyPhoneResponse(BaseModel):
    message: str
    success: bool
    user_id: Optional[int] = None


# Система лояльности

class LoyaltyDiscountType(str, Enum):
    QUICK = "quick"
    COMPLEX = "complex"
    PERSONAL = "personal"


class LoyaltyConditionType(str, Enum):
    # Быстрые скидки
    FIRST_VISIT = "first_visit"
    REGULAR_VISITS = "regular_visits"
    RETURNING_CLIENT = "returning_client"
    BIRTHDAY = "birthday"
    HAPPY_HOURS = "happy_hours"
    SERVICE_DISCOUNT = "service_discount"
    
    # Сложные скидки
    VISIT_COUNT = "visit_count"
    SPENT_AMOUNT = "spent_amount"
    DAYS_SINCE_LAST_VISIT = "days_since_last_visit"
    BIRTHDAY_RANGE = "birthday_range"
    TIME_SLOT = "time_slot"
    DAY_OF_WEEK = "day_of_week"
    SEASON = "season"
    ADVANCE_BOOKING = "advance_booking"
    SERVICE_CATEGORY = "service_category"
    SPECIFIC_SERVICE = "specific_service"
    MULTIPLE_SERVICES = "multiple_services"
    REFERRAL_COUNT = "referral_count"
    PROMO_CODE = "promo_code"
    SOCIAL_ACTIVITY = "social_activity"
    ONLINE_PAYMENT = "online_payment"
    PACKAGE_PURCHASE = "package_purchase"
    CHECK_AMOUNT = "check_amount"
    REPEAT_SERVICE = "repeat_service"


class LoyaltyDiscountBase(BaseModel):
    discount_type: LoyaltyDiscountType
    name: str
    description: Optional[str] = None
    discount_percent: float = Field(..., ge=0, le=100)
    max_discount_amount: Optional[float] = None
    conditions: dict
    is_active: bool = True
    priority: int = Field(default=1, ge=1, le=10)


class LoyaltyDiscountCreate(LoyaltyDiscountBase):
    pass


class LoyaltyDiscountUpdate(BaseModel):
    discount_type: Optional[LoyaltyDiscountType] = None
    name: Optional[str] = None
    description: Optional[str] = None
    discount_percent: Optional[float] = Field(None, ge=0, le=100)
    max_discount_amount: Optional[float] = None
    conditions: Optional[dict] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = Field(None, ge=1, le=10)


class LoyaltyDiscount(LoyaltyDiscountBase):
    id: int
    salon_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PersonalDiscountBase(BaseModel):
    client_phone: str = Field(..., pattern=r"^\+?1?\d{9,15}$")
    discount_percent: float = Field(..., ge=0, le=100)
    max_discount_amount: Optional[float] = None
    description: Optional[str] = None
    is_active: bool = True


class PersonalDiscountCreate(PersonalDiscountBase):
    pass


class PersonalDiscountUpdate(BaseModel):
    client_phone: Optional[str] = Field(None, pattern=r"^\+?1?\d{9,15}$")
    discount_percent: Optional[float] = Field(None, ge=0, le=100)
    max_discount_amount: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class PersonalDiscount(PersonalDiscountBase):
    id: int
    salon_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AppliedDiscountBase(BaseModel):
    discount_percent: float
    discount_amount: float
    applied_at: datetime


class AppliedDiscount(AppliedDiscountBase):
    id: int
    booking_id: int
    discount_id: Optional[int] = None
    personal_discount_id: Optional[int] = None

    class Config:
        from_attributes = True


class QuickDiscountTemplate(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    conditions: dict
    default_discount: float


class ComplexDiscountCondition(BaseModel):
    condition_type: LoyaltyConditionType
    parameters: dict
    discount_percent: float = Field(..., ge=0, le=100)
    max_discount_amount: Optional[float] = None


class LoyaltySystemStatus(BaseModel):
    quick_discounts: List[LoyaltyDiscount]
    complex_discounts: List[LoyaltyDiscount]
    personal_discounts: List[PersonalDiscount]
    total_discounts: int
    active_discounts: int


# Схемы для заметок клиентов к мастерам
class ClientMasterNoteBase(BaseModel):
    note: str = Field(..., max_length=400, description="Текст заметки (максимум 400 символов)")


class ClientMasterNoteCreate(ClientMasterNoteBase):
    master_id: int
    salon_id: int


class ClientMasterNoteUpdate(BaseModel):
    note: str = Field(..., max_length=400, description="Текст заметки (максимум 400 символов)")


class ClientMasterNote(ClientMasterNoteBase):
    id: int
    client_id: int
    master_id: int
    salon_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ClientMasterNoteOut(BaseModel):
    id: int
    master_id: int
    salon_id: int
    note: str
    created_at: datetime
    updated_at: datetime
    
    # Дополнительная информация
    master_name: Optional[str] = None
    salon_name: Optional[str] = None

    class Config:
        from_attributes = True


# Схемы для заметок клиентов о салонах
class ClientSalonNoteBase(BaseModel):
    note: str = Field(..., max_length=400, description="Текст заметки (максимум 400 символов)")


class ClientSalonNoteCreate(ClientSalonNoteBase):
    salon_id: int
    branch_id: Optional[int] = None


class ClientSalonNoteUpdate(BaseModel):
    note: str = Field(..., max_length=400, description="Текст заметки (максимум 400 символов)")


class ClientSalonNote(ClientSalonNoteBase):
    id: int
    client_id: int
    salon_id: int
    branch_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ClientSalonNoteOut(BaseModel):
    id: int
    salon_id: int
    branch_id: Optional[int] = None
    note: str
    created_at: datetime
    updated_at: datetime
    
    # Дополнительная информация
    salon_name: Optional[str] = None
    branch_name: Optional[str] = None

    class Config:
        from_attributes = True


# Схемы для ограничений клиентов
class ClientRestrictionBase(BaseModel):
    client_phone: str = Field(..., pattern=r"^\+?1?\d{9,15}$", description="Номер телефона клиента")
    restriction_type: str = Field(..., pattern="^(blacklist|advance_payment_only)$", description="Тип ограничения")
    reason: Optional[str] = Field(None, max_length=500, description="Причина ограничения")


class ClientRestrictionCreate(ClientRestrictionBase):
    pass


class ClientRestrictionUpdate(BaseModel):
    restriction_type: Optional[str] = Field(None, pattern="^(blacklist|advance_payment_only)$")
    reason: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class ClientRestriction(ClientRestrictionBase):
    id: int
    salon_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ClientRestrictionOut(BaseModel):
    id: int
    client_phone: str
    restriction_type: str
    reason: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ClientRestrictionList(BaseModel):
    blacklist: List[ClientRestrictionOut]
    advance_payment_only: List[ClientRestrictionOut]
    total_restrictions: int


# Схемы для типов расходов
class ExpenseTypeBase(BaseModel):
    name: str = Field(..., max_length=100, description="Название типа расхода")
    description: Optional[str] = Field(None, max_length=500, description="Описание типа расхода")
    color: Optional[str] = Field("#3B82F6", description="Цвет для отображения")


class ExpenseTypeCreate(ExpenseTypeBase):
    pass


class ExpenseTypeUpdate(ExpenseTypeBase):
    pass


class ExpenseType(ExpenseTypeBase):
    id: int
    salon_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    branch_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Схемы для расходов
class ExpenseBase(BaseModel):
    name: str = Field(..., max_length=200, description="Название расхода")
    expense_type_id: int = Field(..., description="ID типа расхода")
    amount_without_vat: float = Field(..., ge=0, description="Сумма до НДС")
    amount_with_vat: float = Field(..., ge=0, description="Сумма с НДС")
    is_vat_free: bool = Field(False, description="Без НДС")
    contractor: str = Field(..., max_length=200, description="Подрядчик")
    expense_month: date = Field(..., description="Месяц расхода")
    
    # Цикличность
    is_recurring: bool = Field(False, description="Циклический расход")
    recurring_frequency: Optional[str] = Field(None, pattern="^(monthly|quarterly|yearly)$", description="Частота")
    recurring_start_date: Optional[date] = Field(None, description="Дата начала цикличности")
    recurring_end_date: Optional[date] = Field(None, description="Дата окончания цикличности")


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    expense_type_id: Optional[int] = None
    amount_without_vat: Optional[float] = Field(None, ge=0)
    amount_with_vat: Optional[float] = Field(None, ge=0)
    is_vat_free: Optional[bool] = None
    contractor: Optional[str] = Field(None, max_length=200)
    expense_month: Optional[date] = None
    is_recurring: Optional[bool] = None
    recurring_frequency: Optional[str] = Field(None, pattern="^(monthly|quarterly|yearly)$")
    recurring_start_date: Optional[date] = None
    recurring_end_date: Optional[date] = None


class Expense(ExpenseBase):
    id: int
    salon_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    branch_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExpenseOut(BaseModel):
    id: int
    name: str
    expense_type: ExpenseType
    amount_without_vat: float
    amount_with_vat: float
    is_vat_free: bool
    contractor: str
    expense_month: date
    is_recurring: bool
    recurring_frequency: Optional[str] = None
    recurring_start_date: Optional[date] = None
    recurring_end_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Схемы для шаблонов расходов
class ExpenseTemplateBase(BaseModel):
    name: str = Field(..., max_length=100, description="Название шаблона")
    expense_name: str = Field(..., max_length=200, description="Название расхода")
    expense_type_id: int = Field(..., description="ID типа расхода")
    contractor: str = Field(..., max_length=200, description="Подрядчик")


class ExpenseTemplateCreate(ExpenseTemplateBase):
    pass


class ExpenseTemplateUpdate(ExpenseTemplateBase):
    pass


class ExpenseTemplate(ExpenseTemplateBase):
    id: int
    salon_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    branch_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Схемы для статистики расходов
class ExpenseStats(BaseModel):
    total_expenses: float
    total_without_vat: float
    total_vat: float
    expenses_count: int
    monthly_average: float
    top_expense_types: List[dict]
    recent_expenses: List[ExpenseOut]


class ExpenseList(BaseModel):
    expenses: List[ExpenseOut]
    total_amount: float
    total_count: int
    current_month_total: float


# Схемы для доходов
class IncomeBase(BaseModel):
    total_amount: float = Field(..., ge=0, description="Общая сумма услуги")
    master_earnings: float = Field(..., ge=0, description="Заработок мастера")
    salon_earnings: float = Field(..., ge=0, description="Доход салона")
    income_date: date = Field(..., description="Дата дохода")
    service_date: date = Field(..., description="Дата оказания услуги")


class IncomeCreate(IncomeBase):
    pass


class IncomeUpdate(BaseModel):
    total_amount: Optional[float] = Field(None, ge=0)
    master_earnings: Optional[float] = Field(None, ge=0)
    salon_earnings: Optional[float] = Field(None, ge=0)
    income_date: Optional[date] = None
    service_date: Optional[date] = None


class Income(IncomeBase):
    id: int
    salon_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    branch_id: Optional[int] = None
    booking_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class IncomeOut(BaseModel):
    id: int
    total_amount: float
    master_earnings: float
    salon_earnings: float
    income_date: date
    service_date: date
    booking_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Схемы для упущенной выгоды
class MissedRevenueBase(BaseModel):
    missed_amount: float = Field(..., ge=0, description="Упущенная выгода")
    service_price: float = Field(..., ge=0, description="Цена услуги")
    reason: Optional[str] = Field(None, max_length=500, description="Причина пропуска")
    missed_date: date = Field(..., description="Дата пропуска")
    booking_date: date = Field(..., description="Дата бронирования")


class MissedRevenueCreate(MissedRevenueBase):
    pass


class MissedRevenueUpdate(BaseModel):
    missed_amount: Optional[float] = Field(None, ge=0)
    service_price: Optional[float] = Field(None, ge=0)
    reason: Optional[str] = Field(None, max_length=500)
    missed_date: Optional[date] = None
    booking_date: Optional[date] = None


class MissedRevenue(MissedRevenueBase):
    id: int
    salon_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    branch_id: Optional[int] = None
    booking_id: int
    client_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MissedRevenueOut(BaseModel):
    id: int
    missed_amount: float
    service_price: float
    reason: Optional[str] = None
    missed_date: date
    booking_date: date
    booking_id: int
    client_id: int
    client_name: Optional[str] = None
    service_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Схемы для статистики бухгалтерии
class AccountingStats(BaseModel):
    total_income: float
    total_expenses: float
    net_profit: float
    total_missed_revenue: float
    income_count: int
    expense_count: int
    missed_revenue_count: int
    monthly_income: float
    monthly_expenses: float
    monthly_profit: float


class IncomeList(BaseModel):
    incomes: List[IncomeOut]
    total_amount: float
    total_count: int
    current_month_total: float


class MissedRevenueList(BaseModel):
    missed_revenues: List[MissedRevenueOut]
    total_amount: float
    total_count: int
    current_month_total: float


class ClientFavoriteBase(BaseModel):
    favorite_type: str
    favorite_name: str
    favorite_description: Optional[str] = None
    favorite_image: Optional[str] = None


class ClientFavoriteCreate(ClientFavoriteBase):
    salon_id: Optional[int] = None
    master_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    service_id: Optional[int] = None


class ClientFavorite(ClientFavoriteBase):
    id: int
    client_id: int
    salon_id: Optional[int] = None
    master_id: Optional[int] = None
    indie_master_id: Optional[int] = None
    service_id: Optional[int] = None
    created_at: datetime
    
    # Дополнительные данные
    salon: Optional[Salon] = None
    master: Optional[Master] = None
    indie_master: Optional[IndieMaster] = None
    service: Optional[Service] = None

    class Config:
        from_attributes = True


class FavoriteResponse(BaseModel):
    success: bool
    message: str
    favorite: Optional[ClientFavorite] = None

class ClientNoteBase(BaseModel):
    note_type: str  # 'salon', 'master', 'indie_master'
    target_id: int
    salon_note: Optional[str] = None
    master_note: Optional[str] = None

class ClientNoteCreate(ClientNoteBase):
    pass

class ClientNoteUpdate(BaseModel):
    salon_note: Optional[str] = None
    master_note: Optional[str] = None

class ClientNoteResponse(ClientNoteBase):
    id: int
    client_phone: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class ClientNoteRequest(BaseModel):
    note_type: str
    target_id: int
    salon_note: Optional[str] = None
    master_note: Optional[str] = None


# Схемы для всегда бесплатных пользователей
class AlwaysFreeLogOut(BaseModel):
    id: int
    user_id: int
    admin_user_id: int
    old_status: bool
    new_status: bool
    reason: Optional[str] = None
    created_at: datetime
    user_name: Optional[str] = None
    admin_name: Optional[str] = None

    class Config:
        from_attributes = True


class AlwaysFreeLogCreate(BaseModel):
    user_id: int
    old_status: bool
    new_status: bool
    reason: Optional[str] = None


class ServiceTypeUpdate(BaseModel):
    service_id: int
    service_type: str  # free, subscription, volume_based


class ServiceAccessCheck(BaseModel):
    service_id: int
    user_id: int


class ServiceAccessResult(BaseModel):
    allowed: bool
    reason: str
    service_type: str
    is_always_free: bool
    price: float


# Схемы для промо-кодов
class PromoCodeBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=50, pattern=r"^[A-Za-z0-9]+$")
    max_uses: int = Field(..., ge=1, le=999)
    expires_at: Optional[datetime] = None
    subscription_type: str = Field(..., pattern="^(salon|master)$")
    subscription_duration_days: int = Field(..., ge=1, le=364)
    is_active: bool = True


class PromoCodeCreate(PromoCodeBase):
    pass


class PromoCodeUpdate(BaseModel):
    max_uses: Optional[int] = Field(None, ge=1, le=999)
    expires_at: Optional[datetime] = None
    is_active: Optional[bool] = None


class PromoCode(PromoCodeBase):
    id: int
    used_count: int = 0
    created_at: datetime
    created_by: Optional[int] = None
    
    class Config:
        from_attributes = True


class PromoCodeOut(BaseModel):
    id: int
    code: str
    max_uses: int
    used_count: int
    expires_at: Optional[datetime] = None
    subscription_type: str
    subscription_duration_days: int
    is_active: bool
    created_at: datetime
    created_by: Optional[int] = None
    creator_name: Optional[str] = None
    remaining_uses: int
    is_expired: bool
    status: str  # active, expired, deactivated, fully_used

    class Config:
        from_attributes = True


class PromoCodeActivationBase(BaseModel):
    promo_code_id: int
    user_id: int
    subscription_start: datetime
    subscription_end: datetime
    paid_after_expiry: bool = False


class PromoCodeActivationCreate(PromoCodeActivationBase):
    pass


class PromoCodeActivation(PromoCodeActivationBase):
    id: int
    activated_at: datetime

    class Config:
        from_attributes = True


class PromoCodeActivationOut(BaseModel):
    id: int
    promo_code_id: int
    user_id: int
    activated_at: datetime
    subscription_start: datetime
    subscription_end: datetime
    paid_after_expiry: bool
    user_name: Optional[str] = None
    user_phone: Optional[str] = None
    promo_code: Optional[str] = None

    class Config:
        from_attributes = True


class PromoCodeAnalytics(BaseModel):
    total_activations: int
    unique_users: int
    conversion_rate: float
    total_revenue_after_expiry: float
    average_days_to_payment: Optional[float] = None
    activations_by_day: List[dict]
    top_users: List[dict]


class PromoCodeStats(BaseModel):
    total_promo_codes: int
    active_promo_codes: int
    expired_promo_codes: int
    deactivated_promo_codes: int
    total_activations: int
    total_revenue: float
    top_promo_codes: List[dict]
