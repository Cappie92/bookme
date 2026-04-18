# ⚡ Быстрый деплой на боевой сервер

## 🎯 Краткая инструкция

### 1. Резервная копия БД
```bash
# PostgreSQL
pg_dump -U user -d database > backup_$(date +%Y%m%d_%H%M%S).sql

# SQLite
cp bookme.db bookme.db.backup_$(date +%Y%m%d_%H%M%S)
```

### 2. Настройка .env
Добавьте в `backend/.env`:
```env
ROBOKASSA_MERCHANT_LOGIN=your_production_login
ROBOKASSA_PASSWORD_1=your_production_password_1
ROBOKASSA_PASSWORD_2=your_production_password_2
ROBOKASSA_IS_TEST=false
ROBOKASSA_RESULT_URL=https://dedato.ru/api/payments/robokassa/result
ROBOKASSA_SUCCESS_URL=https://dedato.ru/payment/success
ROBOKASSA_FAIL_URL=https://dedato.ru/payment/failed
```

### 3. Применение миграций
```bash
cd backend
python3 -m alembic upgrade head
```

### 4. Создание тестовых пользователей
```bash
cd backend/scripts
python3 create_test_users_balance_system.py
```

### 5. Проверка
- Проверьте API эндпоинты
- Проверьте страницы `/payment/success` и `/payment/failed`
- Проверьте балансы пользователей

---

**Подробная инструкция:** См. `DEPLOYMENT_PLAN.md`


