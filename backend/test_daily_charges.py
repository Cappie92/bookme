#!/usr/bin/env python3
"""
Скрипт для тестирования системы ежедневного списания
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, date, timedelta
from sqlalchemy.orm import Session
from database import get_db
from models import User, Subscription, UserBalance, DailySubscriptionCharge
from utils.balance_utils import process_daily_charge, get_or_create_user_balance, deposit_balance
from services.daily_charges import process_all_daily_charges

def create_test_subscription():
    """Создает тестовую подписку для демонстрации"""
    db = next(get_db())
    
    try:
        # Находим или создаем тестового пользователя
        user = db.query(User).filter(User.role == 'salon').first()
        if not user:
            print("❌ Не найден пользователь с ролью 'salon'")
            return None
        
        # Создаем или получаем баланс пользователя
        user_balance = get_or_create_user_balance(db, user.id)
        
        # Пополняем баланс для тестирования
        deposit_result = deposit_balance(db, user.id, 1000.0, "Тестовое пополнение")
        print(f"💰 Пополнен баланс: {deposit_result['balance_after']} руб.")
        
        # Создаем тестовую подписку
        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=30)
        price = 300.0  # 300 рублей за месяц
        daily_rate = price / 30  # 10 рублей в день
        
        subscription = Subscription(
            user_id=user.id,
            subscription_type='salon',
            status='active',
            salon_branches=2,
            salon_employees=5,
            master_bookings=0,
            start_date=start_date,
            end_date=end_date,
            price=price,
            daily_rate=daily_rate,
            is_active=True,
            auto_renewal=True,
            payment_method='card'
        )
        
        db.add(subscription)
        db.commit()
        db.refresh(subscription)
        
        print(f"✅ Создана тестовая подписка:")
        print(f"   ID: {subscription.id}")
        print(f"   Пользователь: {user.email}")
        print(f"   Тип: {subscription.subscription_type}")
        print(f"   Стоимость: {subscription.price} руб.")
        print(f"   Дневная ставка: {subscription.daily_rate:.2f} руб.")
        print(f"   Период: {subscription.start_date.date()} - {subscription.end_date.date()}")
        
        return subscription
        
    except Exception as e:
        print(f"❌ Ошибка создания тестовой подписки: {e}")
        db.rollback()
        return None
    finally:
        db.close()

def test_daily_charge(subscription_id, test_date=None):
    """Тестирует ежедневное списание для конкретной подписки"""
    if test_date is None:
        test_date = date.today()
    
    print(f"\n🧪 Тестирование ежедневного списания за {test_date}")
    
    db = next(get_db())
    try:
        result = process_daily_charge(db, subscription_id, test_date)
        return result
    finally:
        db.close()
    
    if result["success"]:
        print(f"✅ Списание успешно:")
        print(f"   Сумма: {result['daily_rate']:.2f} руб.")
        print(f"   Баланс до: {result['balance_before']:.2f} руб.")
        print(f"   Баланс после: {result['balance_after']:.2f} руб.")
        print(f"   ID записи: {result['charge_id']}")
    else:
        print(f"❌ Списание неуспешно: {result['error']}")
        if result.get('subscription_deactivated'):
            print("   Подписка деактивирована из-за недостатка средств")
    
    return result

def test_all_daily_charges(test_date=None):
    """Тестирует ежедневное списание для всех активных подписок"""
    if test_date is None:
        test_date = date.today()
    
    print(f"\n🧪 Тестирование всех ежедневных списаний за {test_date}")
    
    result = process_all_daily_charges(test_date)
    
    print(f"📊 Результаты:")
    print(f"   Всего подписок: {result['total_subscriptions']}")
    print(f"   Успешных списаний: {result['successful_charges']}")
    print(f"   Неуспешных списаний: {result['failed_charges']}")
    print(f"   Деактивировано подписок: {result['deactivated_subscriptions']}")
    
    if result.get('errors'):
        print(f"   Ошибки:")
        for error in result['errors']:
            print(f"     - {error}")
    
    return result

def show_balance_info(user_id):
    """Показывает информацию о балансе пользователя"""
    db = next(get_db())
    
    try:
        user_balance = db.query(UserBalance).filter(UserBalance.user_id == user_id).first()
        if user_balance:
            print(f"💰 Баланс пользователя {user_id}: {user_balance.balance / 100:.2f} руб.")
        else:
            print(f"❌ Баланс не найден для пользователя {user_id}")
    finally:
        db.close()

def show_subscription_info(subscription_id):
    """Показывает информацию о подписке"""
    db = next(get_db())
    
    try:
        subscription = db.query(Subscription).filter(Subscription.id == subscription_id).first()
        if subscription:
            print(f"📋 Подписка {subscription_id}:")
            print(f"   Статус: {subscription.status}")
            print(f"   Активна: {subscription.is_active}")
            print(f"   Период: {subscription.start_date.date()} - {subscription.end_date.date()}")
            print(f"   Стоимость: {subscription.price} руб.")
            print(f"   Дневная ставка: {subscription.daily_rate:.2f} руб.")
        else:
            print(f"❌ Подписка {subscription_id} не найдена")
    finally:
        db.close()

def main():
    print("🚀 Тестирование системы ежедневного списания")
    print("=" * 50)
    
    # Создаем тестовую подписку
    subscription = create_test_subscription()
    if not subscription:
        print("❌ Не удалось создать тестовую подписку")
        return
    
    # Показываем информацию о подписке
    show_subscription_info(subscription.id)
    
    # Показываем баланс пользователя
    show_balance_info(subscription.user_id)
    
    # Тестируем ежедневное списание для сегодня
    test_daily_charge(subscription.id, date.today())
    
    # Тестируем ежедневное списание для вчера
    yesterday = date.today() - timedelta(days=1)
    test_daily_charge(subscription.id, yesterday)
    
    # Тестируем все ежедневные списания
    test_all_daily_charges(date.today())
    
    print("\n✅ Тестирование завершено")

if __name__ == "__main__":
    main() 