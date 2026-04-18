"""
Единый источник конфигурации приложения (env vars).
Используется pydantic-settings; секреты без дефолтов в production.
"""
from pathlib import Path
from typing import Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _parse_bool(val: str) -> bool:
    v = (val or "").strip().lower()
    return v in ("1", "true", "yes")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # --- Environment ---
    ENVIRONMENT: str = "development"
    ENABLE_DEV_TESTDATA: str = ""
    DEV_E2E: str = ""

    # --- Auth (секреты: в prod без дефолта) ---
    JWT_SECRET_KEY: str = "your-secret-key-here-change-in-production"
    ACCESS_TOKEN_EXPIRE_DAYS: int = 7
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # --- Database ---
    DATABASE_URL: str = ""

    # --- Feature flags / business ---
    SALONS_ENABLED: str = ""
    SALON_ROLE_ENABLED: str = ""  # legacy alias: если задан, а SALONS_ENABLED нет — используем и логируем warning
    LEGACY_INDIE_MODE: str = "0"
    MASTER_CANON_DEBUG: str = "0"

    # --- Debug (logging / dev only) ---
    TZ: str = ""
    DEBUG_FUTURE_BOOKING_ID: Optional[str] = None
    SUBSCRIPTION_FEATURES_DEBUG: str = ""
    SUBSCRIPTION_DAYS_DEBUG: str = ""
    SUBSCRIPTION_CALC_DEBUG: str = ""
    SUBSCRIPTION_PAYMENT_DEBUG: str = ""
    PAYMENT_URL_DEBUG: str = ""
    DAILY_CHARGE_DEBUG: str = ""

    # --- URLs ---
    FRONTEND_URL: str = "http://localhost:5175"
    API_BASE_URL: str = "http://localhost:8000"

    # --- Demo master ---
    # Не использовать +79990000000…+79990000009: они заняты reseed_local_test_data (MASTER_PHONES).
    DEMO_MASTER_PHONE: str = "+79990009999"
    DEMO_MASTER_EMAIL: str = "demo-master@dedato.local"
    DEMO_MASTER_NAME: str = "Демо мастер DeDato"

    # --- Payments (Robokassa) ---
    ROBOKASSA_MODE: str = ""
    ROBOKASSA_MERCHANT_LOGIN: str = ""
    ROBOKASSA_PASSWORD_1: str = ""
    ROBOKASSA_PASSWORD_2: str = ""
    # true → IsTest=1, подпись init на ROBOKASSA_TEST_PASSWORD_1, ResultURL на ROBOKASSA_TEST_PASSWORD_2
    ROBOKASSA_IS_TEST: str = "false"
    ROBOKASSA_TEST_PASSWORD_1: str = ""
    ROBOKASSA_TEST_PASSWORD_2: str = ""
    ROBOKASSA_RESULT_URL: str = ""
    ROBOKASSA_SUCCESS_URL: str = ""
    ROBOKASSA_FAIL_URL: str = ""

    # --- Telephony / SMS ---
    ZVONOK_API_KEY: str = ""
    ZVONOK_MODE: str = ""
    PLUSOFON_USER_ID: str = ""
    PLUSOFON_ACCESS_TOKEN: str = ""
    PLUSOFON_MODE: str = ""
    REDIS_HOST: str = "localhost"
    REDIS_PORT: str = "6379"

    @model_validator(mode="before")
    @classmethod
    def default_database_url(cls, data: object) -> object:
        if isinstance(data, dict):
            url = (data.get("DATABASE_URL") or "").strip()
            if not url:
                base_dir = Path(__file__).resolve().parent
                data = {**data, "DATABASE_URL": f"sqlite:///{base_dir}/bookme.db"}
        return data

    @model_validator(mode="after")
    def validate_jwt_secret_in_production(self) -> "Settings":
        if self.ENVIRONMENT.strip().lower() != "production":
            return self
        dev_default = "your-secret-key-here-change-in-production"
        if not self.JWT_SECRET_KEY or self.JWT_SECRET_KEY == dev_default:
            raise ValueError(
                "JWT_SECRET_KEY must be set to a strong secret in production. "
                "Do not use the default value."
            )
        return self

    @model_validator(mode="after")
    def validate_feature_secrets_in_production(self) -> "Settings":
        """В production при включённой фиче (режим задан и не stub) требуются секреты."""
        if self.ENVIRONMENT.strip().lower() != "production":
            return self
        errs: list[str] = []
        robokassa_mode = (self.ROBOKASSA_MODE or "").strip().lower()
        if robokassa_mode and robokassa_mode != "stub":
            if not (self.ROBOKASSA_MERCHANT_LOGIN or "").strip():
                errs.append("ROBOKASSA_MERCHANT_LOGIN")
            if _parse_bool(self.ROBOKASSA_IS_TEST):
                if not (self.ROBOKASSA_TEST_PASSWORD_1 or "").strip():
                    errs.append("ROBOKASSA_TEST_PASSWORD_1")
                if not (self.ROBOKASSA_TEST_PASSWORD_2 or "").strip():
                    errs.append("ROBOKASSA_TEST_PASSWORD_2")
            else:
                if not (self.ROBOKASSA_PASSWORD_1 or "").strip():
                    errs.append("ROBOKASSA_PASSWORD_1")
                if not (self.ROBOKASSA_PASSWORD_2 or "").strip():
                    errs.append("ROBOKASSA_PASSWORD_2")
        zvonok_mode = (self.ZVONOK_MODE or "").strip().lower()
        if zvonok_mode and zvonok_mode != "stub" and not (self.ZVONOK_API_KEY or "").strip():
            errs.append("ZVONOK_API_KEY")
        plusofon_mode = (self.PLUSOFON_MODE or "").strip().lower()
        if plusofon_mode and plusofon_mode != "stub":
            if not (self.PLUSOFON_USER_ID or "").strip():
                errs.append("PLUSOFON_USER_ID")
            if not (self.PLUSOFON_ACCESS_TOKEN or "").strip():
                errs.append("PLUSOFON_ACCESS_TOKEN")
        if errs:
            raise ValueError(
                "In production, the following secrets are required for enabled features: "
                + ", ".join(errs)
            )
        return self

    # --- Computed / helpers ---
    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "development"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "production"

    @property
    def enable_dev_testdata(self) -> bool:
        return self.is_development and _parse_bool(self.ENABLE_DEV_TESTDATA)

    @property
    def dev_e2e(self) -> bool:
        # Production: никогда не монтируем E2E/dev-seed роутеры, даже при ошибочном DEV_E2E=true в env.
        if self.is_production:
            return False
        return _parse_bool(self.DEV_E2E)

    @property
    def salons_enabled_env(self) -> bool:
        if _parse_bool(self.SALONS_ENABLED):
            return True
        return _parse_bool(self.SALON_ROLE_ENABLED)

    @property
    def used_legacy_salon_alias(self) -> bool:
        """True если фактически использован legacy SALON_ROLE_ENABLED (для одного warning при старте)."""
        return bool(
            (self.SALON_ROLE_ENABLED or "").strip()
            and not (self.SALONS_ENABLED or "").strip()
            and _parse_bool(self.SALON_ROLE_ENABLED)
        )

    @property
    def robokassa_stub(self) -> bool:
        return self.ROBOKASSA_MODE.strip().lower() == "stub"

    @property
    def robokassa_is_test(self) -> bool:
        """Тестовый режим Robokassa: IsTest=1 и отдельные тестовые пароли."""
        return _parse_bool(self.ROBOKASSA_IS_TEST)

    @property
    def zvonok_stub(self) -> bool:
        return self.ZVONOK_MODE.strip().lower() == "stub"

    @property
    def plusofon_stub(self) -> bool:
        return self.PLUSOFON_MODE.strip().lower() == "stub"

    @property
    def redis_port_int(self) -> int:
        try:
            return int(self.REDIS_PORT.strip())
        except (ValueError, AttributeError):
            return 6379

    def log_safe_summary(self) -> dict:
        """Для лога при старте: только несекретные поля."""
        return {
            "ENVIRONMENT": self.ENVIRONMENT,
            "DATABASE": "sqlite" if "sqlite" in self.DATABASE_URL else "postgres",
            "ROBOKASSA_MODE": self.ROBOKASSA_MODE or "(empty)",
            "ROBOKASSA_IS_TEST": self.robokassa_is_test,
            "ENABLE_DEV_TESTDATA": self.enable_dev_testdata,
            "DEV_E2E": self.dev_e2e,
            "LEGACY_INDIE_MODE": _parse_bool(self.LEGACY_INDIE_MODE),
            "SALONS_ENABLED": self.salons_enabled_env,
        }


# Синглтон при старте приложения
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reload_settings() -> Settings:
    global _settings
    _settings = Settings()
    return _settings
