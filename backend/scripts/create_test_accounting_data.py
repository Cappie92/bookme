"""
Скрипт для создания тестовых данных для модуля бухгалтерии
"""
import sys
import random
from datetime import datetime, timedelta

sys.path.append('/app')

from database import SessionLocal
from models import User, MasterExpense, Booking, BookingConfirmation, Income, BookingStatus

def create_test_accounting_data():
    db = SessionLocal()
    try:
        # Находим мастера
        master = db.query(User).filter(User.phone == '+79435774916').first()
        if not master:
            print("❌ Мастер не найден")
            return
        
        print(f"👤 Мастер найден: {master.phone} (ID: {master.id})")
        
        # 1. Создаем циклические расходы (шаблоны)
        print("\n📋 Создание шаблонов циклических расходов...")
        
        recurring_expenses = [
            {
                "name": "Аренда рабочего места",
                "expense_type": "recurring",
                "amount": 15000.0,
                "recurrence_type": "monthly"
            },
            {
                "name": "Закупка материалов",
                "expense_type": "recurring",
                "amount": 5000.0,
                "recurrence_type": "weekly"
            },
            {
                "name": "Транспортные расходы",
                "expense_type": "recurring",
                "amount": 500.0,
                "recurrence_type": "conditional",
                "condition_type": "has_bookings"
            },
            {
                "name": "Коммунальные услуги",
                "expense_type": "recurring",
                "amount": 200.0,
                "recurrence_type": "conditional",
                "condition_type": "schedule_open"
            }
        ]
        
        for exp_data in recurring_expenses:
            existing = db.query(MasterExpense).filter(
                MasterExpense.master_id == master.id,
                MasterExpense.name == exp_data["name"],
                MasterExpense.expense_type == "recurring"
            ).first()
            
            if not existing:
                expense = MasterExpense(
                    master_id=master.id,
                    **exp_data
                )
                db.add(expense)
                print(f"  ✅ Создан шаблон: {exp_data['name']}")
        
        db.commit()
        
        # 2. Создаем разовые расходы за последние 3 месяца
        print("\n💰 Создание разовых расходов за последние 3 месяца...")
        
        one_time_expenses = [
            "Покупка инструментов",
            "Реклама в соцсетях",
            "Обучающий курс",
            "Ремонт оборудования",
            "Программное обеспечение",
            "Канцелярские товары",
            "Упаковочные материалы",
            "Дезинфицирующие средства"
        ]
        
        today = datetime.now()
        for i in range(30):  # 30 случайных расходов
            days_ago = random.randint(0, 90)
            expense_date = today - timedelta(days=days_ago)
            
            expense = MasterExpense(
                master_id=master.id,
                name=random.choice(one_time_expenses),
                expense_type="one_time",
                amount=round(random.uniform(500, 5000), 2),
                expense_date=expense_date
            )
            db.add(expense)
        
        db.commit()
        print(f"  ✅ Создано 30 разовых расходов")
        
        # 3. Находим услуги мастера
        print("\n🔧 Получение услуг мастера...")
        services = db.query(Booking).filter(
            Booking.master_id == master.id,
            Booking.salon_id == None
        ).distinct(Booking.service_id).all()
        
        service_ids = [booking.service_id for booking in services if booking.service_id]
        print(f"  ✅ Найдено {len(service_ids)} услуг")
        
        # 4. Создаем расходы по услуге (шаблоны)
        if service_ids:
            print("\n📦 Создание шаблонов расходов по услуге...")
            
            service_expense_names = [
                "Расходные материалы для услуги",
                "Амортизация инструментов",
                "Дополнительные материалы"
            ]
            
            for service_id in service_ids[:3]:  # Для первых 3 услуг
                for name in service_expense_names[:2]:  # По 2 шаблона на услугу
                    existing = db.query(MasterExpense).filter(
                        MasterExpense.master_id == master.id,
                        MasterExpense.service_id == service_id,
                        MasterExpense.name == name,
                        MasterExpense.expense_type == "service_based"
                    ).first()
                    
                    if not existing:
                        expense = MasterExpense(
                            master_id=master.id,
                            name=name,
                            expense_type="service_based",
                            amount=round(random.uniform(100, 500), 2),
                            service_id=service_id
                        )
                        db.add(expense)
                        print(f"  ✅ Создан шаблон расхода для услуги ID {service_id}: {name}")
            
            db.commit()
        
        # 5. Подтверждаем некоторые завершенные услуги
        print("\n✔️ Подтверждение завершенных услуг...")
        
        completed_bookings = db.query(Booking).filter(
            Booking.master_id == master.id,
            Booking.status == BookingStatus.COMPLETED.value,
            Booking.salon_id == None
        ).limit(50).all()
        
        confirmed_count = 0
        for booking in completed_bookings:
            # Проверяем, не подтверждена ли уже
            existing_confirmation = db.query(BookingConfirmation).filter(
                BookingConfirmation.booking_id == booking.id
            ).first()
            
            if not existing_confirmation:
                # Создаем подтверждение
                confirmation = BookingConfirmation(
                    booking_id=booking.id,
                    master_id=master.id,
                    confirmed_income=booking.payment_amount or 0,
                    confirmed_at=booking.date + timedelta(hours=booking.start_time.hour if booking.start_time else 12)
                )
                db.add(confirmation)
                
                # Создаем income запись
                income = Income(
                    user_id=master.id,
                    booking_id=booking.id,
                    amount=booking.payment_amount or 0,
                    type="booking",
                    created_at=confirmation.confirmed_at
                )
                db.add(income)
                
                # Создаем расходы по услуге
                if booking.service_id:
                    service_expenses = db.query(MasterExpense).filter(
                        MasterExpense.master_id == master.id,
                        MasterExpense.expense_type == "service_based",
                        MasterExpense.service_id == booking.service_id,
                        MasterExpense.is_active == True
                    ).all()
                    
                    for template in service_expenses:
                        expense_record = MasterExpense(
                            master_id=master.id,
                            name=f"{template.name} (услуга #{booking.id})",
                            expense_type="one_time",
                            amount=template.amount,
                            expense_date=confirmation.confirmed_at
                        )
                        db.add(expense_record)
                
                confirmed_count += 1
        
        db.commit()
        print(f"  ✅ Подтверждено {confirmed_count} услуг")
        
        # 6. Статистика
        print("\n📊 Статистика созданных данных:")
        
        total_expenses = db.query(MasterExpense).filter(
            MasterExpense.master_id == master.id
        ).count()
        
        recurring_count = db.query(MasterExpense).filter(
            MasterExpense.master_id == master.id,
            MasterExpense.expense_type == "recurring"
        ).count()
        
        one_time_count = db.query(MasterExpense).filter(
            MasterExpense.master_id == master.id,
            MasterExpense.expense_type == "one_time"
        ).count()
        
        service_based_count = db.query(MasterExpense).filter(
            MasterExpense.master_id == master.id,
            MasterExpense.expense_type == "service_based"
        ).count()
        
        confirmed_bookings_count = db.query(BookingConfirmation).filter(
            BookingConfirmation.master_id == master.id
        ).count()
        
        unconfirmed_bookings_count = db.query(Booking).outerjoin(
            BookingConfirmation,
            Booking.id == BookingConfirmation.booking_id
        ).filter(
            Booking.master_id == master.id,
            Booking.status == BookingStatus.COMPLETED.value,
            BookingConfirmation.id == None
        ).count()
        
        print(f"  📝 Всего расходов: {total_expenses}")
        print(f"    - Циклических (шаблоны): {recurring_count}")
        print(f"    - Разовых: {one_time_count}")
        print(f"    - По услуге (шаблоны): {service_based_count}")
        print(f"  ✅ Подтвержденных услуг: {confirmed_bookings_count}")
        print(f"  ⏳ Неподтвержденных услуг: {unconfirmed_bookings_count}")
        
        print("\n🎉 Тестовые данные успешно созданы!")
        
    except Exception as e:
        print(f"\n❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_test_accounting_data()

