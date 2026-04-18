#!/usr/bin/env python3
import sqlite3
from datetime import datetime, timedelta

def get_real_stats():
    conn = sqlite3.connect('bookme.db')
    cursor = conn.cursor()
    
    # Получаем общее количество пользователей
    cursor.execute('SELECT COUNT(*) FROM users')
    total_users = cursor.fetchone()[0]
    
    # Получаем пользователей по ролям
    cursor.execute('SELECT role, COUNT(*) FROM users GROUP BY role')
    users_by_role = dict(cursor.fetchall())
    
    # Получаем новых пользователей сегодня
    today = datetime.now().strftime('%Y-%m-%d')
    cursor.execute('SELECT COUNT(*) FROM users WHERE DATE(created_at) = ?', (today,))
    new_users_today = cursor.fetchone()[0]
    
    # Получаем количество салонов
    cursor.execute('SELECT COUNT(*) FROM salons')
    total_salons = cursor.fetchone()[0]
    
    # Получаем записи сегодня
    cursor.execute('SELECT COUNT(*) FROM bookings WHERE DATE(start_time) = ?', (today,))
    bookings_today = cursor.fetchone()[0]
    
    # Получаем записи за неделю
    week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
    cursor.execute('SELECT COUNT(*) FROM bookings WHERE DATE(start_time) >= ?', (week_ago,))
    bookings_this_week = cursor.fetchone()[0]
    
    # Получаем среднюю продолжительность записи
    cursor.execute('''
        SELECT AVG(
            (julianday(end_time) - julianday(start_time)) * 24
        ) FROM bookings 
        WHERE start_time IS NOT NULL AND end_time IS NOT NULL
    ''')
    avg_duration = cursor.fetchone()[0] or 0
    
    # Получаем конверсию (завершенные записи / общее количество)
    cursor.execute('SELECT COUNT(*) FROM bookings WHERE status = "CONFIRMED"')
    confirmed_bookings = cursor.fetchone()[0]
    
    conversion_rate = (confirmed_bookings / total_users * 100) if total_users > 0 else 0
    
    # Получаем активность по дням недели
    weekly_activity = []
    days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
    
    for i in range(7):
        day_start = (datetime.now() - timedelta(days=6-i)).strftime('%Y-%m-%d')
        day_end = (datetime.now() - timedelta(days=6-i) + timedelta(days=1)).strftime('%Y-%m-%d')
        
        # Пользователи активные в этот день
        cursor.execute('''
            SELECT COUNT(DISTINCT client_id) FROM bookings 
            WHERE DATE(start_time) = ?
        ''', (day_start,))
        active_users = cursor.fetchone()[0]
        
        # Записи в этот день
        cursor.execute('''
            SELECT COUNT(*) FROM bookings 
            WHERE DATE(start_time) = ?
        ''', (day_start,))
        day_bookings = cursor.fetchone()[0]
        
        weekly_activity.append({
            'day': days[i],
            'users': active_users,
            'bookings': day_bookings
        })
    
    # Получаем топ салонов
    cursor.execute('''
        SELECT s.id, s.name, COUNT(b.id) as booking_count
        FROM salons s
        LEFT JOIN bookings b ON s.id = b.salon_id
        GROUP BY s.id, s.name
        ORDER BY booking_count DESC
        LIMIT 5
    ''')
    top_salons = []
    for row in cursor.fetchall():
        top_salons.append({
            'name': row[1],
            'bookings': row[2],
            'masters': 0,  # Пока не реализовано
            'rating': 0    # Пока не реализовано
        })
    
    stats = {
        'total_users': total_users,
        'new_users_today': new_users_today,
        'total_salons': total_salons,
        'bookings_today': bookings_today,
        'bookings_this_week': bookings_this_week,
        'total_blog_posts': 0,  # Пока не реализовано
        'average_booking_duration': round(avg_duration, 1),
        'conversion_rate': round(conversion_rate, 1),
        'users_by_role': users_by_role,
        'weekly_activity': weekly_activity,
        'top_salons': top_salons,
        'last_updated': datetime.now().isoformat()
    }
    
    conn.close()
    return stats

if __name__ == '__main__':
    stats = get_real_stats()
    print("=== РЕАЛЬНАЯ СТАТИСТИКА ===")
    print(f"Всего пользователей: {stats['total_users']}")
    print(f"Новых пользователей сегодня: {stats['new_users_today']}")
    print(f"Всего салонов: {stats['total_salons']}")
    print(f"Записей сегодня: {stats['bookings_today']}")
    print(f"Записей за неделю: {stats['bookings_this_week']}")
    print(f"Средняя продолжительность записи: {stats['average_booking_duration']}ч")
    print(f"Конверсия: {stats['conversion_rate']}%")
    print(f"Пользователи по ролям: {stats['users_by_role']}")
    print(f"Активность за неделю: {stats['weekly_activity']}")
    print(f"Топ салонов: {stats['top_salons']}")
