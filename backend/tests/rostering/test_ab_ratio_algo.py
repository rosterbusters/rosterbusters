import pytest

from app.rostering import ab_ratio_algo
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


def test_ab_ratio_softens_min_nights_when_hard_requests_block_them() -> None:
    nurses = [
        {"id": 1, "name": "A1", "rank": "A"},
        {"id": 2, "name": "A2", "rank": "A"},
        {"id": 3, "name": "A3", "rank": "A"},
        {"id": 4, "name": "A4", "rank": "A"},
        {"id": 5, "name": "A5", "rank": "A"},
        {"id": 6, "name": "B1", "rank": "B"},
        {"id": 7, "name": "B2", "rank": "B"},
        {"id": 8, "name": "C1", "rank": "C"},
        {"id": 9, "name": "C2", "rank": "C"},
    ]
    shifts = [
        {
            "AM": {"A": 0, "B": 0, "C": 0},
            "PM": {"A": 0, "B": 0, "C": 0},
            "NIGHT": {"A": 1, "B": 0, "C": 0},
        }
        for _ in range(14)
    ]
    hard_requests = {
        1: [
            (day_idx, "OFF" if day_idx in {5, 6, 12, 13} else "AM")
            for day_idx in range(14)
        ]
    }

    result = run_ab_ratio_pipeline(
        nurses,
        shifts,
        hard_requests=hard_requests,
        milp_config={"ab_ratio_time_limit_s": 5},
    )

    nurse_rows = {nurse["name"]: nurse["schedule"] for nurse in result["nurses"]}
    assert "NIGHT" not in nurse_rows["A1"]


def test_ab_ratio_prorates_weekly_do_target_for_leave_days() -> None:
    nurses = [{"id": 1, "name": "A1", "rank": "A"}]
    shifts = [
        {
            "AM": {"A": 0, "B": 0, "C": 0},
            "PM": {"A": 0, "B": 0, "C": 0},
            "NIGHT": {"A": 0, "B": 0, "C": 0},
        }
        for _ in range(14)
    ]

    parsed = ab_ratio_algo.parse_ab_ratio_inputs(
        nurses,
        shifts,
        hard_requests={1: [(0, "AL"), (1, "AL"), (2, "AL")]},
    )

    assert parsed["ab_weekly_do_targets"][0] == [1, 2]


def test_ab_ratio_assigns_remaining_week_days_to_do_for_five_leave_days() -> None:
    nurses = [{"id": 1, "name": "A1", "rank": "A"}]
    shifts = [
        {
            "AM": {"A": 0, "B": 0, "C": 0},
            "PM": {"A": 0, "B": 0, "C": 0},
            "NIGHT": {"A": 0, "B": 0, "C": 0},
        }
        for _ in range(14)
    ]

    parsed = ab_ratio_algo.parse_ab_ratio_inputs(
        nurses,
        shifts,
        hard_requests={1: [(day_idx, "AL") for day_idx in range(5)]},
    )

    assert parsed["ab_weekly_do_targets"][0] == [2, 2]


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


def test_ab_ratio_does_not_penalize_last_day_night_as_isolated(monkeypatch: pytest.MonkeyPatch) -> None:
    test_weights = {key: 0 for key in ab_ratio_algo._DEFAULT_WEIGHTS}
    test_weights["isolated_night"] = 100
    monkeypatch.setattr(ab_ratio_algo, "_DEFAULT_WEIGHTS", test_weights)

    nurses = [
        {"id": 1, "name": "A1", "rank": "A"},
        {"id": 2, "name": "A2", "rank": "A"},
        {"id": 3, "name": "A3", "rank": "A"},
        {"id": 4, "name": "A4", "rank": "A"},
        {"id": 5, "name": "B1", "rank": "B"},
        {"id": 6, "name": "B2", "rank": "B"},
    ]
    shifts = [
        {
            "AM": {"A": 0, "B": 0, "C": 0},
            "PM": {"A": 0, "B": 0, "C": 0},
            "NIGHT": {"A": 0, "B": 0, "C": 0},
        }
        for _ in range(14)
    ]

    result = ab_ratio_algo.run_ab_ratio_pipeline(
        nurses,
        shifts,
        hard_requests={1: [(12, "DO"), (13, "N")]},
        milp_config={
            "ab_ratio_time_limit_s": 5,
            "ab_ratio_min_nights": 0,
            "_ab_ratio_relax_rank_a_night_cap": True,
        },
    )

    nurse_rows = {nurse["name"]: nurse["schedule"] for nurse in result["nurses"]}
    assert nurse_rows["A1"][12] in {"OFF", "RD"}
    assert nurse_rows["A1"][13] == "NIGHT"
    assert result["metadata"]["penalty_score"] == 0
