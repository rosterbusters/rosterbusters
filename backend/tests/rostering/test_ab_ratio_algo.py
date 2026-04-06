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


def test_ab_ratio_no_night_nurse_can_still_receive_day_shifts() -> None:
    nurses = [
        {"id": 1, "name": "SN NoNight", "rank": "A", "no_night": True},
        {"id": 2, "name": "SN Flex1", "rank": "A"},
        {"id": 3, "name": "SN Flex2", "rank": "A"},
        {"id": 4, "name": "SN Flex3", "rank": "A"},
        {"id": 5, "name": "SN Flex4", "rank": "A"},
        {"id": 6, "name": "EN One", "rank": "B"},
        {"id": 7, "name": "EN Two", "rank": "B"},
        {"id": 8, "name": "EN Three", "rank": "B"},
        {"id": 9, "name": "HCA One", "rank": "C"},
        {"id": 10, "name": "HCA Two", "rank": "C"},
        {"id": 11, "name": "HCA Three", "rank": "C"},
    ]
    shifts = [
        {
            "AM": {"A": 1, "B": 1, "C": 0},
            "PM": {"A": 1, "B": 0, "C": 1},
            "NIGHT": {"A": 1, "B": 0, "C": 0},
        }
        for _ in range(14)
    ]

    result = run_ab_ratio_pipeline(
        nurses,
        shifts,
        milp_config={"ab_ratio_time_limit_s": 5},
    )

    nurse_rows = {nurse["name"]: nurse["schedule"] for nurse in result["nurses"]}
    no_night_schedule = nurse_rows["SN NoNight"]
    assert "N" not in no_night_schedule
    assert any(shift in {"A", "P"} for shift in no_night_schedule)


def test_ab_ratio_allows_four_nights_only_as_two_per_week() -> None:
    nurses = [
        {"id": 1, "name": "A1", "rank": "A"},
        {"id": 2, "name": "A2", "rank": "A"},
        {"id": 3, "name": "A3", "rank": "A"},
        {"id": 4, "name": "A4", "rank": "A"},
        {"id": 5, "name": "B1", "rank": "B"},
        {"id": 6, "name": "B2", "rank": "B"},
        {"id": 7, "name": "C1", "rank": "C"},
        {"id": 8, "name": "C2", "rank": "C"},
    ]
    shifts = [
        {
            "AM": {"A": 0, "B": 0, "C": 0},
            "PM": {"A": 0, "B": 0, "C": 0},
            "NIGHT": {"A": 1, "B": 0, "C": 0},
        }
        for _ in range(14)
    ]

    result = run_ab_ratio_pipeline(
        nurses,
        shifts,
        milp_config={"ab_ratio_time_limit_s": 5},
    )

    for nurse in result["nurses"]:
        night_days = [idx for idx, shift in enumerate(nurse["schedule"]) if shift == "NIGHT"]
        assert len(night_days) <= 4
        assert sum(1 for day_idx in night_days if day_idx < 7) <= 2
        assert sum(1 for day_idx in night_days if day_idx >= 7) <= 2


def test_ab_ratio_rejects_hard_requests_with_three_nights_in_a_week() -> None:
    nurses = [
        {"id": 1, "name": "A1", "rank": "A"},
        {"id": 2, "name": "A2", "rank": "A"},
        {"id": 3, "name": "A3", "rank": "A"},
        {"id": 4, "name": "B1", "rank": "B"},
        {"id": 5, "name": "B2", "rank": "B"},
        {"id": 6, "name": "C1", "rank": "C"},
        {"id": 7, "name": "C2", "rank": "C"},
    ]
    shifts = [
        {
            "AM": {"A": 0, "B": 0, "C": 0},
            "PM": {"A": 0, "B": 0, "C": 0},
            "NIGHT": {"A": 1, "B": 0, "C": 0},
        }
        for _ in range(14)
    ]

    with pytest.raises(ABRatioInfeasibilityError):
        run_ab_ratio_pipeline(
            nurses,
            shifts,
            hard_requests={1: [(0, "N"), (2, "N"), (4, "N")]},
            milp_config={"ab_ratio_time_limit_s": 5},
        )


def test_ab_ratio_allows_single_night_block_when_forced() -> None:
    nurses = [
        {"id": 1, "name": "A1", "rank": "A"},
        {"id": 2, "name": "A2", "rank": "A"},
        {"id": 3, "name": "A3", "rank": "A"},
        {"id": 4, "name": "A4", "rank": "A"},
        {"id": 5, "name": "B1", "rank": "B"},
        {"id": 6, "name": "B2", "rank": "B"},
        {"id": 7, "name": "C1", "rank": "C"},
        {"id": 8, "name": "C2", "rank": "C"},
    ]
    shifts = [
        {
            "AM": {"A": 0, "B": 0, "C": 0},
            "PM": {"A": 0, "B": 0, "C": 0},
            "NIGHT": {"A": 1, "B": 0, "C": 0},
        }
        for _ in range(14)
    ]

    result = run_ab_ratio_pipeline(
        nurses,
        shifts,
        hard_requests={1: [(0, "N"), (1, "DO")]},
        milp_config={"ab_ratio_time_limit_s": 5},
    )

    nurse_rows = {nurse["name"]: nurse["schedule"] for nurse in result["nurses"]}
    assert nurse_rows["A1"][0] == "NIGHT"
    assert nurse_rows["A1"][1] == "OFF"
