"""Main FastAPI application module."""
import asyncio
import logging
import logging.config
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from redis.asyncio import Redis
from sqlalchemy.exc import SQLAlchemyError

from app.bot.bot import setup_webhook, shutdown_bot
from app.config import settings
from app.database import async_session_maker
from app.redis import redis_pool
from app.api.router import api_router, platform_router
from app.api.ws import router as ws_router
import app.models  # noqa: F401 — register all models with Base.metadata
from app.seed import seed_database
from app.worker.order_worker import order_worker

logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {"format": "%(levelname)s: %(name)s: %(message)s"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
        }
    },
    "root": {"level": "INFO", "handlers": ["console"]},
    # Suppress noisy SQLAlchemy engine logs in production
    "loggers": {
        "sqlalchemy.engine": {"level": "WARNING"},
    },
})

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    # Startup: Init Redis client from pool and store in app state
    app.state.redis = Redis(connection_pool=redis_pool)

    # Schema is managed by Alembic migrations — no create_all here to
    # avoid conflicts with `alembic upgrade` on fresh/partially-migrated DBs.

    # Seed initial data
    async with async_session_maker() as session:
        await seed_database(session)

    # Configure Telegram webhook
    await setup_webhook(app)

    # Start background order worker
    app.state.worker_task = asyncio.create_task(order_worker(app))
    logger.info("Background order worker task created")

    yield

    # Shutdown: Cancel worker
    app.state.worker_task.cancel()
    try:
        await app.state.worker_task
    except asyncio.CancelledError:
        pass
    logger.info("Background order worker stopped")

    # Shutdown Telegram bot
    await shutdown_bot()

    # Shutdown: Close Redis connection
    await app.state.redis.close()
    await redis_pool.disconnect()

app = FastAPI(
    title="Aparu QR Taxi API",
    lifespan=lifespan,
    debug=settings.DEBUG,
)

# ---------------------------------------------------------------------------
# Global exception handlers
# ---------------------------------------------------------------------------

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    """Return 500 for all unhandled SQLAlchemy errors to avoid leaking DB details."""
    logger.error("Database error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Ошибка базы данных. Попробуйте позже."},
    )


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler for unexpected exceptions — returns 500 without tracebacks."""
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Внутренняя ошибка сервера."},
    )

# ---------------------------------------------------------------------------
# CORS — in production restrict to our domain + Telegram Web origins
# ---------------------------------------------------------------------------

#: Telegram Web App can open inside web.telegram.org; native apps don't send Origin.
_TELEGRAM_ORIGINS = [
    "https://web.telegram.org",
    "https://telegram.org",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=(
        ["*"]
        if settings.DEBUG
        else [f"https://{settings.DOMAIN}"] + _TELEGRAM_ORIGINS
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include main API router
app.include_router(api_router, prefix="/api")

# Platform router: /go/{slug} — no /api/ prefix, nginx passes /go/ straight here
app.include_router(platform_router)

# WebSocket router — mounted at /ws (nginx proxies /ws/ with upgrade headers)
app.include_router(ws_router, prefix="/ws")

# Mount static files for QR images
import os
os.makedirs("static/qr", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "aparu-api"}
