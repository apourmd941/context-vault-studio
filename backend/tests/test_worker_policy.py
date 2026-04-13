from context_vault_studio.services.worker_policy import (
    ABSOLUTE_WORKER_CAP,
    AGGRESSIVE_WORKER_COUNT,
    DEFAULT_WORKER_COUNT,
    clamp_worker_count,
)


def test_worker_policy_constants_match_repo_plan() -> None:
    assert DEFAULT_WORKER_COUNT == 8
    assert AGGRESSIVE_WORKER_COUNT == 10
    assert ABSOLUTE_WORKER_CAP == 12


def test_worker_policy_clamps_requests_to_absolute_cap() -> None:
    assert clamp_worker_count(DEFAULT_WORKER_COUNT) == 8
    assert clamp_worker_count(AGGRESSIVE_WORKER_COUNT) == 10
    assert clamp_worker_count(ABSOLUTE_WORKER_CAP + 4) == ABSOLUTE_WORKER_CAP
