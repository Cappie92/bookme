#!/usr/bin/env python3
"""
Скрипт для поиска запущенного приложения
Работает даже если bash команды не выполняются
"""

import os
import subprocess
import glob
from pathlib import Path

def run_command(cmd, shell=True):
    """Выполнить команду и вернуть результат"""
    try:
        result = subprocess.run(cmd, shell=shell, capture_output=True, text=True, timeout=10)
        return result.stdout.strip() if result.returncode == 0 else None
    except:
        return None

def find_processes():
    """Найти процессы Python"""
    print("=== 1. Процессы Python ===")
    result = run_command("ps aux | grep python | grep -v grep")
    print(result if result else "Не найдено")
    print()

def find_uvicorn():
    """Найти процессы uvicorn/gunicorn"""
    print("=== 2. Процессы uvicorn/gunicorn ===")
    result = run_command("ps aux | grep -E 'uvicorn|gunicorn|fastapi' | grep -v grep")
    print(result if result else "Не найдено")
    print()

def find_ports():
    """Найти открытые порты"""
    print("=== 3. Открытые порты ===")
    result = run_command("netstat -tulpn 2>/dev/null | grep -E ':80|:443|:8000'")
    if not result:
        result = run_command("ss -tulpn 2>/dev/null | grep -E ':80|:443|:8000'")
    print(result if result else "Не найдено")
    print()

def find_systemd_services():
    """Найти systemd сервисы"""
    print("=== 4. Systemd сервисы ===")
    result = run_command("systemctl list-units --type=service --all 2>/dev/null | grep -E 'dedato|python|backend|web|uvicorn'")
    print(result if result else "Не найдено")
    print()

def find_working_directory():
    """Найти рабочую директорию процесса"""
    print("=== 5. Рабочая директория процесса ===")
    result = run_command("ps aux | grep -E 'uvicorn|gunicorn|python.*main' | grep -v grep | awk '{print $2}' | head -1")
    if result:
        pid = result.strip()
        if pid and os.path.exists(f"/proc/{pid}"):
            try:
                cwd = os.readlink(f"/proc/{pid}/cwd")
                print(f"PID: {pid}")
                print(f"Рабочая директория: {cwd}")
                with open(f"/proc/{pid}/cmdline", 'r') as f:
                    cmdline = f.read().replace('\0', ' ')
                    print(f"Команда: {cmdline}")
            except:
                print(f"PID найден: {pid}, но не удалось прочитать информацию")
        else:
            print("PID найден, но процесс недоступен")
    else:
        print("Процесс не найден")
    print()

def find_code_files():
    """Найти файлы кода"""
    print("=== 6. Поиск main.py ===")
    search_paths = ['/home', '/root']
    found = False
    for search_path in search_paths:
        if os.path.exists(search_path):
            for root, dirs, files in os.walk(search_path):
                # Пропускаем виртуальные окружения
                if 'site-packages' in root or '__pycache__' in root:
                    continue
                if 'main.py' in files:
                    path = os.path.join(root, 'main.py')
                    print(path)
                    found = True
                    # Показываем только первые 5
                    if found and len([f for f in glob.glob(f"{search_path}/**/main.py", recursive=True) if 'site-packages' not in f]) >= 5:
                        break
    if not found:
        print("Не найдено")
    print()
    
    print("=== 7. Поиск models.py ===")
    found = False
    for search_path in search_paths:
        if os.path.exists(search_path):
            for root, dirs, files in os.walk(search_path):
                if 'site-packages' in root or '__pycache__' in root:
                    continue
                if 'models.py' in files:
                    path = os.path.join(root, 'models.py')
                    print(path)
                    found = True
                    if found and len([f for f in glob.glob(f"{search_path}/**/models.py", recursive=True) if 'site-packages' not in f]) >= 5:
                        break
    if not found:
        print("Не найдено")
    print()

def find_systemd_units():
    """Найти unit файлы systemd"""
    print("=== 8. Unit файлы systemd ===")
    unit_path = "/etc/systemd/system"
    if os.path.exists(unit_path):
        for file in os.listdir(unit_path):
            if file.endswith('.service'):
                filepath = os.path.join(unit_path, file)
                try:
                    with open(filepath, 'r') as f:
                        content = f.read()
                        if 'dedato' in content.lower() or 'python' in content.lower() or 'uvicorn' in content.lower():
                            print(f"Найден: {filepath}")
                except:
                    pass
    else:
        print("Директория systemd не найдена")
    print()

def check_logs():
    """Проверить логи"""
    print("=== 9. Логи (последние 10 строк) ===")
    result = run_command("journalctl -n 10 --no-pager 2>/dev/null | tail -10")
    print(result if result else "Логи недоступны")
    print()

def main():
    print("=" * 50)
    print("ПОИСК ЗАПУЩЕННОГО ПРИЛОЖЕНИЯ")
    print("=" * 50)
    print()
    
    find_processes()
    find_uvicorn()
    find_ports()
    find_systemd_services()
    find_working_directory()
    find_code_files()
    find_systemd_units()
    check_logs()
    
    print("=" * 50)
    print("АНАЛИЗ ЗАВЕРШЕН")
    print("=" * 50)

if __name__ == "__main__":
    main()


