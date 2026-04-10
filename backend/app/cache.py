import json
import logging
from typing import Any

import redis

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_client: redis.Redis | None = None


def _get_redis_client() -> redis.Redis | None:
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
        client.ping()
    except Exception as exc:
        logger.warning("Redis unavailable: %s", exc)
        return None
    _redis_client = client
    return _redis_client


def cache_get_json(key: str) -> Any | None:
    client = _get_redis_client()
    if not client:
        return None
    try:
        raw = client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("Redis get failed for %s: %s", key, exc)
        return None


def cache_set_json(key: str, value: Any, ttl_seconds: int) -> bool:
    client = _get_redis_client()
    if not client:
        return False
    try:
        client.set(key, json.dumps(value), ex=ttl_seconds)
        return True
    except Exception as exc:
        logger.warning("Redis set failed for %s: %s", key, exc)
        return False


def cache_delete(key: str) -> None:
    client = _get_redis_client()
    if not client:
        return
    try:
        client.delete(key)
    except Exception as exc:
        logger.warning("Redis delete failed for %s: %s", key, exc)
