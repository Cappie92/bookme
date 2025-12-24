#!/usr/bin/env python3
"""
Скрипт для настройки тестовых аккаунтов:
1. Зачисление виртуальных денег на баланс (1 000 000 рублей)
2. Создание реальных подписок для указанных тарифов
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, UserBalance, BalanceTransaction, Subscription, SubscriptionPlan, SubscriptionType, SubscriptionStatus, TransactionType
from utils.balance_utils import get_or_create_user_balance, rubles_to_kopecks, add_balance_transaction
from datetime import datetime, timedelta

# Список тестовых аккаунтов с их тарифами
TEST_ACCOUNTS = [
    {"phone": "+79435774916", "plan": "Premium"},
    {"phone": "+79435774941", "plan": "Free"},
    {"phone": "+79435774942", "plan": "Basic"},
    {"phone": "+79435774943", "plan": "Pro"},
    {"phone": "+79435774911", "plan": "Free"},
    {"phone": "+79435774912", "plan": "Basic"},
    {"phone": "+79435774913", "plan": "Pro"},
    {"phone": "+79435774914", "plan": "Premium"},
    {"phone": "+79435774944", "plan": "Premium"},
]

# Сумма для зачисления на баланс (в рублях)
TEST_BALANCE_RUBLES = 1_000_000  # 1 миллион рублей
TEST_BALANCE_KOPECKS = rubles_to_kopecks(TEST_BALANCE_RUBLES)

def setup_test_accounts():
    """Настроить тестовые аккаунты: зачислить баланс и создать подписки"""
    db: Session = SessionLocal()
    
    try:
        print("=== НАСТРОЙКА ТЕСТОВЫХ АККАУНТОВ ===\n")
        
        # Получаем все планы для маппинга
        plans_map = {}
        plans = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).all()
        
        for plan in plans:
            plans_map[plan.name] = plan
        
        print(f"Найдено планов: {len(plans_map)}")
        for name, plan in plans_map.items():
            print(f"  - {name} (ID: {plan.id})")
        print()
        
        success_count = 0
        error_count = 0
        
        for account in TEST_ACCOUNTS:
            phone = account["phone"]
            plan_name = account["plan"]
            
            print(f"Обработка: {phone} -> {plan_name}")
            
            # Находим пользователя
            user = db.query(User).filter(User.phone == phone).first()
            if not user:
                print(f"  ❌ Пользователь не найден!")
                error_count += 1
                continue
            
            print(f"  ✓ Пользователь найден (ID: {user.id}, is_always_free: {user.is_always_free})")
            
            # Получаем план
            plan = plans_map.get(plan_name)
            if not plan:
                print(f"  ❌ План '{plan_name}' не найден!")
                error_count += 1
                continue
            
            print(f"  ✓ План найден (ID: {plan.id})")
            
            # Зачисляем баланс
            try:
                balance = get_or_create_user_balance(db, user.id)
                current_balance = balance.balance
                
                # Зачисляем только если баланс меньше тестового
                if current_balance < TEST_BALANCE_KOPECKS:
                    amount_to_add = TEST_BALANCE_KOPECKS - current_balance
                    balance.balance += amount_to_add
                    db.commit()
                    
                    # Создаем транзакцию
                    add_balance_transaction(
                        db=db,
                        user_id=user.id,
                        amount=amount_to_add,
                        transaction_type=TransactionType.DEPOSIT,
                        description=f"Тестовый баланс для аккаунта {phone}"
                    )
                    
                    print(f"  ✓ Баланс зачислен: {rubles_to_kopecks(TEST_BALANCE_RUBLES) / 100:.2f} ₽")
                else:
                    print(f"  ⚠️  Баланс уже достаточен: {current_balance / 100:.2f} ₽")
            except Exception as e:
                print(f"  ❌ Ошибка зачисления баланса: {e}")
                db.rollback()
                error_count += 1
                continue
            
            # Проверяем существующую подписку
            existing_sub = db.query(Subscription).filter(
                Subscription.user_id == user.id,
                Subscription.subscription_type == SubscriptionType.MASTER,
                Subscription.is_active == True
            ).first()
            
            if existing_sub:
                # Обновляем существующую подписку на нужный план
                if existing_sub.plan_id != plan.id:
                    print(f"  ⚠️  Обновление существующей подписки (ID: {existing_sub.id}) на план {plan_name}")
                    existing_sub.plan_id = plan.id
                    existing_sub.price = plan.price_1month
                    existing_sub.status = SubscriptionStatus.ACTIVE
                    existing_sub.is_active = True
                    existing_sub.end_date = datetime(2099, 12, 31)
                    db.commit()
                    print(f"  ✓ Подписка обновлена")
                else:
                    print(f"  ✓ Подписка уже на правильном плане")
            else:
                # Создаем новую подписку
                try:
                    # Рассчитываем daily_rate
                    days_in_year = 365
                    daily_rate = plan.price_1month / days_in_year if days_in_year > 0 else 0
                    
                    new_subscription = Subscription(
                        user_id=user.id,
                        subscription_type=SubscriptionType.MASTER,
                        plan_id=plan.id,
                        status=SubscriptionStatus.ACTIVE,
                        start_date=datetime.utcnow(),
                        end_date=datetime(2099, 12, 31),
                        price=plan.price_1month,
                        daily_rate=daily_rate,
                        auto_renewal=False,
                        is_active=True,
                        salon_branches=0,
                        salon_employees=0,
                        master_bookings=0
                    )
                    
                    db.add(new_subscription)
                    db.commit()
                    db.refresh(new_subscription)
                    
                    print(f"  ✓ Подписка создана (ID: {new_subscription.id})")
                except Exception as e:
                    print(f"  ❌ Ошибка создания подписки: {e}")
                    db.rollback()
                    import traceback
                    traceback.print_exc()
                    error_count += 1
                    continue
            
            success_count += 1
            print()
        
        print(f"\n=== РЕЗУЛЬТАТ ===")
        print(f"✅ Успешно обработано: {success_count}")
        print(f"❌ Ошибок: {error_count}")
        
        return success_count == len(TEST_ACCOUNTS)
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Критическая ошибка: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    print("Настройка тестовых аккаунтов...\n")
    success = setup_test_accounts()
    if success:
        print("\n✅ Все тестовые аккаунты настроены!")
    else:
        print("\n⚠️  Некоторые аккаунты не были настроены. Проверьте ошибки выше.")
        sys.exit(1)

