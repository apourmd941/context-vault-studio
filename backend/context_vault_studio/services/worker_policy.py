from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from typing import Iterator, Literal


DEFAULT_WORKER_COUNT = 8
AGGRESSIVE_WORKER_COUNT = 10
ABSOLUTE_WORKER_CAP = 12
WorkerProfile = Literal["default", "aggressive"]

_budget_condition = threading.Condition()
_reserved_workers = 0


def available_worker_budget() -> int:
    return max(1, min(os.cpu_count() or DEFAULT_WORKER_COUNT, ABSOLUTE_WORKER_CAP))


def worker_count_for_profile(profile: WorkerProfile = "default") -> int:
    return AGGRESSIVE_WORKER_COUNT if profile == "aggressive" else DEFAULT_WORKER_COUNT


def clamp_worker_count(requested: int | None = None, *, profile: WorkerProfile = "default") -> int:
    target = worker_count_for_profile(profile) if requested is None else int(requested)
    return max(1, min(target, available_worker_budget(), ABSOLUTE_WORKER_CAP))


def aggressive_worker_count() -> int:
    return clamp_worker_count(AGGRESSIVE_WORKER_COUNT)


def get_worker_budget_state() -> dict[str, int]:
    with _budget_condition:
        return {
            "reserved_budget": _reserved_workers,
            "budget_cap": available_worker_budget(),
        }


@contextmanager
def reserve_worker_budget(
    requested: int | None = None,
    *,
    profile: WorkerProfile = "default",
) -> Iterator[int]:
    global _reserved_workers

    granted = clamp_worker_count(requested, profile=profile)
    with _budget_condition:
        while _reserved_workers + granted > available_worker_budget():
            _budget_condition.wait()
        _reserved_workers += granted

    try:
        yield granted
    finally:
        with _budget_condition:
            _reserved_workers = max(0, _reserved_workers - granted)
            _budget_condition.notify_all()
