import pytest

from app.rostering.ab_ratio_algo import ABRatioInfeasibilityError, run_ab_ratio_pipeline


def test_ab_ratio_rejects_unmet_rank_b_daily_night_minimum() -> None:
    nurses = [
        {"id": 1, "name": "A1", "rank": "A"},
        {"id": 2, "name": "A2", "rank": "A"},
        {"id": 3, "name": "A3", "rank": "A"},
        {"id": 4, "name": "A4", "rank": "A"},
        {"id": 5, "name": "A5", "rank": "A"},
        {"id": 6, "name": "B1", "rank": "B"},
        {"id": 7, "name": "C1", "rank": "C"},
        {"id": 8, "name": "C2", "rank": "C"},
        {"id": 9, "name": "C3", "rank": "C"},
        {"id": 10, "name": "C4", "rank": "C"},
    ]
    shifts = [
        {
            "AM": {"A": 0, "B": 0, "C": 0},
            "PM": {"A": 0, "B": 0, "C": 0},
            "NIGHT": {"A": 0, "B": 2, "C": 0},
        }
        for _ in range(14)
    ]

    with pytest.raises(ABRatioInfeasibilityError, match="hard rank A/B daily night minimums"):
        run_ab_ratio_pipeline(
            nurses,
            shifts,
            milp_config={"ab_ratio_time_limit_s": 5},
        )
