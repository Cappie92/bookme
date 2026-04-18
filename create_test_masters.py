#!/usr/bin/env python3
"""
Скрипт для создания тестовых мастеров с разными уровнями подписки.
"""

import sys
import os
import secrets
import string
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from database import SessionLocal
from models import User, Master, Subscription, SubscriptionPlan, SubscriptionType, SubscriptionStatus
from auth import get_password_hash
from datetime import datetime
from utils.base62 import generate_unique_domain

def generate_password(length=12):
    """Генерирует случайный пароль"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def create_master_with_subscription(db, phone, email, full_name, plan_name, is_always_free=False):
    """Создает мастера с полными данными и подпиской"""
    
    # Генерируем пароль
    password = generate_password()
    hashed_password = get_password_hash(password)
    
    # Создаем пользователя
    user = User(
        email=email,
        phone=phone,
        full_name=full_name,
        hashed_password=hashed_password,
        role="master",
        is_active=True,
        is_verified=True,
        is_phone_verified=True,
        is_always_free=is_always_free,
        birth_date=datetime(1990, 1, 1).date()
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Создаем профиль мастера с полными данными
    master = Master(
        user_id=user.id,
        bio=f"Опытный мастер с многолетним стажем работы. Специализируюсь на качественном обслуживании клиентов.",
        experience_years=5,
        can_work_independently=True,
        can_work_in_salon=False,
        website="https://example.com",
        logo=None,
        photo=None,
        use_photo_as_logo=False,
        address="г. Москва, ул. Тестовая, д. 1, кв. 1",
        background_color="#ffffff",
        city="Москва",
        timezone="Europe/Moscow",
        auto_confirm_bookings=False,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    
    # Генерируем domain для мастера
    master.domain = generate_unique_domain(master.id, db)
    db.commit()
    db.refresh(master)
    
    # Получаем план подписки
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.name == plan_name,
        SubscriptionPlan.subscription_type == SubscriptionType.MASTER
    ).first()
    
    if not plan:
        print(f"  ⚠ План {plan_name} не найден, пропускаем создание подписки")
        return user, master, password, None
    
    # Создаем подписку
    subscription = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=datetime.utcnow(),
        end_date=datetime(2099, 12, 31) if is_always_free else datetime.utcnow().replace(year=datetime.utcnow().year + 1),
        price=0.0 if is_always_free else plan.price_monthly,
        daily_rate=0.0 if is_always_free else plan.price_monthly / 30.0,
        auto_renewal=False if is_always_free else True,
        is_active=True,
        master_bookings=0
    )
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    
    return user, master, password, subscription

def update_existing_master(db, phone, plan_name):
    """Обновляет существующего мастера, устанавливая is_always_free и подписку"""
    
    user = db.query(User).filter(User.phone == phone).first()
    if not user:
        print(f"  ✗ Пользователь с номером {phone} не найден")
        return None, None, None
    
    master = db.query(Master).filter(Master.user_id == user.id).first()
    if not master:
        print(f"  ✗ Профиль мастера для {phone} не найден")
        return None, None, None
    
    print(f"  ✓ Найден пользователь: {user.full_name} (ID: {user.id})")
    print(f"  ✓ Найден мастер (ID: {master.id})")
    
    # Устанавливаем is_always_free
    user.is_always_free = True
    db.commit()
    db.refresh(user)
    print(f"  ✓ Установлен is_always_free = True")
    
    # Получаем план подписки
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.name == plan_name,
        SubscriptionPlan.subscription_type == SubscriptionType.MASTER
    ).first()
    
    if not plan:
        print(f"  ⚠ План {plan_name} не найден")
        return user, master, None
    
    # Проверяем существующую подписку
    existing_subscription = db.query(Subscription).filter(
        Subscription.user_id == user.id,
        Subscription.subscription_type == SubscriptionType.MASTER
    ).first()
    
    if existing_subscription:
        # Обновляем существующую подписку
        existing_subscription.plan_id = plan.id
        existing_subscription.status = SubscriptionStatus.ACTIVE
        existing_subscription.start_date = datetime.utcnow()
        existing_subscription.end_date = datetime(2099, 12, 31)
        existing_subscription.price = 0.0
        existing_subscription.daily_rate = 0.0
        existing_subscription.auto_renewal = False
        existing_subscription.is_active = True
        db.commit()
        db.refresh(existing_subscription)
        print(f"  ✓ Обновлена подписка: plan_id={existing_subscription.plan_id}, plan_name={plan.name}")
        subscription = existing_subscription
    else:
        # Создаем новую подписку
        subscription = Subscription(
            user_id=user.id,
            subscription_type=SubscriptionType.MASTER,
            plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE,
            start_date=datetime.utcnow(),
            end_date=datetime(2099, 12, 31),
            price=0.0,
            daily_rate=0.0,
            auto_renewal=False,
            is_active=True,
            master_bookings=0
        )
        db.add(subscription)
        db.commit()
        db.refresh(subscription)
        print(f"  ✓ Создана подписка: plan_id={subscription.plan_id}, plan_name={plan.name}")
    
    return user, master, subscription

def main():
    print("\n" + "="*70)
    print("  СОЗДАНИЕ ТЕСТОВЫХ МАСТЕРОВ С РАЗНЫМИ УРОВНЯМИ ПОДПИСКИ")
    print("="*70 + "\n")
    
    db = SessionLocal()
    created_masters = []
    
    try:
        # 1. Обновляем существующего мастера +79435774916
        print("1. Обновление существующего мастера +79435774916")
        print("-" * 70)
        user, master, subscription = update_existing_master(db, "+79435774916", "Premium")
        if user and master:
            created_masters.append({
                "phone": user.phone,
                "email": user.email,
                "password": "Используйте существующий пароль",
                "plan": "Premium (ID: 4)",
                "is_always_free": True,
                "domain": master.domain
            })
            print(f"  ✓ Domain: {master.domain}")
        print()
        
        # 2. Создаем 3 новых мастеров
        # Генерируем уникальные email и телефоны с timestamp
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        new_masters = [
            {
                "phone": f"+794357749{timestamp[-1]}1",
                "email": f"master_free_{timestamp}@test.com",
                "full_name": "Мастер Free",
                "plan": "Free",
                "is_always_free": False
            },
            {
                "phone": f"+794357749{timestamp[-1]}2",
                "email": f"master_basic_{timestamp}@test.com",
                "full_name": "Мастер Basic",
                "plan": "Basic",
                "is_always_free": False
            },
            {
                "phone": f"+794357749{timestamp[-1]}3",
                "email": f"master_pro_{timestamp}@test.com",
                "full_name": "Мастер Pro",
                "plan": "Pro",
                "is_always_free": False
            }
        ]
        
        for i, master_data in enumerate(new_masters, start=2):
            print(f"{i}. Создание мастера {master_data['full_name']}")
            print("-" * 70)
            user, master, password, subscription = create_master_with_subscription(
                db,
                master_data["phone"],
                master_data["email"],
                master_data["full_name"],
                master_data["plan"],
                master_data["is_always_free"]
            )
            
            if user and master:
                created_masters.append({
                    "phone": user.phone,
                    "email": user.email,
                    "password": password,
                    "plan": f"{master_data['plan']} (ID: {subscription.plan_id if subscription else 'NO'})",
                    "is_always_free": master_data["is_always_free"],
                    "domain": master.domain,
                    "full_name": master_data["full_name"]
                })
                print(f"  ✓ Создан пользователь: {user.phone} (ID: {user.id})")
                print(f"  ✓ Создан мастер (ID: {master.id})")
                print(f"  ✓ Domain: {master.domain}")
                if subscription:
                    print(f"  ✓ Создана подписка: plan_id={subscription.plan_id}, plan_name={master_data['plan']}")
            print()
        
        # Выводим итоговую информацию
        print("\n" + "="*70)
        print("  ИТОГОВАЯ ИНФОРМАЦИЯ О СОЗДАННЫХ МАСТЕРАХ")
        print("="*70 + "\n")
        
        print(f"{'№':<3} {'Телефон':<15} {'Email':<25} {'План подписки':<20} {'Пароль':<15}")
        print("-" * 100)
        
        for idx, master_info in enumerate(created_masters, start=1):
            password_display = master_info["password"][:12] + "..." if len(master_info["password"]) > 12 else master_info["password"]
            print(f"{idx:<3} {master_info['phone']:<15} {master_info['email']:<25} {master_info['plan']:<20} {password_display:<15}")
        
        print("\n" + "="*70)
        print("  ДЕТАЛЬНАЯ ИНФОРМАЦИЯ С ПАРОЛЯМИ")
        print("="*70 + "\n")
        
        for idx, master_info in enumerate(created_masters, start=1):
            master_name = master_info.get('full_name', 'Существующий мастер')
            if idx == 1:
                master_name = "Существующий мастер (+79435774916)"
            print(f"{idx}. {master_name}")
            print(f"   Телефон: {master_info['phone']}")
            print(f"   Email: {master_info['email']}")
            print(f"   Пароль: {master_info['password']}")
            print(f"   План подписки: {master_info['plan']}")
            print(f"   Always Free: {'Да' if master_info['is_always_free'] else 'Нет'}")
            print(f"   Domain: {master_info['domain']}")
            print()
        
    except Exception as e:
        print(f"\n✗ Ошибка: {str(e)}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()
    
    print("="*70)
    print("  ГОТОВО!")
    print("="*70 + "\n")

if __name__ == "__main__":
    main()

