from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

load_dotenv()

# Получаем абсолютный путь к директории backend
BASE_DIR = Path(__file__).resolve().parent

# Используем SQLite по умолчанию с абсолютным путем
# Примечание: название базы данных остается bookme.db для совместимости с существующими данными
SQLALCHEMY_DATABASE_URL = f"sqlite:///{BASE_DIR}/bookme.db"

# Создаем движок SQLAlchemy
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# Создаем фабрику сессий
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Создаем базовый класс для моделей
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
