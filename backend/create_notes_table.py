#!/usr/bin/env python3
"""
Скрипт для создания таблицы заметок клиентов
"""

import sqlite3
import os

def create_notes_table():
    # Путь к базе данных
    db_path = "bookme.db"
    
    if not os.path.exists(db_path):
        print(f"❌ База данных {db_path} не найдена!")
        return
    
    try:
        # Подключаемся к базе данных
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Создаем таблицу заметок
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS client_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_phone TEXT NOT NULL,
                note_type TEXT NOT NULL,
                target_id INTEGER NOT NULL,
                salon_note TEXT,
                master_note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(client_phone, note_type, target_id)
            )
        """)
        
        # Создаем индексы
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_client_notes_client_phone 
            ON client_notes(client_phone)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_client_notes_target 
            ON client_notes(note_type, target_id)
        """)
        
        # Сохраняем изменения
        conn.commit()
        
        print("✅ Таблица client_notes успешно создана!")
        print("✅ Индексы созданы!")
        
        # Проверяем структуру таблицы
        cursor.execute("PRAGMA table_info(client_notes)")
        columns = cursor.fetchall()
        
        print("\n📋 Структура таблицы client_notes:")
        for col in columns:
            print(f"  - {col[1]} ({col[2]}) {'NOT NULL' if col[3] else 'NULL'} {'UNIQUE' if col[5] else ''}")
        
    except Exception as e:
        print(f"❌ Ошибка при создании таблицы: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    create_notes_table()

