#!/usr/bin/env python3

from database import engine
from sqlalchemy import text

def check_invitations():
    try:
        with engine.connect() as conn:
            # Проверяем, существует ли таблица (SQLite)
            result = conn.execute(text("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='branch_manager_invitations'
            """))
            table_exists = result.fetchone() is not None
            print(f"Таблица branch_manager_invitations существует: {table_exists}")
            
            if table_exists:
                # Проверяем количество записей
                result = conn.execute(text("SELECT COUNT(*) FROM branch_manager_invitations"))
                count = result.scalar()
                print(f"Количество записей в branch_manager_invitations: {count}")
                
                # Проверяем структуру таблицы (SQLite)
                result = conn.execute(text("PRAGMA table_info(branch_manager_invitations)"))
                columns = result.fetchall()
                print("Структура таблицы:")
                for col in columns:
                    print(f"  - {col[1]}: {col[2]}")
                
                # Проверяем несколько записей
                if count > 0:
                    result = conn.execute(text("SELECT * FROM branch_manager_invitations LIMIT 3"))
                    records = result.fetchall()
                    print("\nПервые записи:")
                    for record in records:
                        print(f"  - {record}")
            else:
                print("Таблица не найдена!")
                
    except Exception as e:
        print(f"Ошибка: {e}")

if __name__ == "__main__":
    check_invitations()
