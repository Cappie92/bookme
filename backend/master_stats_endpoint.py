#!/usr/bin/env python3
"""
Эндпоинт для статистики мастера
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta
import calendar

router = APIRouter()

def get_db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    
    engine = create_engine('sqlite:///bookme.db')
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/api/master/dashboard/stats")
async def get_master_stats(db: Session = Depends(get_db)):
    try:
        # Получаем ID мастера из токена (упрощенно - берем первого мастера)
        result = db.execute(text("SELECT id FROM users WHERE role = 'MASTER' LIMIT 1"))
        master_result = result.fetchone()
        if not master_result:
            raise HTTPException(status_code=404, detail="Мастер не найден")
        
        master_id = master_result[0]
        
        # Текущий месяц
        now = datetime.now()
        current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        current_month_end = (current_month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        
        # Прошлый месяц
        if current_month_start.month == 1:
            prev_month_start = current_month_start.replace(year=current_month_start.year - 1, month=12)
        else:
            prev_month_start = current_month_start.replace(month=current_month_start.month - 1)
        
        prev_month_end = current_month_start - timedelta(days=1)
        
        # Бронирования текущего месяца
        current_month_bookings = db.execute(text("""
            SELECT COUNT(*) as count, COALESCE(SUM(payment_amount), 0) as income
            FROM bookings 
            WHERE master_id = :master_id 
            AND start_time >= :start_date 
            AND start_time < :end_date
        """), {
            'master_id': master_id,
            'start_date': current_month_start.isoformat(),
            'end_date': current_month_end.isoformat()
        }).fetchone()
        
        # Бронирования прошлого месяца
        prev_month_bookings = db.execute(text("""
            SELECT COUNT(*) as count, COALESCE(SUM(payment_amount), 0) as income
            FROM bookings 
            WHERE master_id = :master_id 
            AND start_time >= :start_date 
            AND start_time < :end_date
        """), {
            'master_id': master_id,
            'start_date': prev_month_start.isoformat(),
            'end_date': prev_month_end.isoformat()
        }).fetchone()
        
        # Динамика
        current_count = current_month_bookings[0] or 0
        prev_count = prev_month_bookings[0] or 0
        bookings_dynamics = 0
        if prev_count > 0:
            bookings_dynamics = round(((current_count - prev_count) / prev_count) * 100, 1)
        
        current_income = current_month_bookings[1] or 0
        prev_income = prev_month_bookings[1] or 0
        income_dynamics = 0
        if prev_income > 0:
            income_dynamics = round(((current_income - prev_income) / prev_income) * 100, 1)
        
        # Популярные услуги
        top_services = db.execute(text("""
            SELECT s.name, COUNT(b.id) as bookings_count
            FROM services s
            LEFT JOIN bookings b ON s.id = b.service_id AND b.master_id = :master_id
            WHERE s.master_id = :master_id
            GROUP BY s.id, s.name
            ORDER BY bookings_count DESC
            LIMIT 5
        """), {'master_id': master_id}).fetchall()
        
        # Статистика по месяцам за последние 6 месяцев
        monthly_balance = []
        for i in range(6):
            month_date = now - timedelta(days=30 * i)
            month_start = month_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            if month_date.month == 12:
                month_end = month_start.replace(year=month_start.year + 1, month=1) - timedelta(days=1)
            else:
                month_end = month_start.replace(month=month_start.month + 1) - timedelta(days=1)
            
            month_stats = db.execute(text("""
                SELECT 
                    COUNT(*) as bookings_count,
                    COALESCE(SUM(payment_amount), 0) as income
                FROM bookings 
                WHERE master_id = :master_id 
                AND start_time >= :start_date 
                AND start_time < :end_date
            """), {
                'master_id': master_id,
                'start_date': month_start.isoformat(),
                'end_date': month_end.isoformat()
            }).fetchone()
            
            monthly_balance.append({
                'month': month_start.strftime('%Y-%m'),
                'bookings_count': month_stats[0] or 0,
                'income': float(month_stats[1] or 0),
                'expenses': 0,  # Пока не реализовано
                'balance': float(month_stats[1] or 0)
            })
        
        return {
            'current_month_bookings': current_count,
            'bookings_dynamics': bookings_dynamics,
            'current_month_income': float(current_income),
            'income_dynamics': income_dynamics,
            'top_services': [
                {
                    'service_id': i,
                    'service_name': service[0],
                    'bookings_count': service[1]
                }
                for i, service in enumerate(top_services)
            ],
            'monthly_balance': monthly_balance
        }
        
    except Exception as e:
        print(f"Ошибка получения статистики мастера: {e}")
        raise HTTPException(status_code=500, detail="Ошибка получения статистики")

