#!/usr/bin/env python3
"""
Скрипт для создания тестовых пользователей системы балансов и подписок.
Создает пользователей с различными сценариями для тестирования:
- Разные планы подписок
- Разные состояния балансов
- С резервами и без резервов
- С историей списаний
- С заморозками
"""

import sys
import os
import json
from datetime import datetime, timedelta, date, time
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import (
    User, UserBalance, BalanceTransaction, Subscription, SubscriptionPlan,
    SubscriptionType, SubscriptionStatus, TransactionType, SubscriptionReservation,
    DailySubscriptionCharge, DailyChargeStatus, SubscriptionFreeze, UserRole, Master
)
from utils.balance_utils import (
    get_or_create_user_balance,
    add_balance_transaction, reserve_full_subscription_price, move_available_to_reserve,
    get_user_available_balance
)
from auth import get_password_hash

from constants import duration_months_to_days

LOG_FILE_PATH = Path(__file__).parent / "test_users_balance_system.log.jsonl"


def get_subscription_plans_from_db(db: Session) -> dict:
    """Получить все активные планы подписок для мастеров из БД"""
    plans = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.subscription_type == SubscriptionType.MASTER,
        SubscriptionPlan.is_active == True
    ).all()
    
    plans_map = {}
    for plan in plans:
        plans_map[plan.name] = plan
    
    return plans_map


def ensure_test_user(db: Session, phone: str, role: str = 'master', password: str = 'test123') -> User:
    """Создать или найти тестового пользователя"""
    user = db.query(User).filter(User.phone == phone).first()
    
    if not user:
        user_role = UserRole.MASTER if role == 'master' else UserRole.SALON
        
        user = User(
            phone=phone,
            role=user_role,
            hashed_password=get_password_hash(password),
            is_verified=True,
            is_phone_verified=True,
            is_active=True,
            is_always_free=False
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"  ✓ Создан пользователь: {phone} (ID: {user.id}, пароль: {password})")
        
        # Если пользователь - мастер, создаем профиль мастера
        if user_role == UserRole.MASTER:
            master = db.query(Master).filter(Master.user_id == user.id).first()
            if not master:
                from utils.base62 import generate_unique_domain
                master = Master(
                    user_id=user.id,
                    bio="",
                    experience_years=0,
                    can_work_independently=True,
                    can_work_in_salon=True,
                    website=None,
                    created_at=datetime.utcnow()
                )
                db.add(master)
                db.commit()
                db.refresh(master)
                
                # Генерируем domain для мастера
                master.domain = generate_unique_domain(master.id, db)
                db.commit()
                print(f"  ✓ Создан профиль мастера для пользователя: {phone} (Master ID: {master.id})")
    else:
        # Обновляем пароль, если его нет
        if not user.hashed_password:
            user.hashed_password = get_password_hash(password)
            db.commit()
            print(f"  ✓ Установлен пароль для пользователя: {phone}")
        print(f"  ✓ Найден пользователь: {phone} (ID: {user.id})")
        
        # Если пользователь - мастер, проверяем наличие профиля мастера
        if user.role == UserRole.MASTER:
            master = db.query(Master).filter(Master.user_id == user.id).first()
            if not master:
                from utils.base62 import generate_unique_domain
                master = Master(
                    user_id=user.id,
                    bio="",
                    experience_years=0,
                    can_work_independently=True,
                    can_work_in_salon=True,
                    website=None,
                    created_at=datetime.utcnow()
                )
                db.add(master)
                db.commit()
                db.refresh(master)
                
                # Генерируем domain для мастера
                master.domain = generate_unique_domain(master.id, db)
                db.commit()
                print(f"  ✓ Создан профиль мастера для существующего пользователя: {phone} (Master ID: {master.id})")
    
    return user


def ensure_user_balance(db: Session, user_id: int, initial_balance_rubles: float) -> UserBalance:
    """Создать или пополнить баланс пользователя"""
    balance = get_or_create_user_balance(db, user_id)
    
    target_balance_rubles = initial_balance_rubles
    if balance.balance < target_balance_rubles:
        amount_to_add = target_balance_rubles - balance.balance
        balance.balance += amount_to_add
        db.commit()
        
        add_balance_transaction(
            db=db,
            user_id=user_id,
            amount=amount_to_add,
            transaction_type=TransactionType.DEPOSIT,
            description=f"Тестовый баланс для тестирования системы"
        )
        print(f"  ✓ Баланс установлен: {initial_balance_rubles} ₽")
    else:
        print(f"  ✓ Баланс уже достаточен: {balance.balance:.2f} ₽")
    
    return balance


def create_test_subscription(
    db: Session,
    user_id: int,
    plan: SubscriptionPlan,
    payment_period: str = 'month',
    start_date: datetime = None,
    end_date: datetime = None,
    days_offset: int = 0
) -> Subscription:
    """Создать тестовую подписку"""
    if start_date is None:
        start_date = datetime.utcnow() + timedelta(days=days_offset)
    
    if end_date is None:
        if payment_period == 'year':
            total_days = duration_months_to_days(12)
            monthly_price = plan.price_12months
            total_price = monthly_price * 12
        else:
            total_days = duration_months_to_days(1)
            monthly_price = plan.price_1month
            total_price = monthly_price

        end_date = start_date + timedelta(days=total_days)
    else:
        # Рассчитываем цену на основе фактического периода
        total_days = (end_date - start_date).days
        if payment_period == 'year':
            monthly_price = plan.price_12months
            total_price = monthly_price * 12
        else:
            monthly_price = plan.price_1month
            total_price = monthly_price
    
    daily_rate = total_price / total_days if total_days > 0 else 0
    
    # Проверяем существующую подписку
    existing_sub = db.query(Subscription).filter(
        Subscription.user_id == user_id,
        Subscription.subscription_type == SubscriptionType.MASTER,
        Subscription.is_active == True
    ).first()
    
    if existing_sub:
        # Обновляем существующую
        existing_sub.plan_id = plan.id
        existing_sub.price = total_price
        existing_sub.daily_rate = daily_rate
        existing_sub.start_date = start_date
        existing_sub.end_date = end_date
        existing_sub.payment_period = payment_period
        existing_sub.status = SubscriptionStatus.ACTIVE
        existing_sub.is_active = True
        db.commit()
        db.refresh(existing_sub)
        print(f"  ✓ Подписка обновлена (ID: {existing_sub.id})")
        return existing_sub
    
    # Создаем новую
    subscription = Subscription(
        user_id=user_id,
        subscription_type=SubscriptionType.MASTER,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=start_date,
        end_date=end_date,
        price=total_price,
        daily_rate=daily_rate,
        payment_period=payment_period,
        auto_renewal=True,
        is_active=True,
        salon_branches=0,
        salon_employees=0,
        master_bookings=0
    )
    
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    print(f"  ✓ Подписка создана (ID: {subscription.id}, daily_rate: {daily_rate:.2f} ₽/день)")
    return subscription


def create_subscription_reservation(
    db: Session,
    subscription: Subscription,
    reserve_amount_rubles: float = None
) -> SubscriptionReservation:
    """Создать резерв для подписки"""
    if reserve_amount_rubles is None:
        # Резервируем полную стоимость подписки
        reserve_amount_rubles = subscription.price
    
    reserve_amount_rubles = reserve_amount_rubles
    
    # Проверяем существующий резерв
    reservation = db.query(SubscriptionReservation).filter(
        SubscriptionReservation.subscription_id == subscription.id
    ).first()
    
    if reservation:
        reservation.reserved_amount = reserve_amount_rubles
        db.commit()
        db.refresh(reservation)
        print(f"  ✓ Резерв обновлен: {reserve_amount_rubles} ₽")
    else:
        # Создаем новый резерв
        reservation = SubscriptionReservation(
            user_id=subscription.user_id,
            subscription_id=subscription.id,
            reserved_amount=reserve_amount_rubles
        )
        db.add(reservation)
        db.commit()
        db.refresh(reservation)
        print(f"  ✓ Резерв создан: {reserve_amount_rubles} ₽")
    
    # Перемещаем средства в резерв
    if not move_available_to_reserve(db, subscription, reserve_amount_rubles):
        print(f"  ⚠️  Не удалось переместить средства в резерв (недостаточно доступного баланса)")
    
    return reservation


def create_daily_charge_history(
    db: Session,
    subscription: Subscription,
    days_back: int,
    days_forward: int = 0
) -> list:
    """Создать историю ежедневных списаний"""
    charges = []
    today = date.today()
    
    # Создаем списания за прошлые дни
    for i in range(days_back):
        charge_date = today - timedelta(days=days_back - i)
        
        # Проверяем, что дата в пределах подписки
        if charge_date < subscription.start_date.date() or charge_date >= subscription.end_date.date():
            continue
        
        # Проверяем, не было ли уже списания
        existing = db.query(DailySubscriptionCharge).filter(
            DailySubscriptionCharge.subscription_id == subscription.id,
            DailySubscriptionCharge.charge_date == charge_date
        ).first()
        
        if existing:
            continue
        
        # Получаем баланс на момент списания
        user_balance = get_or_create_user_balance(db, subscription.user_id)
        balance_before = user_balance.balance
        
        # Проверяем резерв
        reservation = db.query(SubscriptionReservation).filter(
            SubscriptionReservation.subscription_id == subscription.id
        ).first()
        
        daily_rate_rubles = subscription.daily_rate
        
        if reservation and reservation.reserved_amount >= daily_rate_rubles:
            # Успешное списание
            reservation.reserved_amount -= daily_rate_rubles
            user_balance.balance -= daily_rate_rubles
            db.commit()
            
            balance_after = user_balance.balance
            status = DailyChargeStatus.SUCCESS
        else:
            # Неуспешное списание
            balance_after = balance_before
            status = DailyChargeStatus.FAILED
        
        charge = DailySubscriptionCharge(
            subscription_id=subscription.id,
            charge_date=charge_date,
            amount=daily_rate_rubles,
            daily_rate=daily_rate_rubles,
            balance_before=balance_before,
            balance_after=balance_after,
            status=status
        )
        
        db.add(charge)
        db.commit()
        charges.append(charge)
        print(f"  ✓ Списание за {charge_date}: {subscription.daily_rate:.2f} ₽, status={status.value}")
    
    return charges


def create_subscription_freeze(
    db: Session,
    subscription: Subscription,
    start_date: date,
    end_date: date
) -> SubscriptionFreeze:
    """Создать заморозку подписки"""
    start_datetime = datetime.combine(start_date, time.min)
    end_datetime = datetime.combine(end_date, time.max.replace(second=59, microsecond=999999))
    
    freeze_days = (end_date - start_date).days + 1
    
    freeze = SubscriptionFreeze(
        subscription_id=subscription.id,
        start_date=start_datetime,
        end_date=end_datetime,
        freeze_days=freeze_days,
        is_cancelled=False
    )
    
    db.add(freeze)
    db.commit()
    db.refresh(freeze)
    print(f"  ✓ Заморозка создана: {start_date} - {end_date} ({freeze_days} дней)")
    return freeze


def log_test_user_to_file(user_data: dict, log_file_path: Path):
    """Логировать данные тестового пользователя в файл"""
    with open(log_file_path, 'a', encoding='utf-8') as f:
        json.dump(user_data, f, ensure_ascii=False, default=str)
        f.write('\n')


def create_test_users_balance_system():
    """Создать всех тестовых пользователей"""
    db: Session = SessionLocal()
    
    try:
        print("=== СОЗДАНИЕ ТЕСТОВЫХ ПОЛЬЗОВАТЕЛЕЙ СИСТЕМЫ БАЛАНСОВ ===\n")
        
        # Получаем планы из БД
        plans_map = get_subscription_plans_from_db(db)
        print(f"Найдено планов: {len(plans_map)}")
        for name, plan in plans_map.items():
            print(f"  - {name} (ID: {plan.id}, price_1month: {plan.price_1month} ₽)")
        print()
        
        # Создаем файл логов
        if LOG_FILE_PATH.exists():
            LOG_FILE_PATH.unlink()  # Удаляем старый файл
        LOG_FILE_PATH.touch()
        print(f"Файл логов: {LOG_FILE_PATH}\n")
        
        success_count = 0
        error_count = 0
        
        # ===== ГРУППА 1: Мастера с разными планами подписок =====
        print("=== ГРУППА 1: Мастера с разными планами подписок ===\n")
        
        # 1.1. Мастер с планом "Free" (базовая подписка)
        try:
            print("1.1. Мастер с планом Free (базовая подписка)")
            print("  Телефон: +79990000001")
            user = ensure_test_user(db, "+79990000001", "master")
            balance = ensure_user_balance(db, user.id, 10000)
            
            plan = plans_map.get("AlwaysFree") or plans_map.get("Free")
            if plan:
                subscription = create_test_subscription(db, user.id, plan, "month")
                # Для Free плана резерв не создаем (цена 0)
                
                user_data = {
                    "phone": "+79990000001",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": balance.balance,
                    "reserved_balance_rubles": 0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": plan.name,
                        "plan_id": plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period
                    },
                    "reservation": None,
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с планом Free (базовая подписка)"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  План Free/AlwaysFree не найден, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # 1.2. Мастер с планом "Basic" (без резерва - проблемный случай)
        try:
            print("1.2. Мастер с планом Basic (без резерва - проблемный случай)")
            print("  Телефон: +79990000002")
            user = ensure_test_user(db, "+79990000002", "master")
            balance = ensure_user_balance(db, user.id, 50000)
            
            plan = plans_map.get("Basic")
            if plan:
                subscription = create_test_subscription(db, user.id, plan, "month")
                # НЕ создаем резерв - это проблемный случай
                
                user_data = {
                    "phone": "+79990000002",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": balance.balance,
                    "reserved_balance_rubles": 0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": plan.name,
                        "plan_id": plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period
                    },
                    "reservation": None,
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с планом Basic (без резерва - проблемный случай)"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  План Basic не найден, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # 1.3. Мастер с планом "Pro" (с достаточным резервом)
        try:
            print("1.3. Мастер с планом Pro (с достаточным резервом)")
            print("  Телефон: +79990000003")
            user = ensure_test_user(db, "+79990000003", "master")
            balance = ensure_user_balance(db, user.id, 100000)
            
            plan = plans_map.get("Pro")
            if plan:
                subscription = create_test_subscription(db, user.id, plan, "month")
                reservation = create_subscription_reservation(db, subscription)
                
                available_balance = get_user_available_balance(db, user.id)
                
                user_data = {
                    "phone": "+79990000003",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": available_balance,
                    "reserved_balance_rubles": reservation.reserved_amount if reservation else 0.0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": plan.name,
                        "plan_id": plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period
                    },
                    "reservation": {
                        "id": reservation.id,
                        "reserved_amount": reservation.reserved_amount if reservation else 0.0
                    },
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с планом Pro (с достаточным резервом)"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  План Pro не найден, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # 1.4. Мастер с планом "Premium" (с избыточным резервом)
        try:
            print("1.4. Мастер с планом Premium (с избыточным резервом)")
            print("  Телефон: +79990000004")
            user = ensure_test_user(db, "+79990000004", "master")
            balance = ensure_user_balance(db, user.id, 200000)
            
            plan = plans_map.get("Premium")
            if plan:
                subscription = create_test_subscription(db, user.id, plan, "month")
                # Резервируем на 60 дней (в 2 раза больше, чем нужно)
                reserve_amount = subscription.daily_rate * 60
                reservation = create_subscription_reservation(db, subscription, reserve_amount)
                
                available_balance = get_user_available_balance(db, user.id)
                
                user_data = {
                    "phone": "+79990000004",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": available_balance,
                    "reserved_balance_rubles": reservation.reserved_amount if reservation else 0.0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": plan.name,
                        "plan_id": plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period
                    },
                    "reservation": {
                        "id": reservation.id,
                        "reserved_amount": reservation.reserved_amount if reservation else 0.0
                    },
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с планом Premium (с избыточным резервом)"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  План Premium не найден, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # 1.5. Мастер с планом "Pro" (недостаточный резерв)
        try:
            print("1.5. Мастер с планом Pro (недостаточный резерв)")
            print("  Телефон: +79990000005")
            user = ensure_test_user(db, "+79990000005", "master")
            balance = ensure_user_balance(db, user.id, 50000)
            
            plan = plans_map.get("Pro")
            if plan:
                subscription = create_test_subscription(db, user.id, plan, "month")
                # Резервируем только на 10 дней
                reserve_amount = subscription.daily_rate * 10
                reservation = create_subscription_reservation(db, subscription, reserve_amount)
                
                available_balance = get_user_available_balance(db, user.id)
                
                user_data = {
                    "phone": "+79990000005",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": available_balance,
                    "reserved_balance_rubles": reservation.reserved_amount if reservation else 0.0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": plan.name,
                        "plan_id": plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period
                    },
                    "reservation": {
                        "id": reservation.id,
                        "reserved_amount": reservation.reserved_amount if reservation else 0.0
                    },
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с планом Pro (недостаточный резерв)"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  План Pro не найден, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # 1.6. Мастер с планом "Pro" (скоро истекает)
        try:
            print("1.6. Мастер с планом Pro (скоро истекает)")
            print("  Телефон: +79990000006")
            user = ensure_test_user(db, "+79990000006", "master")
            balance = ensure_user_balance(db, user.id, 100000)
            
            plan = plans_map.get("Pro")
            if plan:
                # Подписка истекает через 3 дня
                start_date = datetime.utcnow() - timedelta(days=27)
                end_date = datetime.utcnow() + timedelta(days=3)
                subscription = create_test_subscription(db, user.id, plan, "month", start_date, end_date)
                # Резервируем на 3 дня
                reserve_amount = subscription.daily_rate * 3
                reservation = create_subscription_reservation(db, subscription, reserve_amount)
                
                available_balance = get_user_available_balance(db, user.id)
                
                user_data = {
                    "phone": "+79990000006",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": available_balance,
                    "reserved_balance_rubles": reservation.reserved_amount if reservation else 0.0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": plan.name,
                        "plan_id": plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period
                    },
                    "reservation": {
                        "id": reservation.id,
                        "reserved_amount": reservation.reserved_amount if reservation else 0.0
                    },
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с планом Pro (скоро истекает)"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  План Pro не найден, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # 1.7. Мастер с планом "Pro" (замороженная подписка)
        try:
            print("1.7. Мастер с планом Pro (замороженная подписка)")
            print("  Телефон: +79990000007")
            user = ensure_test_user(db, "+79990000007", "master")
            balance = ensure_user_balance(db, user.id, 100000)
            
            plan = plans_map.get("Pro")
            if plan:
                subscription = create_test_subscription(db, user.id, plan, "month")
                reservation = create_subscription_reservation(db, subscription)
                
                # Создаем заморозку на сегодня и завтра
                today = date.today()
                tomorrow = today + timedelta(days=1)
                freeze = create_subscription_freeze(db, subscription, today, tomorrow)
                
                available_balance = get_user_available_balance(db, user.id)
                
                user_data = {
                    "phone": "+79990000007",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": available_balance,
                    "reserved_balance_rubles": reservation.reserved_amount if reservation else 0.0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": plan.name,
                        "plan_id": plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period
                    },
                    "reservation": {
                        "id": reservation.id,
                        "reserved_amount": reservation.reserved_amount if reservation else 0.0
                    },
                    "freeze": {
                        "id": freeze.id,
                        "start_date": freeze.start_date.date().isoformat(),
                        "end_date": freeze.end_date.date().isoformat(),
                        "freeze_days": freeze.freeze_days
                    },
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с планом Pro (замороженная подписка)"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  План Pro не найден, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # ===== ГРУППА 2: Мастера с разными состояниями баланса =====
        print("=== ГРУППА 2: Мастера с разными состояниями баланса ===\n")
        
        # 2.1. Мастер с нулевым балансом
        try:
            print("2.1. Мастер с нулевым балансом")
            print("  Телефон: +79990000008")
            user = ensure_test_user(db, "+79990000008", "master")
            balance = ensure_user_balance(db, user.id, 0)
            
            plan = plans_map.get("Pro")
            if plan:
                subscription = create_test_subscription(db, user.id, plan, "month")
                # Резерв не создаем (недостаточно средств)
                
                user_data = {
                    "phone": "+79990000008",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": 0,
                    "available_balance_rubles": 0,
                    "reserved_balance_rubles": 0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": plan.name,
                        "plan_id": plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period
                    },
                    "reservation": None,
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с нулевым балансом"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  План Pro не найден, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # 2.2. Мастер с минимальным балансом
        try:
            print("2.2. Мастер с минимальным балансом")
            print("  Телефон: +79990000009")
            user = ensure_test_user(db, "+79990000009", "master")
            balance = ensure_user_balance(db, user.id, 500)
            
            plan = plans_map.get("Basic")
            if plan:
                subscription = create_test_subscription(db, user.id, plan, "month")
                # Резервируем на 5 дней
                reserve_amount = subscription.daily_rate * 5
                reservation = create_subscription_reservation(db, subscription, reserve_amount)
                
                available_balance = get_user_available_balance(db, user.id)
                
                user_data = {
                    "phone": "+79990000009",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": available_balance,
                    "reserved_balance_rubles": reservation.reserved_amount if reservation else 0.0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": plan.name,
                        "plan_id": plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period
                    },
                    "reservation": {
                        "id": reservation.id,
                        "reserved_amount": reservation.reserved_amount if reservation else 0.0
                    },
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с минимальным балансом"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  План Basic не найден, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # 2.3. Мастер с очень большим балансом (Premium)
        try:
            print("2.3. Мастер с очень большим балансом (Premium)")
            print("  Телефон: +79990000010")
            user = ensure_test_user(db, "+79990000010", "master")
            balance = ensure_user_balance(db, user.id, 1000000)
            
            plan = plans_map.get("Premium")
            if plan:
                subscription = create_test_subscription(db, user.id, plan, "month")
                reservation = create_subscription_reservation(db, subscription)
                
                available_balance = get_user_available_balance(db, user.id)
                
                user_data = {
                    "phone": "+79990000010",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": available_balance,
                    "reserved_balance_rubles": reservation.reserved_amount if reservation else 0.0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": plan.name,
                        "plan_id": plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period
                    },
                    "reservation": {
                        "id": reservation.id,
                        "reserved_amount": reservation.reserved_amount if reservation else 0.0
                    },
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с очень большим балансом"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  План Pro не найден, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # ===== ГРУППА 3: Мастера с историей списаний =====
        print("=== ГРУППА 3: Мастера с историей списаний ===\n")
        
        # 3.1. Мастер с историей успешных списаний (Premium)
        try:
            print("3.1. Мастер с историей успешных списаний (Premium)")
            print("  Телефон: +79990000011")
            user = ensure_test_user(db, "+79990000011", "master")
            balance = ensure_user_balance(db, user.id, 100000)
            
            plan = plans_map.get("Premium")
            if plan:
                # Подписка создана 10 дней назад
                start_date = datetime.utcnow() - timedelta(days=10)
                end_date = start_date + timedelta(days=30)
                subscription = create_test_subscription(db, user.id, plan, "month", start_date, end_date)
                reservation = create_subscription_reservation(db, subscription)
                
                # Создаем историю списаний за последние 10 дней
                create_daily_charge_history(db, subscription, days_back=10)
                
                available_balance = get_user_available_balance(db, user.id)
                
                user_data = {
                    "phone": "+79990000011",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": available_balance,
                    "reserved_balance_rubles": reservation.reserved_amount if reservation else 0.0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": plan.name,
                        "plan_id": plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period
                    },
                    "reservation": {
                        "id": reservation.id,
                        "reserved_amount": reservation.reserved_amount if reservation else 0.0
                    },
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с историей успешных списаний"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  План Pro не найден, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # 3.2. Мастер с историей неуспешных списаний
        try:
            print("3.2. Мастер с историей неуспешных списаний")
            print("  Телефон: +79990000012")
            user = ensure_test_user(db, "+79990000012", "master")
            balance = ensure_user_balance(db, user.id, 50000)
            
            plan = plans_map.get("Pro")
            if plan:
                # Подписка создана 5 дней назад
                start_date = datetime.utcnow() - timedelta(days=5)
                end_date = start_date + timedelta(days=30)
                subscription = create_test_subscription(db, user.id, plan, "month", start_date, end_date)
                # Резервируем только на 3 дня (чтобы первые 3 списания были успешными, а последние 2 - неуспешными)
                reserve_amount = subscription.daily_rate * 3
                reservation = create_subscription_reservation(db, subscription, reserve_amount)
                
                # Создаем историю: 3 успешных списания, затем 2 неуспешных
                # Сначала создаем списания за первые 3 дня (успешные)
                # Затем создаем списания за последние 2 дня (неуспешные, так как резерв исчерпан)
                create_daily_charge_history(db, subscription, days_back=5)
                
                available_balance = get_user_available_balance(db, user.id)
                
                user_data = {
                    "phone": "+79990000012",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": available_balance,
                    "reserved_balance_rubles": reservation.reserved_amount if reservation else 0.0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": plan.name,
                        "plan_id": plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period
                    },
                    "reservation": {
                        "id": reservation.id,
                        "reserved_amount": reservation.reserved_amount if reservation else 0.0
                    },
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с историей неуспешных списаний"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  План Pro не найден, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # ===== ГРУППА 4: Сценарии автопродления =====
        print("=== ГРУППА 4: Сценарии автопродления ===\n")
        
        # 4.1. Мастер с автопродлением (достаточно средств)
        try:
            print("4.1. Мастер с автопродлением (достаточно средств)")
            print("  Телефон: +79990000013")
            user = ensure_test_user(db, "+79990000013", "master")
            balance = ensure_user_balance(db, user.id, 100000)
            
            plan = plans_map.get("Pro")
            if plan:
                # Подписка истекает завтра
                start_date = datetime.utcnow() - timedelta(days=29)
                end_date = datetime.utcnow() + timedelta(days=1)
                subscription = create_test_subscription(db, user.id, plan, "month", start_date, end_date)
                subscription.auto_renewal = True
                subscription.payment_period = "month"
                db.commit()
                
                # Резервируем на продление (полная стоимость следующего месяца)
                reserve_amount = plan.price_1month
                reservation = create_subscription_reservation(db, subscription, reserve_amount)
                
                available_balance = get_user_available_balance(db, user.id)
                
                user_data = {
                    "phone": "+79990000013",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": available_balance,
                    "reserved_balance_rubles": reservation.reserved_amount if reservation else 0.0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": plan.name,
                        "plan_id": plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period,
                        "auto_renewal": subscription.auto_renewal
                    },
                    "reservation": {
                        "id": reservation.id,
                        "reserved_amount": reservation.reserved_amount if reservation else 0.0
                    },
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с автопродлением (достаточно средств)"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  План Pro не найден, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # 4.2. Мастер с автопродлением (недостаточно средств)
        try:
            print("4.2. Мастер с автопродлением (недостаточно средств)")
            print("  Телефон: +79990000014")
            user = ensure_test_user(db, "+79990000014", "master")
            balance = ensure_user_balance(db, user.id, 2000)
            
            plan = plans_map.get("Pro")
            if plan:
                # Подписка истекает завтра
                start_date = datetime.utcnow() - timedelta(days=29)
                end_date = datetime.utcnow() + timedelta(days=1)
                subscription = create_test_subscription(db, user.id, plan, "month", start_date, end_date)
                subscription.auto_renewal = True
                subscription.payment_period = "month"
                db.commit()
                
                # Резервируем только 2000 руб (недостаточно для продления)
                reservation = create_subscription_reservation(db, subscription, 2000)
                
                available_balance = get_user_available_balance(db, user.id)
                
                user_data = {
                    "phone": "+79990000014",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": available_balance,
                    "reserved_balance_rubles": reservation.reserved_amount if reservation else 0.0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": plan.name,
                        "plan_id": plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period,
                        "auto_renewal": subscription.auto_renewal
                    },
                    "reservation": {
                        "id": reservation.id,
                        "reserved_amount": reservation.reserved_amount if reservation else 0.0
                    },
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с автопродлением (недостаточно средств)"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  План Pro не найден, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # ===== ГРУППА 5: Сценарии обновления подписки =====
        print("=== ГРУППА 5: Сценарии обновления подписки ===\n")
        
        # 5.1. Мастер с апгрейдом подписки
        try:
            print("5.1. Мастер с апгрейдом подписки")
            print("  Телефон: +79990000015")
            user = ensure_test_user(db, "+79990000015", "master")
            balance = ensure_user_balance(db, user.id, 100000)
            
            basic_plan = plans_map.get("Basic")
            pro_plan = plans_map.get("Pro")
            if basic_plan and pro_plan:
                # Создаем подписку на Basic с остатком 15 дней
                start_date = datetime.utcnow() - timedelta(days=15)
                end_date = start_date + timedelta(days=30)
                subscription = create_test_subscription(db, user.id, basic_plan, "month", start_date, end_date)
                # Резервируем остаток от Basic подписки
                remaining_days = (end_date - datetime.utcnow()).days
                reserve_amount = basic_plan.price_1month / duration_months_to_days(1) * remaining_days
                reservation = create_subscription_reservation(db, subscription, reserve_amount)
                
                available_balance = get_user_available_balance(db, user.id)
                
                user_data = {
                    "phone": "+79990000015",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": available_balance,
                    "reserved_balance_rubles": reservation.reserved_amount if reservation else 0.0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": basic_plan.name,
                        "plan_id": basic_plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period
                    },
                    "reservation": {
                        "id": reservation.id,
                        "reserved_amount": reservation.reserved_amount if reservation else 0.0
                    },
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с апгрейдом подписки (текущий план Basic, можно апгрейдить на Pro)"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  Планы Basic или Pro не найдены, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        # 5.2. Мастер с даунгрейдом подписки
        try:
            print("5.2. Мастер с даунгрейдом подписки")
            print("  Телефон: +79990000016")
            user = ensure_test_user(db, "+79990000016", "master")
            balance = ensure_user_balance(db, user.id, 100000)
            
            pro_plan = plans_map.get("Pro")
            basic_plan = plans_map.get("Basic")
            if pro_plan and basic_plan:
                # Создаем подписку на Pro с остатком 15 дней
                start_date = datetime.utcnow() - timedelta(days=15)
                end_date = start_date + timedelta(days=30)
                subscription = create_test_subscription(db, user.id, pro_plan, "month", start_date, end_date)
                # Резервируем остаток от Pro подписки
                remaining_days = (end_date - datetime.utcnow()).days
                reserve_amount = pro_plan.price_1month / duration_months_to_days(1) * remaining_days
                reservation = create_subscription_reservation(db, subscription, reserve_amount)
                
                available_balance = get_user_available_balance(db, user.id)
                
                user_data = {
                    "phone": "+79990000016",
                    "user_id": user.id,
                    "role": "master",
                    "balance_rubles": balance.balance,
                    "available_balance_rubles": available_balance,
                    "reserved_balance_rubles": reservation.reserved_amount if reservation else 0.0,
                    "subscription": {
                        "id": subscription.id,
                        "plan_name": pro_plan.name,
                        "plan_id": pro_plan.id,
                        "price": subscription.price,
                        "daily_rate": subscription.daily_rate,
                        "start_date": subscription.start_date.isoformat(),
                        "end_date": subscription.end_date.isoformat(),
                        "payment_period": subscription.payment_period
                    },
                    "reservation": {
                        "id": reservation.id,
                        "reserved_amount": reservation.reserved_amount if reservation else 0.0
                    },
                    "created_at": datetime.utcnow().isoformat(),
                    "scenario": "Мастер с даунгрейдом подписки (текущий план Pro, можно даунгрейдить на Basic)"
                }
                log_test_user_to_file(user_data, LOG_FILE_PATH)
                success_count += 1
            else:
                print("  ⚠️  Планы Pro или Basic не найдены, пропускаем")
                error_count += 1
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            error_count += 1
        print()
        
        print(f"\n=== РЕЗУЛЬТАТ ===")
        print(f"✅ Успешно создано: {success_count}")
        print(f"❌ Ошибок: {error_count}")
        print(f"📄 Логи сохранены в: {LOG_FILE_PATH}")
        
        return success_count > 0
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Критическая ошибка: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


if __name__ == "__main__":
    print("Создание тестовых пользователей системы балансов...\n")
    success = create_test_users_balance_system()
    if success:
        print("\n✅ Тестовые пользователи созданы!")
    else:
        print("\n⚠️  Некоторые пользователи не были созданы. Проверьте ошибки выше.")
        sys.exit(1)

