from app.services import algorithm_lock_service


class _FakePipeline:
    def __init__(self, redis_client: "_FakeRedis") -> None:
        self.redis_client = redis_client
        self.delete_key: str | None = None

    def __enter__(self) -> "_FakePipeline":
        return self

    def __exit__(self, *args: object) -> None:
        self.reset()

    def watch(self, key: str) -> None:
        self.watched_key = key

    def get(self, key: str) -> str | None:
        return self.redis_client.get(key)

    def unwatch(self) -> None:
        self.watched_key = None

    def multi(self) -> None:
        return None

    def delete(self, key: str) -> None:
        self.delete_key = key

    def execute(self) -> None:
        if self.delete_key is not None:
            self.redis_client.delete(self.delete_key)
        self.reset()

    def reset(self) -> None:
        self.delete_key = None


class _FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.expired_keys: list[str] = []

    def set(self, key: str, value: str, *, nx: bool, ex: int) -> bool:
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    def get(self, key: str) -> str | None:
        return self.values.get(key)

    def expire(self, key: str, seconds: int) -> bool:
        if key not in self.values:
            return False
        self.expired_keys.append(key)
        return True

    def delete(self, key: str) -> None:
        self.values.pop(key, None)

    def pipeline(self) -> _FakePipeline:
        return _FakePipeline(self)


def test_ward_algorithm_lock_is_owner_scoped(monkeypatch) -> None:
    fake_redis = _FakeRedis()
    monkeypatch.setattr(
        algorithm_lock_service,
        "_get_redis_client",
        lambda: fake_redis,
    )

    assert algorithm_lock_service.acquire_ward_algorithm_lock(12, "owner-a")
    assert not algorithm_lock_service.acquire_ward_algorithm_lock(12, "owner-b")
    assert not algorithm_lock_service.release_ward_algorithm_lock(12, "owner-b")
    assert algorithm_lock_service.refresh_ward_algorithm_lock(12, "owner-a")
    assert algorithm_lock_service.release_ward_algorithm_lock(12, "owner-a")
    assert algorithm_lock_service.acquire_ward_algorithm_lock(12, "owner-b")
