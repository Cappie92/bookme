import asyncio
from database import engine
from models import User, Master
from sqlalchemy.orm import sessionmaker

async def check_master():
    print("=== ПРОВЕРКА МАСТЕРА ===\n")
    
    # Создаем сессию базы данных
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Ищем мастера по имени
        master = db.query(Master).join(User).filter(User.full_name == 'wdwedewq').first()
        
        if master:
            print(f"Найден мастер:")
            print(f"  ID мастера: {master.id}")
            print(f"  ID пользователя: {master.user_id}")
            print(f"  Имя: {master.user.full_name}")
            print(f"  Телефон: {master.user.phone}")
            print(f"  Роль: {master.user.role}")
        else:
            print("Мастер 'wdwedewq' не найден")
            
            # Показываем всех мастеров
            masters = db.query(Master).join(User).all()
            print(f"\nВсего мастеров в базе: {len(masters)}")
            
            for m in masters:
                print(f"  ID: {m.id}, Имя: {m.user.full_name}, Пользователь ID: {m.user_id}")
        
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(check_master()) 