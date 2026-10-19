"""Ограничения нагрузки.

RateLimiter — частота запросов на пользователя (скользящие окна: в минуту и в сутки).
Gate — не больше SLOTS одновременных генераций (= -np у llama-server) и не больше QUEUE ожидающих;
остальным сразу 503 «занято» с Retry-After, чтобы не держать соединения минутами.
"""
import threading, time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, per_min=6, per_day=200):
        self.rules = [(60, per_min), (86400, per_day)]
        self.hits = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, key):
        """None — можно; иначе число секунд до следующей попытки."""
        now = time.time()
        with self.lock:
            q = self.hits[key]
            while q and q[0] < now - 86400:
                q.popleft()
            for window, limit in self.rules:
                recent = [t for t in q if t >= now - window]
                if len(recent) >= limit:
                    return int(recent[0] + window - now) + 1
            q.append(now)
            if len(self.hits) > 50000:  # защита памяти: выбрасываем неактивных
                for k in [k for k, v in self.hits.items() if not v or v[-1] < now - 86400]:
                    del self.hits[k]
        return None


class Busy(Exception):
    pass


class Gate:
    def __init__(self, slots=4, queue=8, wait=90):
        self.sem = threading.Semaphore(slots)
        self.queue, self.wait = queue, wait
        self.waiting = 0
        self.lock = threading.Lock()

    def __enter__(self):
        with self.lock:
            if self.waiting >= self.queue:
                raise Busy()
            self.waiting += 1
        try:
            if not self.sem.acquire(timeout=self.wait):
                raise Busy()
        finally:
            with self.lock:
                self.waiting -= 1
        return self

    def __exit__(self, *a):
        self.sem.release()
