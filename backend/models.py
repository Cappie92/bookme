import enum
from datetime import datetime, timezone, date, time

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Date,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    Time,
    JSON,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship

from database import Base


class UserRole(str, enum.Enum):
    CLIENT = "client"
    MASTER = "master"
    SALON = "salon"
    INDIE = "indie"
    ADMIN = "admin"
    MODERATOR = "moderator"


class OwnerType(str, enum.Enum):
    MASTER = "master"
    INDIE_MASTER = "indie_master"
    SALON = "salon"


class ServiceType(str, enum.Enum):
    FREE = "free"  # Бесплатно
    SUBSCRIPTION = "subscription"  # Входит в подписку
    VOLUME_BASED = "volume_based"  # Оплата за объем


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    phone = Column(String, unique=True)
    full_name = Column(String)
    hashed_password = Column(String)
    role = Column(Enum(UserRole))
    birth_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    is_phone_verified = Column(Boolean, default=False)
    phone_verification_code = Column(String, nullable=True)
    phone_verification_expires = Column(DateTime, nullable=True)
    password_reset_code = Column(String, nullable=True)
    password_reset_expires = Column(DateTime, nullable=True)
    is_always_free = Column(Boolean, default=False)  # Всегда бесплатно - все платные функции доступны
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    master_profile = relationship("Master", back_populates="user", uselist=False)
    salon_profile = relationship("Salon", back_populates="user", uselist=False)
    indie_profile = relationship("IndieMaster", back_populates="user", uselist=False)
    bookings = relationship("Booking", back_populates="client", foreign_keys="Booking.client_id")
    moderator_permissions = relationship("ModeratorPermissions", back_populates="user", uselist=False)
    subscriptions = relationship("Subscription", back_populates="user")
    balance = relationship("UserBalance", back_populates="user", uselist=False)
    balance_transactions = relationship("BalanceTransaction", back_populates="user")
    branch_manager_invitations = relationship("BranchManagerInvitation", back_populates="user")
    master_notes = relationship("ClientMasterNote", back_populates="client")
    salon_notes = relationship("ClientSalonNote", back_populates="client")
    missed_revenues = relationship("MissedRevenue", back_populates="client")
    favorites = relationship("ClientFavorite", back_populates="client")
    subscription_price_snapshots = relationship("SubscriptionPriceSnapshot", back_populates="user")


class Salon(Base):
    __tablename__ = "salons"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String)
    description = Column(Text)
    domain = Column(String, unique=True)
    
    # Дополнительная информация
    phone = Column(String)
    email = Column(String)
    address = Column(String, nullable=True)  # Адрес салона
    working_hours = Column(Text, nullable=True)  # JSON с расписанием работы
    website = Column(String, nullable=True)
    instagram = Column(String, nullable=True)
    logo = Column(String, nullable=True)  # URL логотипа салона
    yandex_maps_widget = Column(Text, nullable=True)  # Виджет Яндекс.Карт
    city = Column(String, nullable=True)  # Город работы салона
    timezone = Column(String, default="Europe/Moscow")  # Часовой пояс (UTC+3 по умолчанию)
    is_active = Column(Boolean, default=True)
    
    # Настройки оплаты
    payment_on_visit = Column(Boolean, default=True)  # Оплата при посещении
    payment_advance = Column(Boolean, default=False)  # Предоплата при бронировании
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="salon_profile")
    services = relationship("Service", back_populates="salon")
    masters = relationship("Master", secondary="salon_masters", back_populates="salons")
    bookings = relationship("Booking", back_populates="salon")
    categories = relationship("ServiceCategory", back_populates="salon")
    invitations = relationship("SalonMasterInvitation", back_populates="salon")
    branches = relationship("SalonBranch")
    places = relationship("SalonPlace")
    manager_invitations = relationship("BranchManagerInvitation", back_populates="salon")
    loyalty_discounts = relationship("LoyaltyDiscount")
    personal_discounts = relationship("PersonalDiscount")
    client_restrictions = relationship("ClientRestriction")
    expense_types = relationship("ExpenseType")
    expenses = relationship("Expense")
    expense_templates = relationship("ExpenseTemplate")
    
    # Настройки автоматизации ограничений
    missed_sessions_advance_payment_threshold = Column(Integer, default=3)  # Количество пропущенных сеансов для обязательной предоплаты
    missed_sessions_blacklist_threshold = Column(Integer, default=5)  # Количество пропущенных сеансов для попадания в черный список
    cancellation_grace_period_hours = Column(Integer, default=24)  # Время отмены без санкций (в часах)


class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    description = Column(Text)
    duration = Column(Integer)  # в минутах
    price = Column(Float)
    service_type = Column(Enum(ServiceType), default=ServiceType.SUBSCRIPTION)  # Тип услуги
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)
    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    category_id = Column(Integer, ForeignKey("service_categories.id"), nullable=True)

    salon = relationship("Salon", back_populates="services")
    indie_master = relationship("IndieMaster", back_populates="services")
    masters = relationship(
        "Master", secondary="master_services", back_populates="services"
    )
    bookings = relationship("Booking", back_populates="service")
    category = relationship("ServiceCategory", back_populates="services")


class Master(Base):
    __tablename__ = "masters"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    bio = Column(Text)
    experience_years = Column(Integer)
    can_work_independently = Column(Boolean, default=False)  # Самостоятельная работа
    can_work_in_salon = Column(Boolean, default=True)  # Работа в салоне
    website = Column(String, nullable=True)  # Сайт мастера
    domain = Column(String, unique=True, nullable=True)  # Поддомен для независимой работы
    logo = Column(String, nullable=True)  # URL логотипа мастера
    photo = Column(String, nullable=True)  # URL фото мастера
    use_photo_as_logo = Column(Boolean, default=False)  # Использовать фото как логотип
    address = Column(String, nullable=True)  # Адрес мастера
    background_color = Column(String, default="#ffffff")  # Цвет фона страницы мастера
    city = Column(String, nullable=True)  # Город работы мастера
    timezone = Column(String, default="Europe/Moscow")  # Часовой пояс (UTC+3 по умолчанию)
    branch_id = Column(Integer, ForeignKey("salon_branches.id"), nullable=True)  # Филиал салона
    auto_confirm_bookings = Column(Boolean, default=False)  # Автоматическое подтверждение записей
    site_description = Column(Text, nullable=True)  # Описание для страницы записи
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="master_profile")
    salons = relationship("Salon", secondary="salon_masters", back_populates="masters")
    services = relationship(
        "Service", secondary="master_services", back_populates="masters"
    )
    service_categories = relationship("MasterServiceCategory", back_populates="master")
    master_services = relationship("MasterService", back_populates="master")
    bookings = relationship("Booking", back_populates="master")
    schedule = relationship("MasterSchedule", back_populates="master")
    page_modules = relationship("MasterPageModule", back_populates="master")
    invitations = relationship("SalonMasterInvitation", back_populates="master")
    client_notes = relationship("ClientMasterNote", back_populates="master")
    restriction_rules = relationship("ClientRestrictionRule", back_populates="master")
    payment_settings = relationship("MasterPaymentSettings", back_populates="master", uselist=False)


class IndieMaster(Base):
    __tablename__ = "indie_masters"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    bio = Column(Text)
    experience_years = Column(Integer)
    domain = Column(String, unique=True)
    address = Column(String, nullable=True)  # Адрес независимого мастера
    city = Column(String, nullable=True)  # Город работы мастера
    timezone = Column(String, default="Europe/Moscow")  # Часовой пояс (UTC+3 по умолчанию)
    
    # Настройки оплаты
    payment_on_visit = Column(Boolean, default=True)  # Оплата при посещении
    payment_advance = Column(Boolean, default=False)  # Предоплата при бронировании
    
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="indie_profile")
    services = relationship("Service", back_populates="indie_master")
    bookings = relationship("Booking", back_populates="indie_master")
    schedule = relationship("IndieMasterSchedule", back_populates="indie_master")
    client_restrictions = relationship("ClientRestriction")
    expense_types = relationship("ExpenseType")
    expenses = relationship("Expense")
    expense_templates = relationship("ExpenseTemplate")


class BookingStatus(str, enum.Enum):
    CREATED = "created"  # было PENDING
    AWAITING_CONFIRMATION = "awaiting_confirmation"  # новый
    COMPLETED = "completed"  # было CONFIRMED
    CANCELLED = "cancelled"
    CANCELLED_BY_CLIENT_EARLY = "cancelled_by_client_early"  # Отменено клиентом заранее
    CANCELLED_BY_CLIENT_LATE = "cancelled_by_client_late"    # Отменено клиентом менее чем за 12 часов
    AWAITING_PAYMENT = "awaiting_payment"  # Ожидает оплаты
    PAYMENT_EXPIRED = "payment_expired"    # Время оплаты истекло


class EditRequestStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id"))
    service_id = Column(Integer, ForeignKey("services.id"))
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=True)
    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)
    branch_id = Column(Integer, ForeignKey("salon_branches.id"), nullable=True)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    status = Column(String(16), default=BookingStatus.CREATED.value)
    notes = Column(Text, nullable=True)
    
    # Информация об оплате
    payment_method = Column(String, nullable=True)  # 'on_visit' или 'advance'
    payment_deadline = Column(DateTime, nullable=True)  # Дедлайн для оплаты (30 минут)
    payment_amount = Column(Float, nullable=True)  # Сумма к оплате
    is_paid = Column(Boolean, default=False)  # Оплачено ли бронирование
    
    # Информация об отмене
    cancelled_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    cancellation_reason = Column(String(255), nullable=True)
    
    # Информация о лояльности
    loyalty_points_used = Column(Integer, nullable=True, default=0)  # Количество списанных баллов
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client = relationship("User", back_populates="bookings", foreign_keys=[client_id])
    service = relationship("Service", back_populates="bookings")
    master = relationship("Master", back_populates="bookings")
    indie_master = relationship("IndieMaster", back_populates="bookings")
    salon = relationship("Salon", back_populates="bookings")
    branch = relationship("SalonBranch", overlaps="expense_types,expenses,expense_templates")
    edit_requests = relationship("BookingEditRequest", back_populates="booking")
    applied_discounts = relationship("AppliedDiscount")
    income = relationship("Income", back_populates="booking", uselist=False)
    missed_revenue = relationship("MissedRevenue", back_populates="booking", uselist=False)
    cancelled_by = relationship("User", foreign_keys=[cancelled_by_user_id])


class MasterSchedule(Base):
    __tablename__ = "master_schedules"

    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"), index=True)  # Индекс для поиска по мастеру
    salon_id = Column(Integer, ForeignKey("salons.id"), index=True)    # Индекс для поиска по салону
    branch_id = Column(Integer, ForeignKey("salon_branches.id"), nullable=True)
    place_id = Column(Integer, ForeignKey("salon_places.id"), nullable=True)
    date = Column(Date, index=True)  # Индекс для поиска по дате
    start_time = Column(Time)
    end_time = Column(Time)
    is_available = Column(Boolean, default=True, index=True)  # Индекс для фильтрации активных записей
    
    # Составной индекс для частых запросов: мастер + дата + активность
    __table_args__ = (
        Index('ix_master_schedule_master_date_active', 'master_id', 'date', 'is_available'),
        Index('ix_master_schedule_salon_date_active', 'salon_id', 'date', 'is_available'),
    )

    master = relationship("Master", back_populates="schedule")
    salon = relationship("Salon", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    branch = relationship("SalonBranch", back_populates="master_schedules")
    place = relationship("SalonPlace", back_populates="master_schedules")


class MasterScheduleSettings(Base):
    __tablename__ = "master_schedule_settings"

    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"))
    salon_id = Column(Integer, ForeignKey("salons.id"))
    schedule_type = Column(String)  # 'fixed' или 'individual'
    fixed_schedule = Column(JSON, nullable=True)  # JSON с настройками фиксированного расписания
    individual_schedule = Column(JSON, nullable=True)  # JSON с настройками индивидуального расписания
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    master = relationship("Master")
    salon = relationship("Salon", overlaps="client_restrictions,expense_types,expenses,expense_templates")


class IndieMasterSchedule(Base):
    __tablename__ = "indie_master_schedules"

    id = Column(Integer, primary_key=True, index=True)
    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"))
    day_of_week = Column(Integer)  # 0-6 (пн-вс)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    is_available = Column(Boolean, default=True)

    indie_master = relationship("IndieMaster", back_populates="schedule")


class BlogPostStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"


class BlogPost(Base):
    __tablename__ = "blog_posts"

    id = Column(Integer, primary_key=True, index=True)
    
    # Основные поля
    title = Column(String, nullable=False)
    subtitle = Column(String, nullable=True)
    slug = Column(String, unique=True, nullable=False, index=True)
    excerpt = Column(String(160), nullable=True)  # Краткий анонс до 160 символов
    content = Column(Text, nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Обложка
    cover_image = Column(String, nullable=True)  # URL изображения
    cover_image_alt = Column(String, nullable=True)  # Alt текст для обложки
    
    # Теги (JSON массив)
    tags = Column(JSON, default=list)
    
    # SEO поля
    meta_title = Column(String, nullable=True)
    meta_description = Column(String(160), nullable=True)
    canonical_url = Column(String, nullable=True)
    robots_noindex = Column(Boolean, default=False)
    robots_nofollow = Column(Boolean, default=False)
    
    # Open Graph
    og_title = Column(String, nullable=True)
    og_description = Column(String, nullable=True)
    og_image = Column(String, nullable=True)
    
    # Twitter Cards
    twitter_title = Column(String, nullable=True)
    twitter_description = Column(String, nullable=True)
    twitter_image = Column(String, nullable=True)
    
    # JSON-LD схема
    json_ld = Column(JSON, nullable=True)
    
    # Статус и даты
    status = Column(Enum(BlogPostStatus), default=BlogPostStatus.DRAFT)
    published_at = Column(DateTime, nullable=True)
    scheduled_at = Column(DateTime, nullable=True)
    
    # SEO анализ
    seo_score = Column(Integer, nullable=True)  # 0-100
    word_count = Column(Integer, nullable=True)
    reading_time = Column(Integer, nullable=True)  # в минутах
    keyword_density = Column(JSON, nullable=True)  # JSON с ключевыми словами
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    author = relationship("User")


# Join таблицы
salon_masters = Table(
    "salon_masters",
    Base.metadata,
    Column("salon_id", Integer, ForeignKey("salons.id")),
    Column("master_id", Integer, ForeignKey("masters.id")),
)

master_services = Table(
    "master_services",
    Base.metadata,
    Column("master_id", Integer, ForeignKey("masters.id")),
    Column("service_id", Integer, ForeignKey("services.id")),
)


class BookingEditRequest(Base):
    __tablename__ = "booking_edit_requests"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"))
    proposed_start = Column(DateTime)
    proposed_end = Column(DateTime)
    status = Column(Enum(EditRequestStatus), default=EditRequestStatus.PENDING)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    booking = relationship("Booking", back_populates="edit_requests")


class AvailabilitySlot(Base):
    __tablename__ = "availability_slots"

    id = Column(Integer, primary_key=True, index=True)
    owner_type = Column(Enum(OwnerType))
    owner_id = Column(Integer)  # ID мастера или салона
    day_of_week = Column(Integer)  # 1=Понедельник, 2=Вторник, 3=Среда, 4=Четверг, 5=Пятница, 6=Суббота, 7=Воскресенье
    start_time = Column(Time)
    end_time = Column(Time)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# class ClientFavorites(Base):
#     __tablename__ = "client_favorites"

#     client_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
#     favorites = Column(JSON, nullable=False, default=list)
#     updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

#     client = relationship("User")


class ServiceCategory(Base):
    __tablename__ = "service_categories"

    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"))
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    salon = relationship("Salon", back_populates="categories")
    services = relationship("Service", back_populates="category")


class MasterServiceCategory(Base):
    __tablename__ = "master_service_categories"

    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"))
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    master = relationship("Master", back_populates="service_categories")
    services = relationship("MasterService", back_populates="category")


class MasterService(Base):
    __tablename__ = "master_services_list"

    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"))
    category_id = Column(Integer, ForeignKey("master_service_categories.id"))
    name = Column(String, nullable=False)
    description = Column(Text)
    duration = Column(Integer)  # в минутах
    price = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

    master = relationship("Master", back_populates="master_services")
    category = relationship("MasterServiceCategory", back_populates="services")


class SalonMasterInvitationStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"

class SalonMasterInvitation(Base):
    __tablename__ = "salon_master_invitations"
    id = Column(Integer, primary_key=True)
    salon_id = Column(Integer, ForeignKey("salons.id"))
    master_id = Column(Integer, ForeignKey("masters.id"))
    status = Column(Enum(SalonMasterInvitationStatus), default=SalonMasterInvitationStatus.PENDING)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    salon = relationship("Salon", back_populates="invitations")
    master = relationship("Master", back_populates="invitations")


class BranchManagerInvitation(Base):
    __tablename__ = "branch_manager_invitations"
    
    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("salon_branches.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(Enum(SalonMasterInvitationStatus), default=SalonMasterInvitationStatus.PENDING)
    message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    salon = relationship("Salon", back_populates="manager_invitations")
    branch = relationship("SalonBranch", back_populates="manager_invitations")
    user = relationship("User", back_populates="branch_manager_invitations")


class SalonMasterServiceSettings(Base):
    __tablename__ = "salon_master_service_settings"

    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"))
    salon_id = Column(Integer, ForeignKey("salons.id"))
    service_id = Column(Integer, ForeignKey("services.id"))
    is_active = Column(Boolean, default=True)
    master_payment_type = Column(String, default="rub")  # 'rub' или 'percent'
    master_payment_value = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    master = relationship("Master")
    salon = relationship("Salon", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    service = relationship("Service")

    __table_args__ = (
        UniqueConstraint('master_id', 'salon_id', 'service_id', name='unique_master_salon_service'),
    )


class ModeratorPermissions(Base):
    __tablename__ = "moderator_permissions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    
    # Права на управление пользователями
    can_view_users = Column(Boolean, default=False)
    can_edit_users = Column(Boolean, default=False)
    can_delete_users = Column(Boolean, default=False)
    can_ban_users = Column(Boolean, default=False)
    
    # Права на управление блогом
    can_view_blog = Column(Boolean, default=False)
    can_create_blog = Column(Boolean, default=False)
    can_edit_blog = Column(Boolean, default=False)
    can_delete_blog = Column(Boolean, default=False)
    can_publish_blog = Column(Boolean, default=False)
    
    # Права на управление салонами
    can_view_salons = Column(Boolean, default=False)
    can_edit_salons = Column(Boolean, default=False)
    can_delete_salons = Column(Boolean, default=False)
    
    # Права на управление мастерами
    can_view_masters = Column(Boolean, default=False)
    can_edit_masters = Column(Boolean, default=False)
    can_delete_masters = Column(Boolean, default=False)
    
    # Права на управление бронированиями
    can_view_bookings = Column(Boolean, default=False)
    can_edit_bookings = Column(Boolean, default=False)
    can_delete_bookings = Column(Boolean, default=False)
    
    # Права на просмотр статистики
    can_view_stats = Column(Boolean, default=False)
    
    # Права на управление настройками
    can_view_settings = Column(Boolean, default=False)
    can_edit_settings = Column(Boolean, default=False)
    
    # Права на управление промо-кодами
    can_create_promo_codes = Column(Boolean, default=False)
    can_view_promo_codes = Column(Boolean, default=False)
    can_edit_promo_codes = Column(Boolean, default=False)
    can_delete_promo_codes = Column(Boolean, default=False)
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    user = relationship("User", back_populates="moderator_permissions")


class CalculatorSettings(Base):
    __tablename__ = "calculator_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Настройки для салонов
    salon_base_rate = Column(Integer, default=5000)  # Базовая ставка в месяц
    salon_branch_pricing = Column(JSON, default=dict)  # Наценка за филиалы
    salon_employee_pricing = Column(JSON, default=dict)  # Наценка за работников
    
    # Настройки для мастеров
    master_base_rate = Column(Integer, default=2000)  # Базовая ставка доступа
    master_booking_pricing = Column(JSON, default=dict)  # Стоимость за бронирование (Float)
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SubscriptionType(str, enum.Enum):
    SALON = "salon"
    MASTER = "master"


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    PENDING = "pending"
    CANCELLED = "cancelled"


class Subscription(Base):
    __tablename__ = "subscriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Связь с пользователем
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="subscriptions")
    
    # Тип подписки
    subscription_type = Column(Enum(SubscriptionType), nullable=False)
    
    # Статус подписки
    status = Column(Enum(SubscriptionStatus), default=SubscriptionStatus.PENDING)
    
    # Параметры для салонов
    salon_branches = Column(Integer, default=1)  # Количество оплаченных филиалов
    salon_employees = Column(Integer, default=0)  # Количество оплаченных работников
    
    # Параметры для мастеров
    master_bookings = Column(Integer, default=0)  # Количество записей в месяц
    
    # Время действия подписки
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    
    # Стоимость подписки
    price = Column(Float, nullable=False)  # Общая стоимость в рублях
    daily_rate = Column(Float, nullable=False)  # Стоимость одного дня в рублях
    
    # Период подписки (для автопродления)
    payment_period = Column(String, nullable=True)  # 'month' или 'year'
    
    # Автопродление
    auto_renewal = Column(Boolean, default=True)
    
    # Активность подписки
    is_active = Column(Boolean, default=True)
    
    # Связь с планом подписки
    plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=True)
    plan = relationship("SubscriptionPlan", back_populates="subscriptions")
    


class SubscriptionReservation(Base):
    __tablename__ = "subscription_reservations"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=False, unique=True)
    reserved_kopecks = Column(Integer, nullable=False, default=0)
    
    subscription = relationship("Subscription")
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Индексы
    __table_args__ = (
        Index('idx_subscription_reservation_user', 'user_id'),
        Index('idx_subscription_reservation_subscription', 'subscription_id'),
    )


class SubscriptionPriceSnapshot(Base):
    __tablename__ = "subscription_price_snapshots"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=False)
    duration_months = Column(Integer, nullable=False)
    
    # Зафиксированные цены на момент расчета
    price_1month = Column(Float, nullable=False)
    price_3months = Column(Float, nullable=False)
    price_6months = Column(Float, nullable=False)
    price_12months = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)  # Общая стоимость выбранного пакета
    monthly_price = Column(Float, nullable=False)  # Цена за месяц для выбранного пакета
    daily_price = Column(Float, nullable=False)  # Цена за день
    
    # Дополнительная информация для расчета
    reserved_balance = Column(Float, default=0.0)  # Зарезервированный баланс на момент расчета
    final_price = Column(Float, nullable=False)  # Итоговая цена с учетом резерва
    upgrade_type = Column(String, nullable=True)  # 'immediate', 'after_expiry', 'renewal', 'downgrade'
    
    # Время жизни snapshot
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)  # created_at + 20 минут
    
    # Связи
    user = relationship("User", back_populates="subscription_price_snapshots")
    plan = relationship("SubscriptionPlan")
    
    __table_args__ = (
        Index('idx_snapshot_expires', 'expires_at'),
        Index('idx_snapshot_user_created', 'user_id', 'created_at'),
    )


class SubscriptionFreeze(Base):
    __tablename__ = "subscription_freezes"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Связь с подпиской
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=False, index=True)
    subscription = relationship("Subscription", backref="freezes")
    
    # Период заморозки (начало в 00:00, конец в 23:59)
    start_date = Column(DateTime, nullable=False)  # 00:00 первого дня
    end_date = Column(DateTime, nullable=False)    # 23:59 последнего дня
    
    # Количество дней заморозки
    freeze_days = Column(Integer, nullable=False)
    
    # Статус заморозки
    is_cancelled = Column(Boolean, default=False)
    cancelled_at = Column(DateTime, nullable=True)
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Индексы
    __table_args__ = (
        Index('idx_subscription_freeze_subscription', 'subscription_id'),
        Index('idx_subscription_freeze_dates', 'start_date', 'end_date'),
    )


class TransactionType(str, enum.Enum):
    DEPOSIT = "deposit"      # Пополнение
    WITHDRAWAL = "withdrawal"  # Списание
    REFUND = "refund"       # Возврат
    UPGRADE = "upgrade"     # Обновление тарифа
    SUB_DAILY_FEE = "sub_daily_fee"  # Ежедневная плата за подписку
    SERV_FEE = "serv_fee"   # Плата за разовые услуги


class BalanceTransaction(Base):
    __tablename__ = "balance_transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Связь с пользователем
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Сумма операции (в копейках для точности)
    amount = Column(Integer, nullable=False)  # Сумма в копейках
    
    # Тип операции
    transaction_type = Column(Enum(TransactionType), nullable=False)
    
    # Описание операции
    description = Column(String, nullable=True)
    
    # Связь с подпиской (если применимо)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=True)
    
    # Баланс до и после операции
    balance_before = Column(Integer, nullable=False)  # Баланс до операции в копейках
    balance_after = Column(Integer, nullable=False)   # Баланс после операции в копейках
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Связи
    user = relationship("User", back_populates="balance_transactions")
    subscription = relationship("Subscription")
    
    # Индексы
    __table_args__ = (
        Index('idx_balance_transaction_user', 'user_id'),
        Index('idx_balance_transaction_type', 'transaction_type'),
        Index('idx_balance_transaction_date', 'created_at'),
    )


class UserBalance(Base):
    __tablename__ = "user_balances"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Связь с пользователем (один к одному)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    # Текущий баланс (в копейках для точности)
    balance = Column(Integer, default=0, nullable=False)  # Баланс в копейках
    
    # Валюта
    currency = Column(String, default="RUB", nullable=False)
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    user = relationship("User", back_populates="balance", uselist=False)
    
    # Индексы
    __table_args__ = (
        Index('idx_user_balance_user', 'user_id'),
    )


class DailyChargeStatus(str, enum.Enum):
    SUCCESS = "success"
    FAILED = "failed"
    PENDING = "pending"


class DailySubscriptionCharge(Base):
    __tablename__ = "daily_subscription_charges"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Связь с подпиской
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=False)
    
    # Дата списания
    charge_date = Column(Date, nullable=False)
    
    # Сумма списания за день (в копейках)
    amount = Column(Integer, nullable=False)
    
    # Стоимость дня по тарифу (в копейках)
    daily_rate = Column(Integer, nullable=False)
    
    # Баланс до и после списания
    balance_before = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    
    # Статус списания
    status = Column(Enum(DailyChargeStatus), default=DailyChargeStatus.PENDING)
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Связи
    subscription = relationship("Subscription")
    
    # Индексы
    __table_args__ = (
        Index("idx_daily_charge_subscription_date", "subscription_id", "charge_date"),
        Index("idx_daily_charge_status", "status"),
    )


class SalonBranch(Base):
    __tablename__ = "salon_branches"
    
    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=False)
    name = Column(String, nullable=False)
    address = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    working_hours = Column(Text, nullable=True)  # JSON с расписанием работы
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # ID управляющего филиалом
    is_active = Column(Boolean, default=True)
    
    # Поля для управления сайтом филиала
    url_slug = Column(String, nullable=True)  # Название в URL (sitename.dedato.ru/название-филиала)
    yandex_map_embed = Column(Text, nullable=True)  # Интерактивный блок Яндекс карты
    background_color = Column(String, nullable=True)  # Цвет фона страницы филиала
    logo_path = Column(String, nullable=True)  # Путь к логотипу филиала
    use_salon_logo = Column(Boolean, default=False)  # Использовать логотип организации
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    salon = relationship("Salon", overlaps="branches")
    manager = relationship("User")  # Связь с управляющим
    places = relationship("SalonPlace", back_populates="branch")
    master_schedules = relationship("MasterSchedule", back_populates="branch")
    manager_invitations = relationship("BranchManagerInvitation", back_populates="branch")
    expense_types = relationship("ExpenseType")
    expenses = relationship("Expense")
    expense_templates = relationship("ExpenseTemplate")
    
    # Настройки автоматизации ограничений
    missed_sessions_advance_payment_threshold = Column(Integer, default=3)  # Количество пропущенных сеансов для обязательной предоплаты
    missed_sessions_blacklist_threshold = Column(Integer, default=5)  # Количество пропущенных сеансов для попадания в черный список
    cancellation_grace_period_hours = Column(Integer, default=24)  # Время отмены без санкций (в часах)


class SalonPlace(Base):
    __tablename__ = "salon_places"
    
    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("salon_branches.id"), nullable=True)  # null для основного салона
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    capacity = Column(Integer, default=1)  # Вместимость места (количество мастеров)
    is_active = Column(Boolean, default=True)
    position_x = Column(Float, nullable=True)  # Позиция на схеме
    position_y = Column(Float, nullable=True)  # Позиция на схеме
    width = Column(Float, default=100)  # Ширина на схеме
    height = Column(Float, default=100)  # Высота на схеме
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    salon = relationship("Salon", overlaps="places")
    branch = relationship("SalonBranch", back_populates="places")
    master_schedules = relationship("MasterSchedule", back_populates="place")


class EmailVerification(Base):
    __tablename__ = "email_verifications"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String, unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Связи
    user = relationship("User")
    
    # Индексы
    __table_args__ = (
        Index("idx_email_verification_token", "token"),
        Index("idx_email_verification_user", "user_id"),
    )


class PasswordReset(Base):
    __tablename__ = "password_resets"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String, unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Связи
    user = relationship("User")
    
    # Индексы
    __table_args__ = (
        Index("idx_password_reset_user", "user_id"),
        Index("idx_password_reset_token", "token"),
    )


# Система лояльности

class LoyaltyDiscountType(str, enum.Enum):
    QUICK = "quick"           # Быстрые скидки
    COMPLEX = "complex"        # Сложные скидки
    PERSONAL = "personal"      # Персональные скидки


class LoyaltyConditionType(str, enum.Enum):
    # Быстрые скидки
    FIRST_VISIT = "first_visit"                    # Первая запись
    REGULAR_VISITS = "regular_visits"              # Регулярные визиты
    RETURNING_CLIENT = "returning_client"          # Возвращение клиента
    BIRTHDAY = "birthday"                          # День рождения
    HAPPY_HOURS = "happy_hours"                    # Счастливые часы
    SERVICE_DISCOUNT = "service_discount"          # Скидка на услуги
    
    # Сложные скидки
    VISIT_COUNT = "visit_count"                    # Количество визитов
    SPENT_AMOUNT = "spent_amount"                  # Потраченная сумма
    DAYS_SINCE_LAST_VISIT = "days_since_last_visit"  # Дни с последнего визита
    BIRTHDAY_RANGE = "birthday_range"              # Диапазон дней рождения
    TIME_SLOT = "time_slot"                        # Временной слот
    DAY_OF_WEEK = "day_of_week"                    # День недели
    SEASON = "season"                              # Сезон
    ADVANCE_BOOKING = "advance_booking"            # Предварительное бронирование
    SERVICE_CATEGORY = "service_category"           # Категория услуг
    SPECIFIC_SERVICE = "specific_service"           # Конкретная услуга
    MULTIPLE_SERVICES = "multiple_services"         # Несколько услуг
    REFERRAL_COUNT = "referral_count"              # Количество рефералов
    PROMO_CODE = "promo_code"                      # Промокод
    SOCIAL_ACTIVITY = "social_activity"            # Активность в соцсетях
    ONLINE_PAYMENT = "online_payment"              # Онлайн оплата
    PACKAGE_PURCHASE = "package_purchase"          # Покупка пакета
    CHECK_AMOUNT = "check_amount"                  # Сумма чека
    REPEAT_SERVICE = "repeat_service"              # Повторная услуга


class LoyaltyDiscount(Base):
    __tablename__ = "loyalty_discounts"
    
    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=False)
    
    # Тип скидки
    discount_type = Column(Enum(LoyaltyDiscountType), nullable=False)
    
    # Название и описание
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    
    # Размер скидки (в процентах)
    discount_percent = Column(Float, nullable=False)
    
    # Максимальная сумма скидки (в рублях, null = без ограничений)
    max_discount_amount = Column(Float, nullable=True)
    
    # Условия применения
    conditions = Column(JSON, nullable=False)  # JSON с условиями
    
    # Активность скидки
    is_active = Column(Boolean, default=True)
    
    # Приоритет скидки (для выбора максимальной)
    priority = Column(Integer, default=1)
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    salon = relationship("Salon", overlaps="loyalty_discounts")
    
    # Индексы
    __table_args__ = (
        Index("idx_loyalty_discount_salon", "salon_id"),
        Index("idx_loyalty_discount_type", "discount_type"),
        Index("idx_loyalty_discount_active", "is_active"),
    )


class PersonalDiscount(Base):
    __tablename__ = "personal_discounts"
    
    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=False)
    client_phone = Column(String, nullable=False)  # Номер телефона клиента
    
    # Размер скидки (в процентах)
    discount_percent = Column(Float, nullable=False)
    
    # Максимальная сумма скидки (в рублях, null = без ограничений)
    max_discount_amount = Column(Float, nullable=True)
    
    # Описание скидки
    description = Column(Text, nullable=True)
    
    # Активность скидки
    is_active = Column(Boolean, default=True)
    
    # Дата создания и обновления
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    salon = relationship("Salon", overlaps="personal_discounts")
    
    # Индексы
    __table_args__ = (
        Index("idx_personal_discount_salon", "salon_id"),
        Index("idx_personal_discount_phone", "client_phone"),
        Index("idx_personal_discount_active", "is_active"),
    )


class AppliedDiscount(Base):
    __tablename__ = "applied_discounts"
    
    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    discount_id = Column(Integer, ForeignKey("loyalty_discounts.id"), nullable=True)
    personal_discount_id = Column(Integer, ForeignKey("personal_discounts.id"), nullable=True)
    
    # Размер примененной скидки
    discount_percent = Column(Float, nullable=False)
    discount_amount = Column(Float, nullable=False)  # Сумма скидки в рублях
    
    # Информация о применении
    applied_at = Column(DateTime, default=datetime.utcnow)
    
    # Связи
    booking = relationship("Booking", overlaps="applied_discounts")
    loyalty_discount = relationship("LoyaltyDiscount")
    personal_discount = relationship("PersonalDiscount")
    
    # Индексы
    __table_args__ = (
        Index("idx_applied_discount_booking", "booking_id"),
        Index("idx_applied_discount_discount", "discount_id"),
        Index("idx_applied_discount_personal", "personal_discount_id"),
    )


class ClientMasterNote(Base):
    __tablename__ = "client_master_notes"
    
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # ID клиента
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=False)  # ID мастера
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=False)  # ID салона
    
    # Текст заметки (максимум 400 символов)
    note = Column(String(400), nullable=False)
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    client = relationship("User", back_populates="master_notes")
    master = relationship("Master", back_populates="client_notes")
    salon = relationship("Salon", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    
    # Индексы
    __table_args__ = (
        Index("idx_client_master_note_client", "client_id"),
        Index("idx_client_master_note_master", "master_id"),
        Index("idx_client_master_note_salon", "salon_id"),
        Index("idx_client_master_note_unique", "client_id", "master_id", "salon_id", unique=True),
    )


class ClientSalonNote(Base):
    __tablename__ = "client_salon_notes"
    
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # ID клиента
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=False)  # ID салона
    branch_id = Column(Integer, ForeignKey("salon_branches.id"), nullable=True)  # ID филиала (опционально)
    
    # Текст заметки (максимум 400 символов)
    note = Column(String(400), nullable=False)
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    client = relationship("User", back_populates="salon_notes")
    salon = relationship("Salon", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    branch = relationship("SalonBranch", overlaps="expense_types,expenses,expense_templates")
    
    # Индексы
    __table_args__ = (
        Index("idx_client_salon_note_client", "client_id"),
        Index("idx_client_salon_note_salon", "salon_id"),
        Index("idx_client_salon_note_branch", "branch_id"),
        Index("idx_client_salon_note_unique", "client_id", "salon_id", "branch_id", unique=True),
    )


class ClientRestriction(Base):
    __tablename__ = "client_restrictions"
    
    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)  # ID салона (null для мастеров-индивидуалов)
    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)  # ID мастера-индивидуала (null для салонов)
    client_phone = Column(String, nullable=False)  # Номер телефона клиента
    
    # Тип ограничения
    restriction_type = Column(Enum('blacklist', 'advance_payment_only', name='restrictiontype'), nullable=False)
    
    # Причина ограничения
    reason = Column(Text, nullable=True)
    
    # Активность ограничения
    is_active = Column(Boolean, default=True)
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    salon = relationship("Salon", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    indie_master = relationship("IndieMaster", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    
    # Индексы
    __table_args__ = (
        Index("idx_client_restriction_salon", "salon_id"),
        Index("idx_client_restriction_indie_master", "indie_master_id"),
        Index("idx_client_restriction_phone", "client_phone"),
        Index("idx_client_restriction_type", "restriction_type"),
        Index("idx_client_restriction_active", "is_active"),
        Index("idx_client_restriction_unique", "salon_id", "indie_master_id", "client_phone", "restriction_type", unique=True),
    )


class ClientRestrictionRule(Base):
    """Правила автоматических ограничений клиентов"""
    __tablename__ = "client_restriction_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=False)
    cancellation_reason = Column(String, nullable=False)  # 'client_requested', 'client_no_show', 'mutual_agreement', 'master_unavailable'
    cancel_count = Column(Integer, nullable=False)  # Количество отмен для срабатывания правила
    period_days = Column(Integer, nullable=True)  # Период проверки в днях (NULL = все время)
    restriction_type = Column(String, nullable=False)  # 'blacklist' или 'advance_payment_only'
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    master = relationship("Master", back_populates="restriction_rules")
    
    # Индексы
    __table_args__ = (
        Index("idx_restriction_rules_master", "master_id"),
        Index("idx_restriction_rules_master_reason", "master_id", "cancellation_reason", "restriction_type"),
    )


class MasterPaymentSettings(Base):
    """Настройки оплаты мастера"""
    __tablename__ = "master_payment_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=False, unique=True)
    accepts_online_payment = Column(Boolean, default=False)  # Принимает ли мастер оплату через систему DeDato
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    master = relationship("Master", back_populates="payment_settings")
    
    # Индексы
    __table_args__ = (
        Index("idx_payment_settings_master", "master_id", unique=True),
    )


class TemporaryBooking(Base):
    """Временные бронирования на период оплаты (20 минут)"""
    __tablename__ = "temporary_bookings"
    
    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    payment_amount = Column(Float, nullable=False)
    expires_at = Column(DateTime, nullable=False)  # Время истечения (start_time + 20 минут)
    payment_session_id = Column(String, nullable=True)  # ID сессии платежа
    payment_link = Column(String, nullable=True)  # Ссылка на оплату
    status = Column(String, nullable=False, default='pending')  # 'pending', 'paid', 'expired', 'cancelled'
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Связи
    master = relationship("Master")
    client = relationship("User")
    service = relationship("Service")
    
    # Индексы
    __table_args__ = (
        Index("idx_temporary_bookings_master", "master_id"),
        Index("idx_temporary_bookings_client", "client_id"),
        Index("idx_temporary_bookings_expires", "expires_at"),
        Index("idx_temporary_bookings_status", "status"),
    )


class ExpenseType(Base):
    __tablename__ = "expense_types"
    
    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)  # ID салона (null для мастеров-индивидуалов)
    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)  # ID мастера-индивидуала (null для салонов)
    branch_id = Column(Integer, ForeignKey("salon_branches.id"), nullable=True)  # ID филиала (только для салонов)
    
    name = Column(String, nullable=False)  # Название типа расхода
    description = Column(Text, nullable=True)  # Описание типа расхода
    color = Column(String, default="#3B82F6")  # Цвет для отображения
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    salon = relationship("Salon", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    indie_master = relationship("IndieMaster", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    branch = relationship("SalonBranch", overlaps="expense_types,expenses,expense_templates")
    
    # Индексы
    __table_args__ = (
        Index("idx_expense_type_salon", "salon_id"),
        Index("idx_expense_type_indie_master", "indie_master_id"),
        Index("idx_expense_type_branch", "branch_id"),
        Index("idx_expense_type_name", "name"),
    )


class Expense(Base):
    __tablename__ = "expenses"
    
    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)  # ID салона (null для мастеров-индивидуалов)
    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)  # ID мастера-индивидуала (null для салонов)
    branch_id = Column(Integer, ForeignKey("salon_branches.id"), nullable=True)  # ID филиала (только для салонов)
    
    # Основная информация
    name = Column(String, nullable=False)  # Название расхода
    expense_type_id = Column(Integer, ForeignKey("expense_types.id"), nullable=False)
    amount_without_vat = Column(Float, nullable=False)  # Сумма до НДС
    amount_with_vat = Column(Float, nullable=False)  # Сумма с НДС
    is_vat_free = Column(Boolean, default=False)  # Без НДС
    contractor = Column(String, nullable=False)  # Подрядчик
    
    # Временные параметры
    expense_month = Column(Date, nullable=False)  # Месяц расхода (первый день месяца)
    
    # Цикличность
    is_recurring = Column(Boolean, default=False)  # Циклический расход
    recurring_frequency = Column(String, nullable=True)  # Частота (monthly, quarterly, yearly)
    recurring_start_date = Column(Date, nullable=True)  # Дата начала цикличности
    recurring_end_date = Column(Date, nullable=True)  # Дата окончания цикличности
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    salon = relationship("Salon", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    indie_master = relationship("IndieMaster", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    branch = relationship("SalonBranch", overlaps="expense_types,expenses,expense_templates")
    expense_type = relationship("ExpenseType")
    
    # Индексы
    __table_args__ = (
        Index("idx_expense_salon", "salon_id"),
        Index("idx_expense_indie_master", "indie_master_id"),
        Index("idx_expense_branch", "branch_id"),
        Index("idx_expense_type", "expense_type_id"),
        Index("idx_expense_month", "expense_month"),
        Index("idx_expense_recurring", "is_recurring"),
    )


class ExpenseTemplate(Base):
    __tablename__ = "expense_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)  # ID салона (null для мастеров-индивидуалов)
    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)  # ID мастера-индивидуала (null для салонов)
    branch_id = Column(Integer, ForeignKey("salon_branches.id"), nullable=True)  # ID филиала (только для салонов)
    
    name = Column(String, nullable=False)  # Название шаблона
    expense_name = Column(String, nullable=False)  # Название расхода
    expense_type_id = Column(Integer, ForeignKey("expense_types.id"), nullable=False)
    contractor = Column(String, nullable=False)  # Подрядчик
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    salon = relationship("Salon", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    indie_master = relationship("IndieMaster", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    branch = relationship("SalonBranch", overlaps="expense_types,expenses,expense_templates")
    expense_type = relationship("ExpenseType")
    
    # Индексы
    __table_args__ = (
        Index("idx_expense_template_salon", "salon_id"),
        Index("idx_expense_template_indie_master", "indie_master_id"),
        Index("idx_expense_template_branch", "branch_id"),
        Index("idx_expense_template_name", "name"),
    )


class Income(Base):
    __tablename__ = "incomes"
    
    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)  # ID салона (null для мастеров-индивидуалов)
    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)  # ID мастера-индивидуала (null для салонов)
    branch_id = Column(Integer, ForeignKey("salon_branches.id"), nullable=True)  # ID филиала (только для салонов)
    
    # Связь с бронированием
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    
    # Финансовая информация
    total_amount = Column(Float, nullable=False)  # Общая сумма услуги
    master_earnings = Column(Float, nullable=False)  # Заработок мастера
    salon_earnings = Column(Float, nullable=False)  # Доход салона (total_amount - master_earnings)
    
    # Временные параметры
    income_date = Column(Date, nullable=False)  # Дата дохода
    service_date = Column(Date, nullable=False)  # Дата оказания услуги
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    salon = relationship("Salon", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    indie_master = relationship("IndieMaster", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    branch = relationship("SalonBranch", overlaps="expense_types,expenses,expense_templates")
    booking = relationship("Booking", overlaps="applied_discounts")
    
    # Индексы
    __table_args__ = (
        Index("idx_income_salon", "salon_id"),
        Index("idx_income_indie_master", "indie_master_id"),
        Index("idx_income_branch", "branch_id"),
        Index("idx_income_booking", "booking_id"),
        Index("idx_income_date", "income_date"),
        Index("idx_income_service_date", "service_date"),
    )


class MissedRevenue(Base):
    __tablename__ = "missed_revenues"
    
    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)  # ID салона (null для мастеров-индивидуалов)
    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)  # ID мастера-индивидуала (null для салонов)
    branch_id = Column(Integer, ForeignKey("salon_branches.id"), nullable=True)  # ID филиала (только для салонов)
    
    # Связь с бронированием
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    
    # Информация о клиенте
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Финансовая информация
    missed_amount = Column(Float, nullable=False)  # Упущенная выгода
    service_price = Column(Float, nullable=False)  # Цена услуги
    
    # Причина пропуска
    reason = Column(String, nullable=True)  # Причина (опционально)
    
    # Временные параметры
    missed_date = Column(Date, nullable=False)  # Дата пропуска
    booking_date = Column(Date, nullable=False)  # Дата бронирования
    
    # Технические поля
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    salon = relationship("Salon", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    indie_master = relationship("IndieMaster", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    branch = relationship("SalonBranch", overlaps="expense_types,expenses,expense_templates")
    booking = relationship("Booking", overlaps="applied_discounts")
    client = relationship("User")
    
    # Индексы
    __table_args__ = (
        Index("idx_missed_revenue_salon", "salon_id"),
        Index("idx_missed_revenue_indie_master", "indie_master_id"),
        Index("idx_missed_revenue_branch", "branch_id"),
        Index("idx_missed_revenue_booking", "booking_id"),
        Index("idx_missed_revenue_client", "client_id"),
        Index("idx_missed_revenue_date", "missed_date"),
    )


class ClientFavorite(Base):
    __tablename__ = "client_favorites"

    client_favorite_id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Тип избранного элемента
    favorite_type = Column(String, nullable=False)  # 'salon', 'master', 'indie_master', 'service'
    
    # ID избранного элемента (может быть null для некоторых типов)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=True)
    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=True)
    
    # Дополнительные данные для быстрого доступа
    favorite_name = Column(String, nullable=False)  # Название для отображения
    
    # Связи
    client = relationship("User", back_populates="favorites")
    salon = relationship("Salon", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    master = relationship("Master")
    indie_master = relationship("IndieMaster", overlaps="client_restrictions,expense_types,expenses,expense_templates")
    service = relationship("Service")
    
    # Уникальные индексы для предотвращения дублирования
    __table_args__ = (
        UniqueConstraint('client_id', 'favorite_type', 'salon_id', name='unique_salon_favorite'),
        UniqueConstraint('client_id', 'favorite_type', 'master_id', name='unique_master_favorite'),
        UniqueConstraint('client_id', 'favorite_type', 'indie_master_id', name='unique_indie_master_favorite'),
        UniqueConstraint('client_id', 'favorite_type', 'service_id', name='unique_service_favorite'),
        {'extend_existing': True}
    )

class ClientNote(Base):
    __tablename__ = "client_notes"
    
    id = Column(Integer, primary_key=True, index=True)
    client_phone = Column(String, nullable=False, index=True)  # Привязка по номеру телефона
    note_type = Column(String, nullable=False)  # 'salon', 'master', 'indie_master'
    target_id = Column(Integer, nullable=False)  # ID салона, мастера или индивидуального мастера
    salon_note = Column(Text, nullable=True)  # Заметка о салоне
    master_note = Column(Text, nullable=True)  # Заметка о мастере
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Индексы для быстрого поиска
    __table_args__ = (
        Index('idx_client_notes_client_phone', 'client_phone'),
        Index('idx_client_notes_target', 'note_type', 'target_id'),
        Index('idx_client_notes_unique', 'client_phone', 'note_type', 'target_id', unique=True),
    )


class AdminOperation(Base):
    __tablename__ = "admin_operations"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Связь с админом
    admin_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Связь с пользователем, с которого списываются деньги
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Сумма операции (в копейках)
    amount_kopecks = Column(Integer, nullable=False)
    
    # Тип операции
    operation_type = Column(String(50), nullable=False)  # SUB_DAILY_FEE, SERV_FEE
    
    # Описание услуги
    service_description = Column(Text, nullable=True)
    
    # Время операции
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Связи
    admin_user = relationship("User", foreign_keys=[admin_user_id])
    from_user = relationship("User", foreign_keys=[from_user_id])
    
    # Индексы для быстрого поиска
    __table_args__ = (
        Index('idx_admin_operations_admin_user_id', 'admin_user_id'),
        Index('idx_admin_operations_from_user_id', 'from_user_id'),
        Index('idx_admin_operations_created_at', 'created_at'),
    )


class AlwaysFreeLog(Base):
    __tablename__ = "always_free_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Связь с пользователем, которому изменили статус
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user = relationship("User", foreign_keys=[user_id])
    
    # Связь с админом, который изменил статус
    admin_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    admin_user = relationship("User", foreign_keys=[admin_user_id])
    
    # Детали изменения
    old_status = Column(Boolean, nullable=False)  # Предыдущий статус
    new_status = Column(Boolean, nullable=False)  # Новый статус
    reason = Column(Text, nullable=True)  # Причина изменения
    
    # Время изменения
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Индексы для быстрого поиска
    __table_args__ = (
        Index('idx_always_free_logs_user_id', 'user_id'),
        Index('idx_always_free_logs_admin_user_id', 'admin_user_id'),
        Index('idx_always_free_logs_created_at', 'created_at'),
    )


class PromoCode(Base):
    __tablename__ = "promo_codes"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    max_uses = Column(Integer, nullable=False)  # максимальное количество активаций
    used_count = Column(Integer, default=0)     # количество использований
    expires_at = Column(DateTime, nullable=True)  # NULL = бессрочно (01.01.2100)
    subscription_type = Column(Enum(SubscriptionType), nullable=False)  # salon/master
    subscription_duration_days = Column(Integer, nullable=False)  # 1-364 дня
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.id"))
    
    # Связи
    creator = relationship("User", foreign_keys=[created_by])
    activations = relationship("PromoCodeActivation", back_populates="promo_code")
    
    # Индексы
    __table_args__ = (
        Index('idx_promo_codes_code', 'code'),
        Index('idx_promo_codes_active', 'is_active'),
        Index('idx_promo_codes_expires', 'expires_at'),
        Index('idx_promo_codes_type', 'subscription_type'),
    )


class PromoCodeActivation(Base):
    __tablename__ = "promo_code_activations"
    
    id = Column(Integer, primary_key=True, index=True)
    promo_code_id = Column(Integer, ForeignKey("promo_codes.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    activated_at = Column(DateTime, default=datetime.utcnow)
    subscription_start = Column(DateTime, nullable=False)
    subscription_end = Column(DateTime, nullable=False)
    paid_after_expiry = Column(Boolean, default=False)  # оплатил ли после окончания
    
    # Связи
    promo_code = relationship("PromoCode", back_populates="activations")
    user = relationship("User", foreign_keys=[user_id])
    
    # Индексы
    __table_args__ = (
        Index('idx_promo_activations_promo_code', 'promo_code_id'),
        Index('idx_promo_activations_user', 'user_id'),
        Index('idx_promo_activations_activated_at', 'activated_at'),
    )


class MasterExpense(Base):
    """Модель расходов мастера"""
    __tablename__ = "master_expenses"
    
    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)  # Название расхода
    expense_type = Column(String(20), nullable=False)  # recurring, service_based, one_time
    amount = Column(Float, nullable=False)
    
    # Для циклических расходов
    recurrence_type = Column(String(20))  # monthly, weekly, daily, conditional
    condition_type = Column(String(50))  # has_bookings, schedule_open (для conditional)
    
    # Для расходов по услуге
    service_id = Column(Integer, ForeignKey("services.id"))
    
    # Для разовых расходов
    expense_date = Column(DateTime)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    
    # Связи
    master = relationship("User", foreign_keys=[master_id])
    service = relationship("Service", foreign_keys=[service_id])
    
    # Индексы
    __table_args__ = (
        Index('idx_master_expenses_master_id', 'master_id'),
        Index('idx_master_expenses_expense_type', 'expense_type'),
        Index('idx_master_expenses_expense_date', 'expense_date'),
        Index('idx_master_expenses_service_id', 'service_id'),
    )


class BookingConfirmation(Base):
    """Модель подтверждения завершенных услуг"""
    __tablename__ = "booking_confirmations"
    
    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), unique=True, nullable=False)
    master_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    confirmed_at = Column(DateTime, default=datetime.utcnow)
    confirmed_income = Column(Float, nullable=False)  # Подтвержденный доход
    
    # Связи
    booking = relationship("Booking", foreign_keys=[booking_id])
    master = relationship("User", foreign_keys=[master_id])
    
    # Индексы
    __table_args__ = (
        Index('idx_booking_confirmations_booking_id', 'booking_id'),
        Index('idx_booking_confirmations_master_id', 'master_id'),
        Index('idx_booking_confirmations_confirmed_at', 'confirmed_at'),
    )


class TaxRate(Base):
    """Модель налоговых ставок мастера"""
    __tablename__ = "tax_rates"
    
    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    rate = Column(Float, nullable=False)  # Процент налога (0-100)
    effective_from_date = Column(Date, nullable=False)  # Дата начала действия ставки
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Связи
    master = relationship("User", foreign_keys=[master_id])
    
    # Индексы
    __table_args__ = (
        Index('idx_tax_rates_master', 'master_id'),
        Index('idx_tax_rates_date', 'effective_from_date'),
    )


class SubscriptionType(str, enum.Enum):
    MASTER = "master"
    SALON = "salon"


class SubscriptionPlan(Base):
    """Модель для планов подписки"""
    __tablename__ = "subscription_plans"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=True)  # Отображаемое название для пользователей
    subscription_type = Column(Enum(SubscriptionType), nullable=False)
    price_1month = Column(Float, nullable=False)  # Цена за 1 месяц в пакете на 1 месяц
    price_3months = Column(Float, nullable=False)  # Цена за 1 месяц в пакете на 3 месяца
    price_6months = Column(Float, nullable=False)  # Цена за 1 месяц в пакете на 6 месяцев
    price_12months = Column(Float, nullable=False)  # Цена за 1 месяц в пакете на 12 месяцев
    features = Column(JSON, default=dict)  # JSONB for PostgreSQL, JSON for SQLite
    limits = Column(JSON, default=dict)
    is_active = Column(Boolean, default=True)
    display_order = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    subscriptions = relationship("Subscription", back_populates="plan")




class MasterPageModule(Base):
    """Модель для модулей страницы мастера"""
    __tablename__ = "master_page_modules"
    
    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=False)
    module_type = Column(String, nullable=False)  # e.g., "text", "image", "video", "booking_form"
    position = Column(Integer, default=0)
    config = Column(JSON, default=dict)  # JSONB for PostgreSQL, JSON for SQLite
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    master = relationship("Master", back_populates="page_modules")


class ServiceFunction(Base):
    """Модель для функций сервиса"""
    __tablename__ = "service_functions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)  # Название функции
    display_name = Column(String, nullable=True)  # Отображаемое название для пользователей
    description = Column(Text, nullable=True)  # Описание
    # Тип функции: FREE, SUBSCRIPTION, VOLUME_BASED (храним в БД в верхнем регистре)
    # Используем String вместо Enum, чтобы избежать проблем с несовпадением значений/регистра
    function_type = Column(String, nullable=False, default=ServiceType.FREE.name)
    is_active = Column(Boolean, default=True)  # Активна ли функция
    display_order = Column(Integer, default=0)  # Порядок отображения
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LoyaltySettings(Base):
    """Модель настроек программы лояльности мастера"""
    __tablename__ = "loyalty_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=False, unique=True)
    is_enabled = Column(Boolean, default=False, nullable=False)
    accrual_percent = Column(Integer, nullable=True)  # Процент начисления (1-100)
    max_payment_percent = Column(Integer, nullable=True)  # Максимальный % оплаты баллами (1-100)
    points_lifetime_days = Column(Integer, nullable=True)  # Срок жизни баллов в днях (NULL = бесконечно)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    master = relationship("Master", backref="loyalty_settings")
    
    # Индексы
    __table_args__ = (
        Index('idx_loyalty_settings_master', 'master_id'),
    )


class LoyaltyTransaction(Base):
    """Модель транзакций начисления и списания баллов лояльности"""
    __tablename__ = "loyalty_transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=True)
    transaction_type = Column(String, nullable=False)  # 'earned' (начисление) или 'spent' (списание)
    points = Column(Integer, nullable=False)  # Количество баллов (положительное число)
    earned_at = Column(DateTime, nullable=False)  # Дата начисления (для earned) или списания (для spent)
    expires_at = Column(DateTime, nullable=True)  # Дата истечения (только для earned, NULL = бесконечно)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=True)  # ID услуги, за которую начислены баллы
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Связи
    master = relationship("Master", backref="loyalty_transactions")
    client = relationship("User", backref="loyalty_transactions")
    booking = relationship("Booking", backref="loyalty_transactions")
    service = relationship("Service", backref="loyalty_transactions")
    
    # Индексы
    __table_args__ = (
        Index('idx_loyalty_transactions_master_client', 'master_id', 'client_id'),
        Index('idx_loyalty_transactions_client', 'client_id'),
        Index('idx_loyalty_transactions_booking', 'booking_id'),
        Index('idx_loyalty_transactions_expires', 'expires_at'),
        Index('idx_loyalty_transactions_type', 'transaction_type'),
    )
