"""Sliding-window attempt limiter for credential checks.

In-memory on purpose: Arcana's API runs as a single uvicorn process, and this needs no new
infrastructure. If the API is ever scaled to several workers/hosts, back this with Redis -
the `hit`/`is_blocked`/`reset` interface is all the callers use."""

import time
from collections import defaultdict, deque


class AttemptLimiter:
    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._attempts: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> deque[float]:
        attempts = self._attempts[key]
        while attempts and now - attempts[0] > self.window_seconds:
            attempts.popleft()
        if not attempts:
            self._attempts.pop(key, None)
            return deque()
        return attempts

    def is_blocked(self, key: str) -> bool:
        return len(self._prune(key, time.monotonic())) >= self.max_attempts

    def retry_after(self, key: str) -> int:
        attempts = self._prune(key, time.monotonic())
        if len(attempts) < self.max_attempts:
            return 0
        return max(1, int(self.window_seconds - (time.monotonic() - attempts[0])))

    def hit(self, key: str) -> None:
        self._attempts[key].append(time.monotonic())

    def reset(self, key: str | None = None) -> None:
        if key is None:
            self._attempts.clear()
        else:
            self._attempts.pop(key, None)


# 8 wrong passwords for one account, or 40 from one address, per 15 minutes.
login_by_email = AttemptLimiter(max_attempts=8, window_seconds=15 * 60)
login_by_ip = AttemptLimiter(max_attempts=40, window_seconds=15 * 60)
