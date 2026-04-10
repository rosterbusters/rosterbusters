from __future__ import annotations

from functools import lru_cache

from redis import Redis

from app.core.config import settings

ALGORITHM_LOCK_TTL_SECONDS = 60 * 60 * 2


def _ward_lock_key(ward_id: int) -> str:
    return f"roster:algorithm-lock:ward:{ward_id}"


@lru_cache(maxsize=1)
def _get_redis_client() -> Redis:
    return Redis.from_url(settings.REDIS_URL, decode_responses=True)


def acquire_ward_algorithm_lock(ward_id: int, owner_id: str) -> bool:
    return bool(
        _get_redis_client().set(
            _ward_lock_key(ward_id),
            owner_id,
            nx=True,
            ex=ALGORITHM_LOCK_TTL_SECONDS,
        )
    )


def refresh_ward_algorithm_lock(ward_id: int, owner_id: str) -> bool:
    redis_client = _get_redis_client()
    lock_key = _ward_lock_key(ward_id)
    current_owner = redis_client.get(lock_key)
    if current_owner != owner_id:
        return False
    return bool(redis_client.expire(lock_key, ALGORITHM_LOCK_TTL_SECONDS))


def release_ward_algorithm_lock(ward_id: int, owner_id: str) -> bool:
    redis_client = _get_redis_client()
    lock_key = _ward_lock_key(ward_id)
    with redis_client.pipeline() as pipeline:
        while True:
            try:
                pipeline.watch(lock_key)
                current_owner = pipeline.get(lock_key)
                if current_owner != owner_id:
                    pipeline.unwatch()
                    return False
                pipeline.multi()
                pipeline.delete(lock_key)
                pipeline.execute()
                return True
            except Exception:
                pipeline.reset()
                raise
