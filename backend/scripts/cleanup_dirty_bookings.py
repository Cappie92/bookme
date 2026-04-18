#!/usr/bin/env python3
"""
Скрипт для очистки "грязных" тестовых записей из bookme.db:
- bookings с service_id IS NULL
- связанные записи в дочерних таблицах

Требования:
- Работает ТОЛЬКО с реальной SQLite схемой (PRAGMA)
- Делает backup БД перед удалением
- Проверяет FK через PRAGMA foreign_key_list
- Удаляет транзакционно и батчами
- Выводит детальный отчёт до/после
"""

import sys
import os
import shutil
from pathlib import Path
from datetime import datetime

import sqlite3


def get_db_path():
    """Получить путь к bookme.db"""
    # Пробуем найти БД относительно скрипта
    script_dir = Path(__file__).parent
    backend_dir = script_dir.parent
    db_path = backend_dir / "bookme.db"
    
    if not db_path.exists():
        # Пробуем корень проекта
        project_root = backend_dir.parent
        db_path = project_root / "bookme.db"
        if not db_path.exists():
            raise FileNotFoundError(f"База данных не найдена. Проверенные пути:\n  - {backend_dir / 'bookme.db'}\n  - {project_root / 'bookme.db'}")
    
    return db_path


def backup_database(db_path: Path):
    """Создать backup БД"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = db_path.parent / f"bookme_backup_{timestamp}.db"
    shutil.copy2(db_path, backup_path)
    size_before = db_path.stat().st_size
    return backup_path, size_before


def get_all_tables(conn: sqlite3.Connection):
    """Получить список всех таблиц (кроме системных)"""
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return [row[0] for row in tables]


def get_foreign_key_tables(conn: sqlite3.Connection):
    """Получить список таблиц, которые ссылаются на bookings.id через FK"""
    tables = get_all_tables(conn)
    
    fk_tables = []
    for table_name in tables:
        if table_name == "bookings":
            continue
        
        try:
            # PRAGMA foreign_key_list возвращает:
            # [0] id, [1] seq, [2] table, [3] from, [4] to, [5] on_update, [6] on_delete, [7] match
            fks = conn.execute(f"PRAGMA foreign_key_list({table_name})").fetchall()
            for fk in fks:
                # fk[2] - таблица, на которую ссылается FK
                # fk[3] - колонка в текущей таблице (from)
                # fk[4] - колонка в целевой таблице (to)
                if fk[2] == "bookings" and fk[4] == "id":
                    fk_tables.append({
                        "table": table_name,
                        "column": fk[3],
                        "on_delete": fk[6] if len(fk) > 6 else None,
                        "on_update": fk[5] if len(fk) > 5 else None
                    })
        except sqlite3.OperationalError as e:
            # Таблица может не существовать или быть view
            print(f"   ⚠️  Не удалось проверить {table_name}: {e}")
            continue
    
    return fk_tables


def get_manual_booking_references(conn: sqlite3.Connection):
    """Найти таблицы с booking_id без явного FK (через проверку схемы)"""
    tables = get_all_tables(conn)
    manual_refs = []
    
    for table_name in tables:
        if table_name == "bookings":
            continue
        
        try:
            # PRAGMA table_info возвращает:
            # [0] cid, [1] name, [2] type, [3] notnull, [4] dflt_value, [5] pk
            columns = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
            for col in columns:
                col_name = col[1]
                if "booking_id" in col_name.lower():
                    # Проверяем, есть ли FK
                    fks = conn.execute(f"PRAGMA foreign_key_list({table_name})").fetchall()
                    has_fk = any(fk[2] == "bookings" and fk[4] == "id" for fk in fks)
                    if not has_fk:
                        manual_refs.append({
                            "table": table_name,
                            "column": col_name
                        })
        except sqlite3.OperationalError as e:
            print(f"   ⚠️  Не удалось проверить {table_name}: {e}")
            continue
    
    return manual_refs


def delete_in_batches(conn: sqlite3.Connection, table: str, column: str, ids: list, batch_size: int = 500):
    """Удалить записи батчами"""
    total_deleted = 0
    for i in range(0, len(ids), batch_size):
        batch = ids[i:i + batch_size]
        placeholders = ','.join('?' * len(batch))
        deleted = conn.execute(
            f"DELETE FROM {table} WHERE {column} IN ({placeholders})",
            batch
        ).rowcount
        total_deleted += deleted
    return total_deleted


def main():
    db_path = get_db_path()
    
    print("=" * 70)
    print("CLEANUP DIRTY BOOKINGS")
    print("=" * 70)
    print(f"База данных: {db_path}")
    print(f"Размер БД до: {db_path.stat().st_size / 1024:.2f} KB")
    print()
    
    # Подключаемся к БД
    conn = sqlite3.connect(str(db_path))
    
    # 1. Проверка PRAGMA foreign_keys
    print("1. Проверка PRAGMA foreign_keys...")
    fk_before = conn.execute("PRAGMA foreign_keys").fetchone()[0]
    print(f"   PRAGMA foreign_keys ДО: {fk_before}")
    
    conn.execute("PRAGMA foreign_keys = ON")
    fk_after = conn.execute("PRAGMA foreign_keys").fetchone()[0]
    print(f"   PRAGMA foreign_keys ПОСЛЕ: {fk_after}")
    print()
    
    # 2. Список таблиц
    print("2. Список таблиц в БД...")
    tables = get_all_tables(conn)
    print(f"   Найдено таблиц: {len(tables)}")
    print(f"   Таблицы: {', '.join(tables[:10])}{'...' if len(tables) > 10 else ''}")
    print()
    
    # 3. Создаём backup
    print("3. Создание backup...")
    backup_path, size_before = backup_database(db_path)
    print(f"   Backup создан: {backup_path}")
    print(f"   Размер backup: {backup_path.stat().st_size / 1024:.2f} KB")
    print()
    
    try:
        # 4. Проверка до удаления
        print("4. Проверка до удаления...")
        count_null_service = conn.execute("SELECT COUNT(*) FROM bookings WHERE service_id IS NULL").fetchone()[0]
        count_null_payment = conn.execute("SELECT COUNT(*) FROM bookings WHERE payment_amount IS NULL").fetchone()[0]
        print(f"   bookings с NULL service_id: {count_null_service}")
        print(f"   bookings с NULL payment_amount: {count_null_payment}")
        print()
        
        if count_null_service == 0:
            print("   ✅ Нет записей для удаления. Завершение.")
            conn.close()
            return
        
        # 5. Находим связанные таблицы через FK
        print("5. Поиск связанных таблиц через PRAGMA foreign_key_list...")
        fk_tables = get_foreign_key_tables(conn)
        
        if fk_tables:
            print(f"   Найдено таблиц с FK на bookings: {len(fk_tables)}")
            for ref in fk_tables:
                on_delete = ref.get("on_delete", "N/A")
                on_update = ref.get("on_update", "N/A")
                print(f"   - {ref['table']}.{ref['column']} (on_delete={on_delete}, on_update={on_update})")
        else:
            print("   Таблиц с FK на bookings не найдено")
        print()
        
        # 6. Находим таблицы с booking_id без FK
        print("6. Поиск таблиц с booking_id без явного FK...")
        manual_refs = get_manual_booking_references(conn)
        
        if manual_refs:
            print(f"   Найдено таблиц с booking_id без FK: {len(manual_refs)}")
            for ref in manual_refs:
                print(f"   - {ref['table']}.{ref['column']}")
        else:
            print("   Таблиц с booking_id без FK не найдено")
        print()
        
        # 7. Объединяем все ссылки
        all_refs = fk_tables + manual_refs
        if not all_refs:
            print("   ⚠️  Связанных таблиц не найдено. Удаляем только bookings.")
        print()
        
        # 8. Получаем ID записей для удаления
        print("7. Получение ID записей для удаления...")
        dirty_ids = [row[0] for row in conn.execute("SELECT id FROM bookings WHERE service_id IS NULL").fetchall()]
        print(f"   Найдено записей для удаления: {len(dirty_ids)}")
        if len(dirty_ids) > 0:
            print(f"   ID (первые 10): {dirty_ids[:10]}{'...' if len(dirty_ids) > 10 else ''}")
        print()
        
        # 9. Удаление транзакционно
        print("8. Удаление (транзакционно)...")
        conn.execute("BEGIN")
        
        deletion_stats = {}
        
        try:
            # Сначала удаляем дочерние записи батчами
            if all_refs:
                for ref in all_refs:
                    table = ref["table"]
                    column = ref["column"]
                    
                    # Проверяем, что таблица существует
                    if table not in tables:
                        print(f"   ⚠️  Таблица {table} не найдена, пропускаем")
                        continue
                    
                    deleted = delete_in_batches(conn, table, column, dirty_ids, batch_size=500)
                    if deleted > 0:
                        deletion_stats[table] = deleted
                        print(f"   Удалено из {table}: {deleted}")
            
            # Затем удаляем сами bookings
            deleted_bookings = conn.execute(
                "DELETE FROM bookings WHERE service_id IS NULL"
            ).rowcount
            deletion_stats["bookings"] = deleted_bookings
            print(f"   Удалено bookings: {deleted_bookings}")
            
            conn.execute("COMMIT")
            print("   ✅ Транзакция завершена успешно")
        except Exception as e:
            conn.execute("ROLLBACK")
            print(f"   ❌ Ошибка: {e}")
            print("   Откат транзакции")
            import traceback
            traceback.print_exc()
            raise
        
        print()
        
        # 10. Проверка после удаления
        print("9. Проверка после удаления...")
        count_null_service_after = conn.execute("SELECT COUNT(*) FROM bookings WHERE service_id IS NULL").fetchone()[0]
        count_null_payment_after = conn.execute("SELECT COUNT(*) FROM bookings WHERE payment_amount IS NULL").fetchone()[0]
        print(f"   bookings с NULL service_id: {count_null_service_after}")
        print(f"   bookings с NULL payment_amount: {count_null_payment_after}")
        print()
        
        # 11. Статистика удаления по таблицам
        print("10. Статистика удаления по таблицам:")
        if deletion_stats:
            for table, count in deletion_stats.items():
                print(f"   - {table}: {count} строк")
        else:
            print("   Нет удалённых записей")
        print()
        
        # 12. Последние 5 bookings для sanity check
        print("11. Последние 5 bookings (sanity check):")
        last_bookings = conn.execute("""
            SELECT b.id, b.service_id, b.payment_amount, s.price, s.name
            FROM bookings b
            LEFT JOIN services s ON s.id = b.service_id
            ORDER BY b.id DESC
            LIMIT 5
        """).fetchall()
        
        if last_bookings:
            for row in last_bookings:
                booking_id, service_id, payment_amount, service_price, service_name = row
                print(f"   ID={booking_id}, service_id={service_id}, payment_amount={payment_amount}, "
                      f"service.price={service_price}, service.name={service_name or 'N/A'}")
        else:
            print("   Нет bookings в БД")
        print()
        
        # 13. Итог
        print("=" * 70)
        print("ИТОГ:")
        print(f"  - Удалено bookings: {deletion_stats.get('bookings', 0)}")
        if len(deletion_stats) > 1:
            print(f"  - Удалено из дочерних таблиц: {sum(v for k, v in deletion_stats.items() if k != 'bookings')}")
        print(f"  - Backup: {backup_path}")
        print(f"  - Размер БД до: {size_before / 1024:.2f} KB")
        print(f"  - Размер БД после: {db_path.stat().st_size / 1024:.2f} KB")
        if count_null_service_after == 0:
            print("  - ✅ Все записи с NULL service_id удалены")
        else:
            print(f"  - ⚠️  Осталось {count_null_service_after} записей с NULL service_id")
        print("=" * 70)
        
    finally:
        conn.close()


if __name__ == "__main__":
    main()
