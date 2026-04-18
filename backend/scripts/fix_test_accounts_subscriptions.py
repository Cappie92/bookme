#!/usr/bin/env python3
"""
Скрипт для проверки и исправления тестовых аккаунтов с подписками.
Также создает тестовые аккаунты для Premium плана.
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from database import SessionLocal
from models import (
    User, UserRole, Master, Subscription, SubscriptionPlan, 
    SubscriptionType, SubscriptionStatus
)
from auth import get_password_hash

# Тестовые аккаунты для проверки и исправления
TEST_ACCOUNTS = [
    {
        "phone": "+79435774916",
        "email": "indie_master1@test.com",
        "full_name": "Индивидуальный мастер 12",
        "plan_name": "Premium",
        "is_always_free": True,
        "password": "test123"
    },
    {
        "phone": "+79435774941",
        "email": "master_free_20251127002434@test.com",
        "full_name": "Мастер Free",
        "plan_name": "Free",
        "is_always_free": False,
        "password": "test123"
    },
    {
        "phone": "+79435774942",
        "email": "master_basic_20251127002434@test.com",
        "full_name": "Мастер Basic",
        "plan_name": "Basic",
        "is_always_free": False,
        "password": "test123"
    },
    {
        "phone": "+79435774943",
        "email": "master_pro_20251127002434@test.com",
        "full_name": "Мастер Pro",
        "plan_name": "Pro",
        "is_always_free": False,
        "password": "test123"
    },
    {
        "phone": "+79435774911",
        "email": "master_free_20251127002501@test.com",
        "full_name": "Мастер Free",
        "plan_name": "Free",
        "is_always_free": False,
        "password": "test123"
    },
    {
        "phone": "+79435774912",
        "email": "master_basic_20251127002501@test.com",
        "full_name": "Мастер Basic",
        "plan_name": "Basic",
        "is_always_free": False,
        "password": "test123"
    },
    {
        "phone": "+79435774913",
        "email": "master_pro_20251127002501@test.com",
        "full_name": "Мастер Pro",
        "plan_name": "Pro",
        "is_always_free": False,
        "password": "test123"
    },
]

# Новые Premium аккаунты для создания
NEW_PREMIUM_ACCOUNTS = [
    {
        "phone": "+79435774914",
        "email": "master_premium_20251127002501@test.com",
        "full_name": "Мастер Premium",
        "plan_name": "Premium",
        "is_always_free": False,
        "password": "test123"
    },
    {
        "phone": "+79435774944",
        "email": "master_premium_20251127002434@test.com",
        "full_name": "Мастер Premium",
        "plan_name": "Premium",
        "is_always_free": False,
        "password": "test123"
    },
]

def fix_test_accounts():
    """Проверяет и исправляет тестовые аккаунты"""
    db: Session = SessionLocal()
    
    try:
        print("=" * 60)
        print("🔍 ПРОВЕРКА И ИСПРАВЛЕНИЕ ТЕСТОВЫХ АККАУНТОВ")
        print("=" * 60)
        
        # Получаем все планы
        plans = {plan.name: plan for plan in db.query(SubscriptionPlan).filter(
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).all()}
        
        print(f"\n📋 Найдено планов: {', '.join(plans.keys())}\n")
        
        # Проверяем и исправляем существующие аккаунты
        for account_data in TEST_ACCOUNTS:
            phone = account_data["phone"]
            plan_name = account_data["plan_name"]
            is_always_free = account_data["is_always_free"]
            
            print(f"🔍 Проверка аккаунта: {phone} ({account_data['full_name']})")
            
            # Находим пользователя
            user = db.query(User).filter(User.phone == phone).first()
            
            if not user:
                print(f"   ⚠️  Пользователь не найден, создаем...")
                user = User(
                    email=account_data["email"],
                    phone=phone,
                    full_name=account_data["full_name"],
                    hashed_password=get_password_hash(account_data["password"]),
                    role=UserRole.MASTER,
                    is_active=True,
                    is_verified=True,
                    is_phone_verified=True,
                    is_always_free=is_always_free
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                print(f"   ✅ Пользователь создан (ID: {user.id})")
                
                # Создаем профиль мастера
                master = db.query(Master).filter(Master.user_id == user.id).first()
                if not master:
                    master = Master(
                        user_id=user.id,
                        can_work_independently=True
                    )
                    db.add(master)
                    db.commit()
                    print(f"   ✅ Профиль мастера создан")
            else:
                print(f"   ✅ Пользователь найден (ID: {user.id})")
                
                # Обновляем is_always_free если нужно
                if user.is_always_free != is_always_free:
                    print(f"   🔧 Исправляем is_always_free: {user.is_always_free} -> {is_always_free}")
                    user.is_always_free = is_always_free
                    db.commit()
            
            # Проверяем подписку
            subscription = db.query(Subscription).filter(
                Subscription.user_id == user.id,
                Subscription.subscription_type == SubscriptionType.MASTER
            ).first()
            
            plan = plans.get(plan_name)
            if not plan:
                print(f"   ❌ План '{plan_name}' не найден!")
                continue
            
            if not subscription:
                print(f"   ⚠️  Подписка не найдена, создаем...")
                # Для Premium с Always Free делаем подписку до 2099 года
                if plan_name == "Premium" and is_always_free:
                    end_date = datetime(2099, 12, 31)
                else:
                    end_date = datetime.utcnow() + timedelta(days=365)
                
                start_date = datetime.utcnow()
                total_days = (end_date - start_date).days
                total_price = plan.price_1month * 12 if plan.price_1month > 0 else 0
                daily_rate = total_price / total_days if total_days > 0 else 0
                
                subscription = Subscription(
                    user_id=user.id,
                    subscription_type=SubscriptionType.MASTER,
                    plan_id=plan.id,
                    status=SubscriptionStatus.ACTIVE,
                    start_date=start_date,
                    end_date=end_date,
                    price=total_price,
                    daily_rate=daily_rate
                )
                db.add(subscription)
                db.commit()
                print(f"   ✅ Подписка создана (план: {plan_name}, до: {end_date.date()})")
            else:
                # Проверяем, что план правильный
                current_plan = db.query(SubscriptionPlan).filter(
                    SubscriptionPlan.id == subscription.plan_id
                ).first()
                
                if current_plan.name != plan_name:
                    print(f"   🔧 Исправляем план: {current_plan.name} -> {plan_name}")
                    subscription.plan_id = plan.id
                    db.commit()
                
                # Проверяем статус
                if subscription.status != SubscriptionStatus.ACTIVE:
                    print(f"   🔧 Исправляем статус: {subscription.status.value} -> ACTIVE")
                    subscription.status = SubscriptionStatus.ACTIVE
                    db.commit()
                
                # Для Premium с Always Free обновляем дату окончания
                if plan_name == "Premium" and is_always_free:
                    if subscription.end_date.year < 2099:
                        print(f"   🔧 Обновляем дату окончания для Always Free")
                        subscription.end_date = datetime(2099, 12, 31)
                        db.commit()
                
                print(f"   ✅ Подписка в порядке (план: {current_plan.name if current_plan else plan_name}, статус: {subscription.status.value})")
            
            print()
        
        # Создаем новые Premium аккаунты
        print("=" * 60)
        print("➕ СОЗДАНИЕ НОВЫХ PREMIUM АККАУНТОВ")
        print("=" * 60)
        
        premium_plan = plans.get("Premium")
        if not premium_plan:
            print("❌ План Premium не найден!")
            return
        
        for account_data in NEW_PREMIUM_ACCOUNTS:
            phone = account_data["phone"]
            
            print(f"\n🔍 Проверка Premium аккаунта: {phone}")
            
            # Проверяем, существует ли уже
            user = db.query(User).filter(User.phone == phone).first()
            
            if user:
                print(f"   ⚠️  Пользователь уже существует, пропускаем")
                continue
            
            # Создаем пользователя
            user = User(
                email=account_data["email"],
                phone=phone,
                full_name=account_data["full_name"],
                hashed_password=get_password_hash(account_data["password"]),
                role=UserRole.MASTER,
                is_active=True,
                is_verified=True,
                is_phone_verified=True,
                is_always_free=False
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"   ✅ Пользователь создан (ID: {user.id})")
            
            # Создаем профиль мастера
            master = Master(
                user_id=user.id,
                can_work_independently=True
            )
            db.add(master)
            db.commit()
            print(f"   ✅ Профиль мастера создан")
            
            # Создаем подписку Premium
            start_date = datetime.utcnow()
            end_date = start_date + timedelta(days=365)
            total_price = premium_plan.price_1month * 12
            daily_rate = total_price / 365
            
            subscription = Subscription(
                user_id=user.id,
                subscription_type=SubscriptionType.MASTER,
                plan_id=premium_plan.id,
                status=SubscriptionStatus.ACTIVE,
                start_date=start_date,
                end_date=end_date,
                price=total_price,
                daily_rate=daily_rate
            )
            db.add(subscription)
            db.commit()
            print(f"   ✅ Подписка Premium создана (до: {end_date.date()})")
        
        print("\n" + "=" * 60)
        print("✅ ВСЕ АККАУНТЫ ПРОВЕРЕНЫ И ИСПРАВЛЕНЫ")
        print("=" * 60)
        
        # Выводим итоговую таблицу
        print("\n📊 ИТОГОВАЯ ТАБЛИЦА АККАУНТОВ:")
        print("-" * 60)
        print(f"{'Телефон':<15} {'Email':<35} {'План':<10} {'Always Free':<12} {'Статус':<10}")
        print("-" * 60)
        
        all_accounts = TEST_ACCOUNTS + NEW_PREMIUM_ACCOUNTS
        for account_data in all_accounts:
            user = db.query(User).filter(User.phone == account_data["phone"]).first()
            if user:
                subscription = db.query(Subscription).filter(
                    Subscription.user_id == user.id,
                    Subscription.subscription_type == SubscriptionType.MASTER
                ).first()
                
                if subscription:
                    plan = db.query(SubscriptionPlan).filter(
                        SubscriptionPlan.id == subscription.plan_id
                    ).first()
                    plan_name = plan.name if plan else "N/A"
                    status = subscription.status.value if subscription else "N/A"
                else:
                    plan_name = "N/A"
                    status = "N/A"
                
                always_free = "Да" if user.is_always_free else "Нет"
                email_short = account_data["email"][:33] + "..." if len(account_data["email"]) > 33 else account_data["email"]
                
                print(f"{account_data['phone']:<15} {email_short:<35} {plan_name:<10} {always_free:<12} {status:<10}")
        
        print("-" * 60)
        
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    fix_test_accounts()

