#!/usr/bin/env python3
"""
Запуск uvicorn с базовым backend/.env и перекрытием Robokassa test из .env.robokassa-test.local.

LOCAL TEST ONLY — не использовать для production.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> None:
    backend = Path(__file__).resolve().parent.parent
    os.chdir(backend)

    env_base = backend / ".env"
    env_test = backend / ".env.robokassa-test.local"

    try:
        from dotenv import load_dotenv
    except ImportError as e:
        print("Нужен пакет python-dotenv: pip install -r requirements.txt", file=sys.stderr)
        raise SystemExit(1) from e

    if env_base.exists():
        load_dotenv(env_base, override=False)
    if not env_test.exists():
        print(
            f"Не найден файл: {env_test}\n"
            "Скопируйте шаблон: cp .env.robokassa-test.local.example .env.robokassa-test.local\n"
            "И заполните значения. См. docs/robokassa_test_mode.md",
            file=sys.stderr,
        )
        raise SystemExit(1)
    load_dotenv(env_test, override=True)

    host = os.environ.get("HOST", "0.0.0.0")
    try:
        port = int(os.environ.get("PORT", "8000"))
    except ValueError:
        port = 8000

    os.execvp(sys.executable, [
        sys.executable,
        "-m",
        "uvicorn",
        "main:app",
        "--reload",
        "--host",
        host,
        "--port",
        str(port),
    ])


if __name__ == "__main__":
    main()
