#!/usr/bin/env python3
"""
Скрипт для проверки созданных тестовых пользователей
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from models import (
    User, Subscription, UserBalance, SubscriptionReservation,
    DailySubscriptionCharge, SubscriptionFreeze
)
from utils.balance_utils import get_user_available_balance, kopecks_to_rubles
from sqlalchemy import func

def verify_test_users():
    db = SessionLocal()
    
    try:
        # Тестовые телефоны
        test_phones = [f'+799900000{i:02d}' for i in range(1, 17)]
        
        print("=== ПРОВЕРКА ТЕСТОВЫХ ПОЛЬЗОВАТЕЛЕЙ ===\n")
        
        # 1. Проверка пользователей
        users = db.query(User).filter(User.phone.in_(test_phones)).all()
        print(f"✅ Найдено пользователей: {len(users)}/{len(test_phones)}")
        
        # 2. Проверка подписок
        subscriptions = db.query(Subscription).join(User).filter(User.phone.in_(test_phones)).all()
        print(f"✅ Найдено подписок: {len(subscriptions)}")
        
        # 3. Проверка балансов
        balances = db.query(UserBalance).join(User).filter(User.phone.in_(test_phones)).all()
        print(f"✅ Найдено балансов: {len(balances)}")
        
        # 4. Проверка резервов
        reservations = db.query(SubscriptionReservation).join(Subscription).join(User).filter(
            User.phone.in_(test_phones)
        ).all()
        print(f"✅ Найдено резервов: {len(reservations)}")
        
        # 5. Проверка истории списаний
        charges = db.query(DailySubscriptionCharge).join(Subscription).join(User).filter(
            User.phone.in_(test_phones)
        ).all()
        print(f"✅ Найдено записей истории списаний: {len(charges)}")
        
        # 6. Проверка успешных/неуспешных списаний
        success_charges = db.query(DailySubscriptionCharge).join(Subscription).join(User).filter(
            User.phone.in_(test_phones),
            DailySubscriptionCharge.status == 'success'
        ).count()
        failed_charges = db.query(DailySubscriptionCharge).join(Subscription).join(User).filter(
            User.phone.in_(test_phones),
            DailySubscriptionCharge.status == 'failed'
        ).count()
        print(f"✅ Успешных списаний: {success_charges}")
        print(f"✅ Неуспешных списаний: {failed_charges}")
        
        # 7. Проверка заморозок
        freezes = db.query(SubscriptionFreeze).join(Subscription).join(User).filter(
            User.phone.in_(test_phones)
        ).all()
        print(f"✅ Найдено заморозок: {len(freezes)}")
        
        # 8. Детальная проверка нескольких пользователей
        print("\n=== ДЕТАЛЬНАЯ ПРОВЕРКА ===\n")
        
        test_cases = [
            ("+79990000001", "Free план"),
            ("+79990000003", "Pro план с резервом"),
            ("+79990000008", "Нулевой баланс"),
            ("+79990000012", "История неуспешных списаний"),
            ("+79990000007", "Замороженная подписка"),
        ]
        
        for phone, description in test_cases:
            user = db.query(User).filter(User.phone == phone).first()
            if not user:
                print(f"❌ {phone}: Пользователь не найден")
                continue
            
            balance = db.query(UserBalance).filter(UserBalance.user_id == user.id).first()
            subscription = db.query(Subscription).filter(Subscription.user_id == user.id).first()
            reservation = db.query(SubscriptionReservation).join(Subscription).filter(
                Subscription.user_id == user.id
            ).first()
            available = get_user_available_balance(db, user.id)
            user_charges = db.query(DailySubscriptionCharge).join(Subscription).filter(
                Subscription.user_id == user.id
            ).all()
            user_freezes = db.query(SubscriptionFreeze).join(Subscription).filter(
                Subscription.user_id == user.id
            ).all()
            
            print(f"📱 {phone} - {description}")
            print(f"   Пользователь ID: {user.id}")
            if balance:
                print(f"   Общий баланс: {kopecks_to_rubles(balance.balance):.2f} ₽")
            if subscription:
                plan_name = subscription.plan.name if subscription.plan else 'N/A'
                print(f"   Подписка: {plan_name} (ID: {subscription.id})")
                print(f"   Ежедневная ставка: {subscription.daily_rate:.2f} ₽/день")
            if reservation:
                print(f"   Резерв: {kopecks_to_rubles(reservation.reserved_kopecks):.2f} ₽")
            print(f"   Доступный баланс: {kopecks_to_rubles(available):.2f} ₽")
            if user_charges:
                success_count = sum(1 for c in user_charges if c.status == 'success')
                failed_count = sum(1 for c in user_charges if c.status == 'failed')
                print(f"   История списаний: {len(user_charges)} записей ({success_count} успешных, {failed_count} неуспешных)")
            if user_freezes:
                print(f"   Заморозки: {len(user_freezes)} записей")
            print()
        
        print("=== ИТОГОВАЯ СТАТИСТИКА ===\n")
        print(f"Всего пользователей: {len(users)}")
        print(f"Всего подписок: {len(subscriptions)}")
        print(f"Всего балансов: {len(balances)}")
        print(f"Всего резервов: {len(reservations)}")
        print(f"Всего записей истории: {len(charges)}")
        print(f"  - Успешных: {success_charges}")
        print(f"  - Неуспешных: {failed_charges}")
        print(f"Всего заморозок: {len(freezes)}")
        
        # Проверка корректности
        issues = []
        if len(users) != 16:
            issues.append(f"Ожидалось 16 пользователей, найдено {len(users)}")
        if len(subscriptions) < 16:
            issues.append(f"Ожидалось минимум 16 подписок, найдено {len(subscriptions)}")
        if len(balances) < 16:
            issues.append(f"Ожидалось минимум 16 балансов, найдено {len(balances)}")
        
        if issues:
            print("\n⚠️  Обнаружены проблемы:")
            for issue in issues:
                print(f"  - {issue}")
        else:
            print("\n✅ Все проверки пройдены успешно!")
        
    finally:
        db.close()

if __name__ == "__main__":
    verify_test_users()

