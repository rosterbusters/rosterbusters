import pytest

from app.rostering import twelve_hour_algo
from app.rostering.twelve_hour_algo import run_twelve_hour_pipeline


def _empty_12hr_day() -> dict:
    return {
        "A-12": {"A": 0, "B": 0, "C": 0},
        "N-12": {"A": 0, "B": 0, "C": 0},
    }


def test_twelve_hour_prorates_weekly_off_target_for_leave_days() -> None:
    nurses = [{"id": 1, "name": "A1", "rank": "A"}]
    shifts = [_empty_12hr_day() for _ in range(14)]

    parsed = twelve_hour_algo._parse_inputs(  # noqa: SLF001
        nurses,
        shifts,
        hard_requests={1: [(0, "AL"), (1, "AL"), (2, "AL")]},
        soft_requests=None,
        prev_last_shift=None,
        shift_hours=None,
        non_working_shift_codes=None,
        milp_config=None,
    )

    assert parsed["weekly_off_targets"][0] == [2, 3]


def test_twelve_hour_rejects_unmet_rank_b_daily_night_minimum() -> None:
    nurses = [
        {"id": 1, "name": "A1", "rank": "A"},
        {"id": 2, "name": "A2", "rank": "A"},
        {"id": 3, "name": "B1", "rank": "B", "no_night": True},
        {"id": 4, "name": "C1", "rank": "C"},
        {"id": 5, "name": "C2", "rank": "C"},
    ]
    shifts = [
        {
            "A-12": {"A": 0, "B": 0, "C": 0},
            "N-12": {"A": 0, "B": 1, "C": 0},
        }
        for _ in range(14)
    ]

    with pytest.raises(RuntimeError, match="hard rank A/B daily night minimums"):
        run_twelve_hour_pipeline(
            nurses,
            shifts,
            milp_config={
                "twelve_hour_time_limit_s": 5,
                "rank_b_night_min_mode": "hard",
                "twelve_hour_min_nights": 0,
            },
        )


def test_twelve_hour_preserves_hard_rank_a_night_cap() -> None:
    nurses = [
        {"id": 1, "name": "A1", "rank": "A"},
        {"id": 2, "name": "A2", "rank": "A"},
        {"id": 3, "name": "A3", "rank": "A"},
        {"id": 4, "name": "A4", "rank": "A"},
        {"id": 5, "name": "B1", "rank": "B"},
        {"id": 6, "name": "B2", "rank": "B"},
        {"id": 7, "name": "C1", "rank": "C"},
        {"id": 8, "name": "C2", "rank": "C"},
        {"id": 9, "name": "C3", "rank": "C"},
        {"id": 10, "name": "C4", "rank": "C"},
    ]
    shifts = [
        {
            "A-12": {"A": 0, "B": 0, "C": 0},
            "N-12": {"A": 1, "B": 0, "C": 1},
        }
        for _ in range(14)
    ]

    result = run_twelve_hour_pipeline(
        nurses,
        shifts,
        milp_config={
            "twelve_hour_time_limit_s": 5,
            "rank_a_night_cap_per_day": 1,
            "twelve_hour_min_nights": 0,
        },
    )

    for day_idx in range(14):
        assert sum(nurse["schedule"][day_idx] == "N-12" for nurse in result["nurses"] if nurse["rank"] == "A") <= 1


def test_twelve_hour_limits_nights_to_four_total_and_two_per_week() -> None:
    nurses = [
        {"id": 1, "name": "A1", "rank": "A"},
        {"id": 2, "name": "A2", "rank": "A"},
        {"id": 3, "name": "A3", "rank": "A"},
        {"id": 4, "name": "B1", "rank": "B"},
        {"id": 5, "name": "B2", "rank": "B"},
        {"id": 6, "name": "C1", "rank": "C"},
        {"id": 7, "name": "C2", "rank": "C"},
        {"id": 8, "name": "C3", "rank": "C"},
    ]
    shifts = [
        {
            "A-12": {"A": 0, "B": 0, "C": 0},
            "N-12": {"A": 1, "B": 0, "C": 0},
        }
        for _ in range(14)
    ]

    result = run_twelve_hour_pipeline(
        nurses,
        shifts,
        milp_config={"twelve_hour_time_limit_s": 5},
    )

    for nurse in result["nurses"]:
        night_days = [idx for idx, shift in enumerate(nurse["schedule"]) if shift == "N-12"]
        assert len(night_days) <= 4
        assert sum(1 for day_idx in night_days if day_idx < 7) <= 2
        assert sum(1 for day_idx in night_days if day_idx >= 7) <= 2


def test_twelve_hour_output_schema_uses_12hr_stats() -> None:
    nurses = [
        {"id": 1, "name": "A1", "rank": "A"},
        {"id": 2, "name": "B1", "rank": "B"},
        {"id": 3, "name": "C1", "rank": "C"},
    ]
    shifts = [_empty_12hr_day() for _ in range(14)]

    result = run_twelve_hour_pipeline(
        nurses,
        shifts,
        hard_requests={1: [(0, "A-12")], 2: [(1, "N-12")], 3: [(2, "AL")]},
        milp_config={"twelve_hour_time_limit_s": 5, "twelve_hour_min_nights": 0},
    )

    assert result["metadata"]["algorithm"] == "12HR"
    for nurse in result["nurses"]:
        assert set(nurse["stats"]) == {"total_shifts", "a12_shifts", "n12_shifts", "days_off", "al_days"}
