from fastapi import FastAPI, HTTPException
import asyncio
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from database import Base, engine
from routers import admin, auth, bookings, client, master, salon, blog, moderator, domain, subscriptions, balance, loyalty, expenses, promo_codes
from routers.address_extraction import router as address_router
from routers.yandex_geocoder import router as geocoder_router
from services.daily_charges import run_daily_charges_task

# Создаем таблицы в базе данных
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="DeDato API",
    description="API для системы бронирования салонов красоты и мастеров",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Настройки CORS
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:4173",
    "https://dedato.com",  # Production domain
    "https://app.dedato.com",  # Production domain
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем статические файлы
if os.path.exists("uploads"):
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
app.include_router(salon.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(bookings.router, prefix="/api")
app.include_router(blog.router)
app.include_router(moderator.router, prefix="/api")
app.include_router(domain.router, prefix="/api")
app.include_router(subscriptions.router, prefix="/api")
app.include_router(balance.router, prefix="/api")
app.include_router(loyalty.router, prefix="/api")
app.include_router(expenses.router, prefix="/api")
app.include_router(promo_codes.router, prefix="/api")
app.include_router(address_router, prefix="/api")
app.include_router(geocoder_router, prefix="/api/geocoder")


@app.on_event("startup")
async def startup_event():
    # Запускаем фоновую задачу ежедневных списаний
    app.state.daily_charges_task = asyncio.create_task(run_daily_charges_task())


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


@app.get("/")
def read_root():
    return {"message": "Добро пожаловать в DeDato API"}

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "DeDato API"}

# Обработчик для SPA роутинга - возвращает index.html для всех неизвестных путей
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # Исключаем API пути и статические файлы
    if full_path.startswith(("api/", "auth/", "master/", "salon/", "admin/", "bookings/", "blog/", "moderator/", "domain/", "subscriptions/", "balance/", "loyalty/", "expenses/", "uploads/", "assets/")):
        raise HTTPException(status_code=404, detail="Not Found")
    
    # Для режима разработки - перенаправляем на Vite dev server
    if os.getenv("ENVIRONMENT", "development") == "development":
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
