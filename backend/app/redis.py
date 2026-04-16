"""Redis connection and caching utilities."""
import logging

from redis.asyncio import ConnectionPool, Redis

from app.config import settings

logger = logging.getLogger(__name__)

# Create a connection pool for Redis
redis_pool = ConnectionPool.from_url(
    settings.REDIS_URL,
    max_connections=20,
    decode_responses=True,
)


async def get_redis() -> Redis:
    """Dependency for providing a Redis client from the shared connection pool."""
    client = Redis(connection_pool=redis_pool)
    try:
        yield client
    finally:
        await client.close()


async def cache_get(redis: Redis, key: str) -> str | None:
    """Get a value from the Redis cache.

    Returns ``None`` silently on Redis connection failure so callers can fall
    back to the database without crashing.

    Args:
        redis: Async Redis client.
        key: Cache key (will be prefixed with ``aparu:``).
    """
    try:
        return await redis.get(f"aparu:{key}")
    except Exception as exc:
        logger.warning("Redis cache_get failed for key 'aparu:%s': %s", key, exc)
        return None


async def cache_set(redis: Redis, key: str, value: str, ttl: int) -> None:
    """Set a value in the Redis cache with a TTL.

    Silently skips on Redis connection failure — a cache miss on the next read
    will re-populate from the database.

    Args:
        redis: Async Redis client.
        key: Cache key (will be prefixed with ``aparu:``).
        value: String value to cache.
        ttl: Time-to-live in seconds.
    """
    try:
        await redis.set(f"aparu:{key}", value, ex=ttl)
    except Exception as exc:
        logger.warning("Redis cache_set failed for key 'aparu:%s': %s", key, exc)