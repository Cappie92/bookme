import weakref
from pathlib import Path
from typing import Optional

from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from settings import get_settings

BASE_DIR = Path(__file__).resolve().parent
SQLALCHEMY_DATABASE_URL = get_settings().DATABASE_URL

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

_after_create_installed = False
_calendar_guard_hooked_engines: "weakref.WeakSet" = weakref.WeakSet()


def register_sqlite_calendar_guards_on_connect(dbapi_connection, dialect_name: str) -> None:
    if dialect_name != "sqlite":
        return
    from utils.sqlite_calendar_grid_guard import register_sqlite_calendar_guard_udfs

    register_sqlite_calendar_guard_udfs(dbapi_connection)


def apply_sqlite_calendar_guard_ddl(
    dbapi_connection,
    dialect_name: str,
    *,
    only_tables: Optional[set[str]] = None,
) -> None:
    if dialect_name != "sqlite":
        return
    from utils.sqlite_calendar_grid_guard import apply_sqlite_calendar_grid_guards

    apply_sqlite_calendar_grid_guards(dbapi_connection, only_tables=only_tables)


def _install_metadata_after_create_hook() -> None:
    global _after_create_installed
    if _after_create_installed:
        return

    @event.listens_for(Base.metadata, "after_create")
    def _after_create(_target, connection, *, tables=None, **_kw) -> None:
        if connection.dialect.name != "sqlite":
            return
        if not tables:
            return
        created = {table.name for table in tables}
        guard_tables = created.intersection({"bookings", "calendar_blocks"})
        if not guard_tables:
            return
        raw = connection.connection.dbapi_connection
        register_sqlite_calendar_guards_on_connect(raw, "sqlite")
        from utils.sqlite_calendar_grid_guard import apply_sqlite_calendar_grid_guards

        apply_sqlite_calendar_grid_guards(raw, only_tables=guard_tables)
        install_sqlite_calendar_guard_hooks(connection.engine)

    _after_create_installed = True


def install_sqlite_calendar_guard_hooks(target_engine) -> None:
    if target_engine in _calendar_guard_hooked_engines:
        return
    dialect_name = target_engine.dialect.name

    @event.listens_for(target_engine, "connect")
    def _on_connect(dbapi_connection, _connection_record) -> None:
        register_sqlite_calendar_guards_on_connect(dbapi_connection, dialect_name)

    _calendar_guard_hooked_engines.add(target_engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


_install_metadata_after_create_hook()
install_sqlite_calendar_guard_hooks(engine)