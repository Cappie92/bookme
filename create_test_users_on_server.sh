#!/bin/bash

# Скрипт для создания тестовых пользователей на сервере
# Использование: ./create_test_users_on_server.sh

SERVER_USER="root"
SERVER_HOST="193.160.208.206"

echo "🔧 Создание тестовых пользователей на сервере..."

ssh ${SERVER_USER}@${SERVER_HOST} << 'EOF'
cd /home/root/dedato

echo "=== Запуск скрипта создания тестовых пользователей ==="
docker-compose exec -T backend python3 /app/scripts/create_test_users_balance_system.py

echo ""
echo "=== Проверка созданных пользователей ==="
docker-compose exec -T backend python3 << 'PYEOF'
import sys
sys.path.insert(0, '/app')
from database import SessionLocal
from models import User, UserRole

db = SessionLocal()
try:
    # Проверяем количество пользователей по ролям
    masters = db.query(User).filter(User.role == UserRole.MASTER).count()
    salons = db.query(User).filter(User.role == UserRole.SALON).count()
    clients = db.query(User).filter(User.role == UserRole.CLIENT).count()
    
    print(f"✅ Мастера: {masters}")
    print(f"✅ Салоны: {salons}")
    print(f"✅ Клиенты: {clients}")
    
    # Показываем несколько примеров
    print("\n=== Примеры тестовых пользователей ===")
    test_users = db.query(User).filter(
        User.email.like('%@test.com')
    ).limit(5).all()
    
    for user in test_users:
        print(f"  - {user.email} ({user.role}) - {user.phone}")
        
finally:
    db.close()
PYEOF

echo ""
echo "✅ Тестовые пользователи созданы!"
EOF

echo ""
echo "✅ Готово! Теперь можно войти в систему с тестовыми аккаунтами."

