#!/usr/bin/env python3
"""
Тест API расписания мастера с конфликтами
"""

from database import get_db
from models import User
from routers.master import get_master_weekly_schedule

def test_schedule_api():
    """Тестирует API расписания мастера"""
    
    print('=== ТЕСТ API РАСПИСАНИЯ МАСТЕРА ===')
    print()
    
    try:
        db = next(get_db())
        user = User(id=3, phone='+79435774916', full_name='Тестовый мастер')
        
        print('1. ТЕСТИРУЕМ API РАСПИСАНИЯ:')
        response = get_master_weekly_schedule(
            week_offset=1,  # Следующая неделя (15-21 сентября)
            weeks_ahead=1,
            db=db,
            current_user=user
        )
        
        print(f'   ✅ API работает! Получено слотов: {len(response.slots)}')
        
        # Анализируем слоты
        working_slots = [s for s in response.slots if s.is_working]
        personal_slots = [s for s in working_slots if s.work_type == 'personal']
        salon_slots = [s for s in working_slots if s.work_type == 'salon']
        conflict_slots = [s for s in working_slots if s.has_conflict]
        
        print(f'   Рабочих слотов: {len(working_slots)}')
        print(f'   Личное расписание: {len(personal_slots)} слотов')
        print(f'   Работа в салоне: {len(salon_slots)} слотов')
        print(f'   Конфликтных слотов: {len(conflict_slots)} слотов')
        
        print()
        print('2. ПРИМЕРЫ СЛОТОВ:')
        for slot in working_slots[:10]:
            conflict_text = ' (КОНФЛИКТ!)' if slot.has_conflict else ''
            print(f'     {slot.schedule_date} {slot.hour:02d}:{slot.minute:02d} - {slot.work_type}{conflict_text}')
        
        print()
        print('3. КОНФЛИКТНЫЕ СЛОТЫ:')
        for slot in conflict_slots[:10]:
            print(f'     {slot.schedule_date} {slot.hour:02d}:{slot.minute:02d} - {slot.work_type} ({slot.conflict_type})')
        
        print()
        print('✅ ТЕСТИРОВАНИЕ API ЗАВЕРШЕНО!')
        
    except Exception as e:
        print(f'   ❌ Ошибка API: {e}')
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    test_schedule_api()
