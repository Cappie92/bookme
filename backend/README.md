# Backend (FastAPI)

## Конфигурация

- Базовый пример переменных: **`.env.example`** → скопируйте в **`.env`**.
- **Robokassa — локальный тестовый режим:** шаблон **`.env.robokassa-test.local.example`**, runbook **[`docs/robokassa_test_mode.md`](docs/robokassa_test_mode.md)**.
- **Robokassa — production (шаблон):** **`.env.production.example`** (секреты в репозиторий не класть).

## Запуск

```bash
pip3 install -r requirements.txt
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Запуск с перекрытием `backend/.env` файлом **`.env.robokassa-test.local`** (ручной тест Robokassa):

```bash
python3 scripts/run_backend_robokassa_test.py
# или: make run-robokassa-test
```

## Тесты

```bash
make test
```
