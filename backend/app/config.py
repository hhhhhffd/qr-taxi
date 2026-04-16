"""Configuration settings for the application."""
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    DATABASE_URL: str
    REDIS_URL: str = "redis://redis:6379/0"
    BOT_TOKEN: str
    BOT_USERNAME: str = "aparu_bot"
    APARU_API_KEY: str
    APARU_API_URL: str = "http://testtaxi3.aparu.kz"
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_EXPIRE_MINUTES: int = 1440
    JWT_REFRESH_EXPIRE_DAYS: int = 7
    DOMAIN: str
    WEBHOOK_SECRET: str
    DEBUG: bool = False
    METABASE_SITE_URL: str | None = None
    METABASE_EMBED_SECRET: str | None = None
    METABASE_DASHBOARD_ID: int | None = None
    METABASE_EMBED_TTL_MINUTES: int = 60

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
