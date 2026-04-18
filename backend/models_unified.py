"""
Новые модели для унифицированной структуры мастеров
Эти модели будут добавлены в основной файл models.py после миграции
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import enum

from database import Base

class WorkType(str, enum.Enum):
    SALON = "salon"
    INDIE = "indie"

class SalonMaster(Base):
    """Мастер, работающий в салоне"""
    __tablename__ = "salon_masters"

    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=False)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=False)
    can_work_in_salon = Column(Boolean, default=True)
    branch_id = Column(Integer, ForeignKey("salon_branches.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    master = relationship("Master", back_populates="salon_work")
    salon = relationship("Salon", back_populates="salon_masters")
    branch = relationship("SalonBranch", back_populates="salon_masters")

    __table_args__ = (
        # Уникальность: один мастер может работать в одном салоне только один раз
        {"extend_existing": True}
    )

class IndieMasterNew(Base):
    """Независимый мастер (новая структура)"""
    __tablename__ = "indie_masters_new"

    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=False)
    can_work_independently = Column(Boolean, default=False)
    domain = Column(String, unique=True, nullable=True)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    timezone = Column(String, default="Europe/Moscow")
    payment_on_visit = Column(Boolean, default=True)
    payment_advance = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    master = relationship("Master", back_populates="indie_work")

    __table_args__ = (
        # Уникальность: один мастер может иметь только один независимый профиль
        {"extend_existing": True}
    )

# Обновленные модели для основной структуры
class MasterUnified(Base):
    """Обновленная модель мастера с унифицированной структурой"""
    __tablename__ = "masters"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    bio = Column(Text)
    experience_years = Column(Integer)
    website = Column(String, nullable=True)
    photo = Column(String, nullable=True)
    use_photo_as_logo = Column(Boolean, default=False)
    background_color = Column(String, default="#ffffff")
    city = Column(String, nullable=True)
    timezone = Column(String, default="Europe/Moscow")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    user = relationship("User", back_populates="master_profile")
    
    # Новые связи для унифицированной структуры
    salon_work = relationship("SalonMaster", back_populates="master")
    indie_work = relationship("IndieMasterNew", back_populates="master")
    
    # Существующие связи (остаются без изменений)
    services = relationship("Service", back_populates="masters")
    schedule = relationship("MasterSchedule", back_populates="master")
    service_categories = relationship("MasterServiceCategory", back_populates="master")
    master_services = relationship("MasterService", back_populates="master")
    bookings = relationship("Booking", back_populates="master")
    client_restrictions = relationship("ClientRestriction")
    expense_types = relationship("ExpenseType")
    expenses = relationship("Expense")
    expense_templates = relationship("ExpenseTemplate")
    incomes = relationship("Income")
    missed_revenues = relationship("MissedRevenue")

# Обновленная модель бронирований
class BookingUnified(Base):
    """Обновленная модель бронирований с унифицированной структурой"""
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id"))
    service_id = Column(Integer, ForeignKey("services.id"))
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=True)
    work_type = Column(Enum(WorkType), nullable=True)  # 'salon' или 'indie'
    salon_work_id = Column(Integer, ForeignKey("salon_masters.id"), nullable=True)
    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)
    branch_id = Column(Integer, ForeignKey("salon_branches.id"), nullable=True)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    status = Column(String, default="pending")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    client = relationship("User", back_populates="bookings")
    service = relationship("Service", back_populates="bookings")
    master = relationship("Master", back_populates="bookings")
    salon_work = relationship("SalonMaster")
    indie_work = relationship("IndieMasterNew")
    salon = relationship("Salon")
    branch = relationship("SalonBranch")

# Обновленная модель услуг
class ServiceUnified(Base):
    """Обновленная модель услуг с унифицированной структурой"""
    __tablename__ = "services"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    duration = Column(Integer)  # в минутах
    price = Column(Float)
    service_type = Column(String, default="subscription")
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=True)  # Унифицированное поле
    work_type = Column(Enum(WorkType), nullable=True)  # 'salon' или 'indie'
    salon_work_id = Column(Integer, ForeignKey("salon_masters.id"), nullable=True)
    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    category_id = Column(Integer, ForeignKey("service_categories.id"), nullable=True)

    # Связи
    salon = relationship("Salon", back_populates="services")
    master = relationship("Master", back_populates="services")
    salon_work = relationship("SalonMaster")
    indie_work = relationship("IndieMasterNew")
    masters = relationship("Master", secondary="master_services", back_populates="services")
    bookings = relationship("Booking", back_populates="service")
    category = relationship("ServiceCategory", back_populates="services")

# Обновленная модель ограничений клиентов
class ClientRestrictionUnified(Base):
    """Обновленная модель ограничений клиентов с унифицированной структурой"""
    __tablename__ = "client_restrictions"

    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=True)  # Унифицированное поле
    work_type = Column(Enum(WorkType), nullable=True)  # 'salon' или 'indie'
    salon_work_id = Column(Integer, ForeignKey("salon_masters.id"), nullable=True)
    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
    client_phone = Column(String, nullable=False)
    restriction_type = Column(String, nullable=False)  # 'blacklist' или 'advance_payment_only'
    reason = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    salon = relationship("Salon")
    master = relationship("Master", back_populates="client_restrictions")
    salon_work = relationship("SalonMaster")
    indie_work = relationship("IndieMasterNew")

# Обновленная модель доходов
class IncomeUnified(Base):
    """Обновленная модель доходов с унифицированной структурой"""
    __tablename__ = "incomes"

    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=True)  # Унифицированное поле
    work_type = Column(Enum(WorkType), nullable=True)  # 'salon' или 'indie'
    salon_work_id = Column(Integer, ForeignKey("salon_masters.id"), nullable=True)
    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
    amount = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    income_date = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    salon = relationship("Salon")
    master = relationship("Master", back_populates="incomes")
    salon_work = relationship("SalonMaster")
    indie_work = relationship("IndieMasterNew")

# Обновленная модель расходов
class ExpenseUnified(Base):
    """Обновленная модель расходов с унифицированной структурой"""
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=True)  # Унифицированное поле
    work_type = Column(Enum(WorkType), nullable=True)  # 'salon' или 'indie'
    salon_work_id = Column(Integer, ForeignKey("salon_masters.id"), nullable=True)
    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
    expense_type_id = Column(Integer, ForeignKey("expense_types.id"), nullable=True)
    amount = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    expense_date = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    salon = relationship("Salon")
    master = relationship("Master", back_populates="expenses")
    salon_work = relationship("SalonMaster")
    indie_work = relationship("IndieMasterNew")
    expense_type = relationship("ExpenseType")

# Обновленная модель типов расходов
class ExpenseTypeUnified(Base):
    """Обновленная модель типов расходов с унифицированной структурой"""
    __tablename__ = "expense_types"

    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=True)  # Унифицированное поле
    work_type = Column(Enum(WorkType), nullable=True)  # 'salon' или 'indie'
    salon_work_id = Column(Integer, ForeignKey("salon_masters.id"), nullable=True)
    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    salon = relationship("Salon")
    master = relationship("Master", back_populates="expense_types")
    salon_work = relationship("SalonMaster")
    indie_work = relationship("IndieMasterNew")
    expenses = relationship("Expense", back_populates="expense_type")

# Обновленная модель шаблонов расходов
class ExpenseTemplateUnified(Base):
    """Обновленная модель шаблонов расходов с унифицированной структурой"""
    __tablename__ = "expense_templates"

    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=True)  # Унифицированное поле
    work_type = Column(Enum(WorkType), nullable=True)  # 'salon' или 'indie'
    salon_work_id = Column(Integer, ForeignKey("salon_masters.id"), nullable=True)
    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    amount = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    salon = relationship("Salon")
    master = relationship("Master", back_populates="expense_templates")
    salon_work = relationship("SalonMaster")
    indie_work = relationship("IndieMasterNew")

# Обновленная модель пропущенных доходов
class MissedRevenueUnified(Base):
    """Обновленная модель пропущенных доходов с унифицированной структурой"""
    __tablename__ = "missed_revenues"

    id = Column(Integer, primary_key=True, index=True)
    salon_id = Column(Integer, ForeignKey("salons.id"), nullable=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=True)  # Унифицированное поле
    work_type = Column(Enum(WorkType), nullable=True)  # 'salon' или 'indie'
    salon_work_id = Column(Integer, ForeignKey("salon_masters.id"), nullable=True)
    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
    client_phone = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    reason = Column(Text, nullable=True)
    missed_date = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    salon = relationship("Salon")
    master = relationship("Master", back_populates="missed_revenues")
    salon_work = relationship("SalonMaster")
    indie_work = relationship("IndieMasterNew")

# Обновленная модель расписания независимых мастеров
class IndieMasterScheduleUnified(Base):
    """Обновленная модель расписания независимых мастеров с унифицированной структурой"""
    __tablename__ = "indie_master_schedules"

    id = Column(Integer, primary_key=True, index=True)
    master_id = Column(Integer, ForeignKey("masters.id"), nullable=False)  # Унифицированное поле
    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
    day_of_week = Column(Integer, nullable=False)  # 1-7 (понедельник-воскресенье)
    start_time = Column(String, nullable=False)  # "09:00"
    end_time = Column(String, nullable=False)  # "18:00"
    is_available = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    master = relationship("Master")
    indie_work = relationship("IndieMasterNew")

