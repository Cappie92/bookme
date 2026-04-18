# Создание тестовых пользователей на сервере

## 📋 Информация о тестовых пользователях

**Пароль для всех тестовых пользователей:** `test123`

**Номера телефонов:**
- Мастера: `+79990000001` - `+79990000016`
- Салоны: создаются отдельно (если есть)

## 🚀 Создание тестовых пользователей

### Вариант 1: Использовать готовый скрипт (рекомендуется)

```bash
./create_test_users_on_server.sh
```

### Вариант 2: Вручную на сервере

```bash
ssh root@193.160.208.206
cd /home/root/dedato
docker-compose exec backend python3 /app/scripts/create_test_users_balance_system.py
```

## ✅ Проверка созданных пользователей

После создания можно проверить:

```bash
ssh root@193.160.208.206
cd /home/root/dedato
docker-compose exec backend python3 << 'EOF'
import sys
sys.path.insert(0, '/app')
from database import SessionLocal
from models import User, UserRole

db = SessionLocal()
try:
    masters = db.query(User).filter(User.role == UserRole.MASTER).count()
    print(f"✅ Мастера: {masters}")
    
    test_users = db.query(User).filter(
        User.phone.like('+799900000%')
    ).limit(5).all()
    
    for user in test_users:
        print(f"  - {user.phone} ({user.role})")
finally:
    db.close()
EOF
```

## 🔑 Вход в систему

Используйте:
- **Телефон:** `+79990000001` (или любой другой из списка)
- **Пароль:** `test123`

