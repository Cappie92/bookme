#!/usr/bin/env python3
"""
Скрипт для автоматического тестирования функционала is_always_free с выбором плана подписки.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from database import SessionLocal
from models import User, Master, Subscription, SubscriptionPlan, SubscriptionType, SubscriptionStatus
from utils.subscription_features import get_master_features, get_user_subscription_with_plan
from datetime import datetime
import traceback

def print_section(title):
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60)

def test_create_master_with_always_free():
    """Тест 1: Создание мастера и установка is_always_free с выбором плана"""
    print_section("ТЕСТ 1: Создание мастера с is_always_free и выбором плана")
    
    db = SessionLocal()
    try:
        # Получаем планы подписки
        plans = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).order_by(SubscriptionPlan.display_order).all()
        
        print(f"Найдено планов: {len(plans)}")
        for plan in plans:
            print(f"  - {plan.name} (ID: {plan.id})")
        
        # Создаем тестового пользователя-мастера
        test_phone = f"+7999{datetime.now().strftime('%H%M%S')}"
        test_email = f"test_master_{datetime.now().strftime('%H%M%S')}@test.com"
        
        user = User(
            email=test_email,
            phone=test_phone,
            full_name="Тестовый мастер",
            hashed_password="test_hash",
            role="master",
            is_active=True,
            is_verified=True,
            is_always_free=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        print(f"\n✓ Создан пользователь: {user.phone} (ID: {user.id})")
        print(f"  is_always_free: {user.is_always_free}")
        
        # Создаем профиль мастера
        master = Master(
            user_id=user.id,
            bio="Тестовый мастер для проверки подписки",
            experience_years=5,
            can_work_independently=True,
            city="Москва",
            address="Тестовый адрес"
        )
        db.add(master)
        db.commit()
        db.refresh(master)
        
        print(f"✓ Создан профиль мастера (ID: {master.id})")
        
        # Симулируем установку is_always_free с выбором плана (Premium)
        premium_plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.name == 'Premium',
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).first()
        
        if premium_plan:
            # Создаем подписку (как это делает админка)
            subscription = Subscription(
                user_id=user.id,
                subscription_type=SubscriptionType.MASTER,
                plan_id=premium_plan.id,
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
            
            print(f"\n✓ Создана подписка:")
            print(f"  plan_id: {subscription.plan_id}")
            print(f"  plan_name: {premium_plan.name}")
            print(f"  status: {subscription.status.value}")
            
            # Проверяем get_master_features
            features = get_master_features(db, user.id)
            print(f"\n✓ get_master_features возвращает:")
            print(f"  plan_id: {features.get('plan_id')}")
            print(f"  plan_name: {features.get('plan_name')}")
            print(f"  can_customize_domain: {features.get('can_customize_domain')}")
            print(f"  has_finance_access: {features.get('has_finance_access')}")
            print(f"  has_extended_stats: {features.get('has_extended_stats')}")
            
            # Проверки
            assert features.get('plan_id') == premium_plan.id, f"Ожидался plan_id={premium_plan.id}, получен {features.get('plan_id')}"
            assert features.get('plan_name') == premium_plan.name, f"Ожидался plan_name={premium_plan.name}, получен {features.get('plan_name')}"
            assert features.get('can_customize_domain') == True, "can_customize_domain должен быть True"
            assert features.get('has_finance_access') == True, "has_finance_access должен быть True"
            assert features.get('has_extended_stats') == True, "has_extended_stats должен быть True"
            
            print("\n✓ Все проверки пройдены!")
            
            return user.id, subscription.id
        else:
            print("✗ План Premium не найден!")
            return None, None
            
    except Exception as e:
        print(f"\n✗ Ошибка: {str(e)}")
        traceback.print_exc()
        db.rollback()
        return None, None
    finally:
        db.close()

def test_update_plan_for_always_free():
    """Тест 2: Обновление плана для пользователя с is_always_free"""
    print_section("ТЕСТ 2: Обновление плана для is_always_free пользователя")
    
    db = SessionLocal()
    try:
        # Находим пользователя с is_always_free
        user = db.query(User).filter(
            User.is_always_free == True,
            User.role == 'master'
        ).first()
        
        if not user:
            print("✗ Пользователь с is_always_free не найден. Сначала запустите тест 1.")
            return False
        
        print(f"Найден пользователь: {user.phone} (ID: {user.id})")
        
        # Получаем текущую подписку
        subscription = db.query(Subscription).filter(
            Subscription.user_id == user.id,
            Subscription.subscription_type == SubscriptionType.MASTER
        ).first()
        
        if not subscription:
            print("✗ Подписка не найдена")
            return False
        
        print(f"Текущая подписка: plan_id={subscription.plan_id}")
        
        # Получаем план Basic
        basic_plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.name == 'Basic',
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).first()
        
        if not basic_plan:
            print("✗ План Basic не найден")
            return False
        
        # Обновляем план (симулируем обновление через админку)
        old_plan_id = subscription.plan_id
        subscription.plan_id = basic_plan.id
        db.commit()
        db.refresh(subscription)
        
        print(f"\n✓ Подписка обновлена:")
        print(f"  Старый plan_id: {old_plan_id}")
        print(f"  Новый plan_id: {subscription.plan_id}")
        
        # Проверяем get_master_features
        features = get_master_features(db, user.id)
        print(f"\n✓ get_master_features после обновления:")
        print(f"  plan_id: {features.get('plan_id')}")
        print(f"  plan_name: {features.get('plan_name')}")
        
        # Проверки
        assert features.get('plan_id') == basic_plan.id, f"Ожидался plan_id={basic_plan.id}, получен {features.get('plan_id')}"
        assert features.get('plan_name') == basic_plan.name, f"Ожидался plan_name={basic_plan.name}, получен {features.get('plan_name')}"
        # Для is_always_free все функции должны быть доступны, даже если план Basic
        assert features.get('can_customize_domain') == True, "can_customize_domain должен быть True для is_always_free"
        assert features.get('has_finance_access') == True, "has_finance_access должен быть True для is_always_free"
        
        print("\n✓ Все проверки пройдены!")
        
        # Возвращаем обратно Premium
        premium_plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.name == 'Premium',
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).first()
        if premium_plan:
            subscription.plan_id = premium_plan.id
            db.commit()
            print(f"✓ План возвращен обратно на Premium")
        
        return True
        
    except Exception as e:
        print(f"\n✗ Ошибка: {str(e)}")
        traceback.print_exc()
        db.rollback()
        return False
    finally:
        db.close()

def test_default_premium_plan():
    """Тест 3: Создание подписки с Premium по умолчанию, если план не указан"""
    print_section("ТЕСТ 3: Создание подписки с Premium по умолчанию")
    
    db = SessionLocal()
    try:
        # Создаем нового пользователя с is_always_free, но без указания плана
        test_phone = f"+7998{datetime.now().strftime('%H%M%S')}"
        test_email = f"test_default_{datetime.now().strftime('%H%M%S')}@test.com"
        
        user = User(
            email=test_email,
            phone=test_phone,
            full_name="Тестовый мастер (по умолчанию)",
            hashed_password="test_hash",
            role="master",
            is_active=True,
            is_verified=True,
            is_always_free=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        print(f"✓ Создан пользователь: {user.phone} (ID: {user.id})")
        
        # Симулируем логику из админки: если план не указан, используем Premium
        premium_plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.name == 'Premium',
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).first()
        
        if premium_plan:
            subscription = Subscription(
                user_id=user.id,
                subscription_type=SubscriptionType.MASTER,
                plan_id=premium_plan.id,  # По умолчанию Premium
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
            
            print(f"\n✓ Создана подписка с Premium по умолчанию:")
            print(f"  plan_id: {subscription.plan_id}")
            print(f"  plan_name: {premium_plan.name}")
            
            # Проверяем get_master_features
            features = get_master_features(db, user.id)
            print(f"\n✓ get_master_features возвращает:")
            print(f"  plan_id: {features.get('plan_id')}")
            print(f"  plan_name: {features.get('plan_name')}")
            
            # Проверки
            assert features.get('plan_id') == premium_plan.id, f"Ожидался plan_id={premium_plan.id}, получен {features.get('plan_id')}"
            assert features.get('plan_name') == premium_plan.name, f"Ожидался plan_name={premium_plan.name}, получен {features.get('plan_name')}"
            
            print("\n✓ Все проверки пройдены!")
            return user.id
        else:
            print("✗ План Premium не найден!")
            return None
            
    except Exception as e:
        print(f"\n✗ Ошибка: {str(e)}")
        traceback.print_exc()
        db.rollback()
        return None
    finally:
        db.close()

def test_different_plans():
    """Тест 4: Тестирование всех планов подписки"""
    print_section("ТЕСТ 4: Тестирование всех планов подписки")
    
    db = SessionLocal()
    try:
        plans = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.subscription_type == SubscriptionType.MASTER
        ).order_by(SubscriptionPlan.display_order).all()
        
        print(f"Тестируем {len(plans)} планов:")
        
        for plan in plans:
            print(f"\n--- План: {plan.name} (ID: {plan.id}) ---")
            print(f"  Features: {plan.features}")
            
            # Создаем тестового пользователя
            test_phone = f"+7997{datetime.now().strftime('%H%M%S')}{plan.id}"
            test_email = f"test_{plan.name.lower()}_{datetime.now().strftime('%H%M%S')}@test.com"
            
            user = User(
                email=test_email,
                phone=test_phone,
                full_name=f"Тест {plan.name}",
                hashed_password="test_hash",
                role="master",
                is_active=True,
                is_verified=True,
                is_always_free=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            
            # Создаем подписку с этим планом
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
            
            # Проверяем get_master_features
            features = get_master_features(db, user.id)
            
            print(f"  ✓ Подписка создана: plan_id={subscription.plan_id}")
            print(f"  ✓ get_master_features: plan_id={features.get('plan_id')}, plan_name={features.get('plan_name')}")
            
            # Проверки
            assert features.get('plan_id') == plan.id, f"Ожидался plan_id={plan.id}, получен {features.get('plan_id')}"
            assert features.get('plan_name') == plan.name, f"Ожидался plan_name={plan.name}, получен {features.get('plan_name')}"
            # Для is_always_free все функции должны быть доступны
            assert features.get('can_customize_domain') == True, "can_customize_domain должен быть True"
            assert features.get('has_finance_access') == True, "has_finance_access должен быть True"
            
            print(f"  ✓ Проверки пройдены для плана {plan.name}")
        
        print("\n✓ Все планы протестированы успешно!")
        return True
        
    except Exception as e:
        print(f"\n✗ Ошибка: {str(e)}")
        traceback.print_exc()
        db.rollback()
        return False
    finally:
        db.close()

def cleanup_test_users():
    """Очистка тестовых пользователей"""
    print_section("ОЧИСТКА: Удаление тестовых пользователей")
    
    db = SessionLocal()
    try:
        # Удаляем тестовых пользователей
        test_users = db.query(User).filter(
            User.email.like('test_%@test.com')
        ).all()
        
        print(f"Найдено тестовых пользователей: {len(test_users)}")
        
        for user in test_users:
            # Удаляем подписки
            subscriptions = db.query(Subscription).filter(
                Subscription.user_id == user.id
            ).all()
            for sub in subscriptions:
                db.delete(sub)
            
            # Удаляем профиль мастера
            master = db.query(Master).filter(Master.user_id == user.id).first()
            if master:
                db.delete(master)
            
            # Удаляем пользователя
            db.delete(user)
            print(f"  ✓ Удален пользователь: {user.phone}")
        
        db.commit()
        print(f"\n✓ Очистка завершена. Удалено пользователей: {len(test_users)}")
        
    except Exception as e:
        print(f"\n✗ Ошибка при очистке: {str(e)}")
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

def main():
    """Главная функция для запуска всех тестов"""
    print("\n" + "="*60)
    print("  АВТОМАТИЧЕСКОЕ ТЕСТИРОВАНИЕ is_always_free С ПЛАНАМИ ПОДПИСКИ")
    print("="*60)
    
    results = []
    
    # Тест 1: Создание мастера с is_always_free
    user_id, sub_id = test_create_master_with_always_free()
    results.append(("Тест 1: Создание мастера с is_always_free", user_id is not None))
    
    # Тест 2: Обновление плана
    if user_id:
        result = test_update_plan_for_always_free()
        results.append(("Тест 2: Обновление плана", result))
    
    # Тест 3: Premium по умолчанию
    default_user_id = test_default_premium_plan()
    results.append(("Тест 3: Premium по умолчанию", default_user_id is not None))
    
    # Тест 4: Все планы
    result = test_different_plans()
    results.append(("Тест 4: Тестирование всех планов", result))
    
    # Итоги
    print_section("ИТОГИ ТЕСТИРОВАНИЯ")
    passed = 0
    failed = 0
    
    for test_name, result in results:
        status = "✓ ПРОЙДЕН" if result else "✗ ПРОВАЛЕН"
        print(f"{status}: {test_name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print(f"\nВсего тестов: {len(results)}")
    print(f"Пройдено: {passed}")
    print(f"Провалено: {failed}")
    
    # Очистка
    cleanup_choice = input("\nУдалить тестовых пользователей? (y/n): ").strip().lower()
    if cleanup_choice == 'y':
        cleanup_test_users()
    
    print("\n" + "="*60)
    if failed == 0:
        print("  ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО! ✓")
    else:
        print(f"  ВНИМАНИЕ: {failed} тест(ов) провалено(ы)! ✗")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()

