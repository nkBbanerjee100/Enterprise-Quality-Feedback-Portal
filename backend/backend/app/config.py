"""Configuration and environment variables.

Every machine-specific value (DB URLs, secrets, ports, URLs) is read
ONLY from the environment / .env file. Nothing here is hardcoded to a
particular laptop or server, and there are no fallback credentials —
if a required variable is missing, startup fails loudly instead of
silently connecting to someone else's database.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, List


class Settings(BaseSettings):
    """Application settings loaded from environment variables (.env)."""

    # ── Database (required — no default) ─────────────────────────────
    LOCAL_DATABASE_URL: str
    TMS_DATABASE_URL: str

    # ── JWT (required — no default) ──────────────────────────────────
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # ── Application ───────────────────────────────────────────────────
    APP_NAME: str = "CSAT Tool"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = "development"
    DEBUG: bool = False

    # ── Frontend base URL — used to build survey links in emails ──────
    # Set in .env:  FRONTEND_URL=http://yourdomain.com
    FRONTEND_URL: str = "http://localhost:3000"

    # ── CORS — comma-separated list of allowed origins ─────────────────
    # Set in .env:  CORS_ORIGINS=http://localhost:3000,http://localhost:5173
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    # ── Email / SMTP ────────────────────────────────────────────────
    smtp_server: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None

    @property
    def cors_origins_list(self) -> List[str]:
        """CORS_ORIGINS as a clean list, e.g. for CORSMiddleware(allow_origins=...)."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()