# Точка входа uvicorn: main:app (запуск из каталога backend/). Пакета src/ в проекте нет — не использовать src.app.main.
import asyncio
import logging
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from database import Base, engine
from settings import get_settings
from exceptions import SchemaOutdatedError
from routers import admin, auth, bookings, client, master, salon, blog, moderator, domain, subscriptions, balance, loyalty, expenses, promo_codes, accounting, tax_rates, subscription_plans, subscription_plans_public, master_page_modules, service_functions, payments, public_master
from routers import master_loyalty, client_loyalty, master_clients
from routers import dev_testdata, dev_e2e
from routers.address_extraction import router as address_router
from routers.yandex_geocoder import router as geocoder_router
from services.daily_charges import run_daily_charges_task
from services.recurring_expenses import run_recurring_expenses_task
from services.bookings_limit_monitor import run_bookings_limit_monitor_task
from services.temporary_bookings_cleanup import run_temporary_bookings_cleanup_task
from spa_catchall_route import SpaCatchAllAPIRoute
from route_diagnostics import log_app_entrypoint_hint, log_route_diagnostics

# Создаем таблицы в базе данных
Base.metadata.create_all(bind=engine)

OPENAPI_TAGS = [
    {"name": "auth", "description": "Авторизация, регистрация, токены"},
    {"name": "bookings", "description": "Бронирования (список, создание, слоты)"},
    {"name": "public_master", "description": "Публичная страница мастера и запись без авторизации салона"},
    {"name": "master", "description": "API мастера: профиль, расписание, услуги, дашборд"},
    {"name": "client", "description": "API клиента: мои записи, дашборд"},
    {"name": "admin", "description": "Администрирование: пользователи, настройки, блог"},
    {"name": "salon", "description": "API салона: профиль, услуги, мастера, филиалы"},
    {"name": "payments", "description": "Платежи: подписка, депозит, Robokassa"},
    {"name": "subscriptions", "description": "Подписки мастера: тариф, заморозка, расчёт"},
    {"name": "balance", "description": "Баланс и транзакции"},
    {"name": "loyalty", "description": "Программа лояльности (мастер): скидки, правила"},
    {"name": "master_loyalty", "description": "Настройки и история лояльности мастера"},
    {"name": "client_loyalty", "description": "Баллы и скидки клиента"},
    {"name": "domain", "description": "Информация по поддомену (лендинг, виджет)"},
    {"name": "blog", "description": "Публичный блог"},
    {"name": "moderators", "description": "Модераторы"},
    {"name": "expenses", "description": "Расходы и доходы"},
    {"name": "accounting", "description": "Учёт мастера"},
    {"name": "tax-rates", "description": "Налоговые ставки мастера"},
    {"name": "master-clients", "description": "Клиенты мастера и ограничения"},
    {"name": "promo-codes", "description": "Промокоды"},
    {"name": "subscription-plans", "description": "Тарифы подписок (админ)"},
    {"name": "master-page-modules", "description": "Модули страницы мастера"},
    {"name": "admin-service-functions", "description": "Сервисные функции (админ)"},
    {"name": "dev-testdata", "description": "Dev: тестовые данные (только development)"},
    {"name": "dev-e2e", "description": "Dev: E2E сиды (только при DEV_E2E)"},
]

app = FastAPI(
    title="DeDato API",
    description="API для системы бронирования салонов красоты и мастеров",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    openapi_tags=OPENAPI_TAGS,
)


@app.exception_handler(SchemaOutdatedError)
async def schema_outdated_handler(request, exc: SchemaOutdatedError):
    """409 SCHEMA_OUTDATED: плоский JSON + X-Error-Code. Не обходит общий error-handling."""
    body = {
        "detail": exc.detail,
        "code": "SCHEMA_OUTDATED",
        "hint": exc.hint,
    }
    if exc.debug is not None:
        body["debug"] = exc.debug
    return JSONResponse(
        status_code=409,
        content=body,
        headers={"X-Error-Code": "SCHEMA_OUTDATED"},
    )

# Настройки CORS
_settings = get_settings()
environment = _settings.ENVIRONMENT


def _normalize_origin(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return ""
    return u.rstrip("/")


def _production_cors_origins() -> list[str]:
    """
    В production нельзя полагаться только на захардкоженный список доменов:
    FRONTEND_URL / API_BASE_URL — часть контракта деплоя и должны попадать в CORS автоматически.
    """
    base = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:4173",
        "https://dedato.ru",
        "https://app.dedato.ru",
        "https://dedato.com",
        "https://app.dedato.com",
    ]
    extra = [
        _normalize_origin(_settings.FRONTEND_URL),
        _normalize_origin(_settings.API_BASE_URL),
    ]
    out: list[str] = []
    for o in base + extra:
        if o and o not in out:
            out.append(o)
    return out


# Для мобильных приложений (Expo Go, React Native) добавляем дополнительные origins
# Расширяем список origins для development (включая возможные IP адреса для мобильных)
development_origins = _production_cors_origins().copy()
# Добавляем возможные локальные IP для мобильной разработки (можно расширить при необходимости)
# development_origins.extend([
#     "http://192.168.0.194:5173",  # Пример для мобильной разработки
#     "exp://192.168.0.194:8081",    # Expo Go
# ])

if environment == "development":
    # В development используем расширенный список origins
    # НЕ используем allow_origins=["*"] с allow_credentials=True - это не работает в браузерах
    app.add_middleware(
        CORSMiddleware,
        allow_origins=development_origins,  # Конкретные origins для development
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # В production используем только разрешённые origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_production_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Загрузки: запись в master.py идёт в uploads/photos относительно cwd процесса — тот же каталог, что и mount
os.makedirs(os.path.join("uploads", "photos"), exist_ok=True)
os.makedirs(os.path.join("uploads", "logos"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Подключаем статические файлы фронтенда
frontend_dist_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist_path, "assets")), name="assets")

# Подключаем роутеры
app.include_router(auth.router, prefix="/api")
app.include_router(client.router, prefix="/api")
app.include_router(client.profile_router, prefix="/api")
app.include_router(master.router, prefix="/api")
app.include_router(master_clients.router)
app.include_router(salon.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(bookings.router, prefix="/api")
app.include_router(blog.router)
app.include_router(moderator.router, prefix="/api")
app.include_router(domain.router)
app.include_router(subscriptions.router, prefix="/api")
app.include_router(balance.router, prefix="/api")
app.include_router(loyalty.router, prefix="/api")
app.include_router(expenses.router, prefix="/api")
app.include_router(promo_codes.router, prefix="/api")
app.include_router(accounting.router)
app.include_router(tax_rates.router)
app.include_router(master_loyalty.router)
app.include_router(client_loyalty.router)
app.include_router(subscription_plans.router)
app.include_router(subscription_plans_public.router)
app.include_router(master_page_modules.router)
app.include_router(service_functions.router)
app.include_router(payments.router, prefix="/api")
app.include_router(address_router, prefix="/api")
app.include_router(geocoder_router, prefix="/api/geocoder")
app.include_router(public_master.router)

# dev_testdata: только при ENVIRONMENT=development И ENABLE_DEV_TESTDATA=1
if _settings.enable_dev_testdata:
    app.include_router(dev_testdata.router, prefix="/api")

# E2E seed: только при DEV_E2E=true (без авторизации). В production никогда не монтируется (см. Settings.dev_e2e).
if _settings.dev_e2e:
    app.include_router(dev_e2e.router, prefix="/api")


@app.on_event("startup")
async def startup_event():
    log_route_diagnostics(app)
    log_app_entrypoint_hint()
    # Лог конфигурации при старте (без секретов); legacy-предупреждения — один раз
    try:
        s = get_settings()
        summary = s.log_safe_summary()
        logging.getLogger("uvicorn.error").info("Config loaded: %s", summary)
        if s.used_legacy_salon_alias:
            logging.getLogger("uvicorn.error").warning(
                "Config: SALON_ROLE_ENABLED is deprecated, use SALONS_ENABLED (see docs/CONFIG_CLEANUP_PLAN.md)"
            )
    except Exception as e:
        logging.getLogger("uvicorn.error").warning("Config summary log failed: %s", e)
    # Запускаем фоновую задачу ежедневных списаний
    app.state.daily_charges_task = asyncio.create_task(run_daily_charges_task())
    # Запускаем фоновую задачу создания циклических расходов
    app.state.recurring_expenses_task = asyncio.create_task(run_recurring_expenses_task())
    # Запускаем фоновую задачу мониторинга лимитов активных записей
    app.state.bookings_limit_monitor_task = asyncio.create_task(run_bookings_limit_monitor_task())
    # Запускаем фоновую задачу очистки просроченных временных броней
    app.state.temporary_bookings_cleanup_task = asyncio.create_task(run_temporary_bookings_cleanup_task())


@app.on_event("shutdown")
async def shutdown_event():
    # Корректно останавливаем фоновую задачу при завершении приложения
    task = getattr(app.state, "daily_charges_task", None)
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    
    recurring_task = getattr(app.state, "recurring_expenses_task", None)
    if recurring_task:
        recurring_task.cancel()
        try:
            await recurring_task
        except asyncio.CancelledError:
            pass
    
    limit_monitor_task = getattr(app.state, "bookings_limit_monitor_task", None)
    if limit_monitor_task:
        limit_monitor_task.cancel()
        try:
            await limit_monitor_task
        except asyncio.CancelledError:
            pass
    
    temporary_bookings_cleanup_task = getattr(app.state, "temporary_bookings_cleanup_task", None)
    if temporary_bookings_cleanup_task:
        temporary_bookings_cleanup_task.cancel()
        try:
            await temporary_bookings_cleanup_task
        except asyncio.CancelledError:
            pass


@app.get("/")
def read_root():
    return {"message": "Добро пожаловать в DeDato API"}

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "DeDato API"}

# Обработчик для SPA роутинга — GET /{full_path:path}.
# Реализован через SpaCatchAllAPIRoute: пути /api и /api/* не матчятся этим catch-all,
# иначе Starlette даёт POST к API 405 Allow: GET (partial match на GET-only route).
async def serve_spa(full_path: str):
    # Исключаем API пути и статические файлы
    if full_path.startswith(("api/", "auth/", "master/", "salon/", "admin/", "bookings/", "blog/", "moderator/", "domain/", "subscriptions/", "balance/", "loyalty/", "expenses/", "uploads/", "assets/")):
        raise HTTPException(status_code=404, detail="Not Found")
    
    # Для режима разработки - перенаправляем на Vite dev server
    if get_settings().is_development:
        return {
            "message": "Development mode - please use Vite dev server",
            "instruction": "Run 'cd frontend && npm run dev' and access http://localhost:5174/master",
            "vite_url": "http://localhost:5174/master"
        }
    
    # Для продакшена - возвращаем index.html
    index_path = os.path.join(os.getcwd(), "..", "frontend", "dist", "index.html")
    
    if os.path.exists(index_path):
        return FileResponse(index_path)
    else:
        # Если файл не найден, возвращаем JSON с инструкцией
        return {
            "message": "Frontend files not found. Please build the frontend first.",
            "instruction": "Run 'cd frontend && npm run build' to create the dist folder",
            "path": index_path,
            "exists": os.path.exists(index_path),
            "current_dir": os.getcwd()
        }


app.router.add_api_route(
    "/{full_path:path}",
    serve_spa,
    methods=["GET"],
    include_in_schema=False,
    route_class_override=SpaCatchAllAPIRoute,
    name="serve_spa",
)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
