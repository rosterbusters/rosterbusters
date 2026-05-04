from datetime import date

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


def test_twelve_hour_builds_class_c_targets_from_default_ratio() -> None:
    nurses = [
        {"id": 1, "name": "C1", "rank": "C"},
        {"id": 2, "name": "C2", "rank": "C"},
    ]
    shifts = [_empty_12hr_day() for _ in range(14)]

    parsed = twelve_hour_algo._parse_inputs(  # noqa: SLF001
        nurses,
        shifts,
        hard_requests=None,
        soft_requests=None,
        prev_last_shift=None,
        shift_hours=None,
        non_working_shift_codes=None,
        milp_config=None,
    )

    assert parsed["managed_working_rank_c"] == [0, 1]
    assert parsed["pattern_working_rank_c"] == []
    assert parsed["c_target_totals"] == {twelve_hour_algo.A12: 9, twelve_hour_algo.N12: 7}
    assert sum(parsed["c_daily_targets"][twelve_hour_algo.A12]) == 9
    assert sum(parsed["c_daily_targets"][twelve_hour_algo.N12]) == 7


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
            "N-12": {"A": 0, "B": 0, "C": 1},
        }
        for _ in range(14)
    ]

    result = run_twelve_hour_pipeline(
        nurses,
        shifts,
        milp_config={"twelve_hour_time_limit_s": 5, "twelve_hour_min_nights": 0},
    )

    for nurse in result["nurses"]:
        night_days = [idx for idx, shift in enumerate(nurse["schedule"]) if shift == "N-12"]
        assert len(night_days) <= 4
        assert sum(1 for day_idx in night_days if day_idx < 7) <= 2
        assert sum(1 for day_idx in night_days if day_idx >= 7) <= 2


def test_twelve_hour_class_c_ratio_targets_allow_both_shift_types() -> None:
    nurses = [
        {"id": 1, "name": "C1", "rank": "C"},
        {"id": 2, "name": "C2", "rank": "C"},
    ]
    shifts = [_empty_12hr_day() for _ in range(14)]

    result = run_twelve_hour_pipeline(
        nurses,
        shifts,
        milp_config={
            "twelve_hour_time_limit_s": 5,
            "twelve_hour_min_nights": 0,
            "rank_c_twelve_hour_shift_ratio": {"A-12": 1, "N-12": 1},
            "rank_c_night_cap_per_day": 1,
            "daily_total_shift_balance_enabled": False,
            "twelve_hour_weights": {
                "overall_ratio_a12": 0,
                "overall_ratio_n12": 0,
                "daily_ratio_a12": 0,
                "daily_ratio_n12": 0,
                "c_ratio_a12": 100_000,
                "c_ratio_n12": 100_000,
                "c_daily_ratio_a12": 50_000,
                "c_daily_ratio_n12": 50_000,
            },
        },
    )

    c_nurses = result["nurses"]
    total_a12 = sum(nurse["stats"]["a12_shifts"] for nurse in c_nurses)
    total_n12 = sum(nurse["stats"]["n12_shifts"] for nurse in c_nurses)

    assert total_a12 > 0
    assert total_n12 > 0
    assert total_n12 == 8
    for day_idx in range(14):
        assert sum(nurse["schedule"][day_idx] == "N-12" for nurse in c_nurses) <= 1


def test_twelve_hour_class_c_night_cap_still_overrides_ratio_pressure() -> None:
    nurses = [
        {"id": 1, "name": "C1", "rank": "C"},
        {"id": 2, "name": "C2", "rank": "C"},
    ]
    shifts = [_empty_12hr_day() for _ in range(14)]

    result = run_twelve_hour_pipeline(
        nurses,
        shifts,
        milp_config={
            "twelve_hour_time_limit_s": 5,
            "twelve_hour_min_nights": 0,
            "rank_c_twelve_hour_shift_ratio": {"A-12": 0, "N-12": 1},
            "rank_c_night_cap_per_day": 0,
            "daily_total_shift_balance_enabled": False,
            "twelve_hour_weights": {
                "overall_ratio_a12": 0,
                "overall_ratio_n12": 0,
                "daily_ratio_a12": 0,
                "daily_ratio_n12": 0,
                "c_ratio_a12": 100_000,
                "c_ratio_n12": 100_000,
                "c_daily_ratio_a12": 50_000,
                "c_daily_ratio_n12": 50_000,
            },
        },
    )

    for nurse in result["nurses"]:
        assert nurse["stats"]["n12_shifts"] == 0


def test_twelve_hour_class_c_defaults_remain_backward_compatible() -> None:
    nurses = [
        {"id": 1, "name": "A1", "rank": "A"},
        {"id": 2, "name": "B1", "rank": "B"},
        {"id": 3, "name": "C1", "rank": "C"},
        {"id": 4, "name": "C2", "rank": "C"},
    ]
    shifts = [_empty_12hr_day() for _ in range(14)]

    result = run_twelve_hour_pipeline(
        nurses,
        shifts,
        milp_config={"twelve_hour_time_limit_s": 5, "twelve_hour_min_nights": 0},
    )

    assert result["metadata"]["algorithm"] == "12HR"
    assert len(result["nurses"]) == 4
    for nurse in result["nurses"]:
        assert len(nurse["schedule"]) == 14


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


def test_twelve_hour_parses_long_service_sn_rank_a_fallback_nurses() -> None:
    nurses = [
        {"id": 1, "name": "SSN Eligible", "rank": "A", "designation": "SSN", "join_date": date(2020, 1, 1)},
        {"id": 2, "name": "SN Eligible", "rank": "A", "designation": "SN", "join_date": date(2020, 5, 2)},
        {"id": 3, "name": "SN Boundary", "rank": "A", "designation": "SN", "join_date": date(2023, 5, 3)},
        {"id": 4, "name": "SN Missing", "rank": "A", "designation": "SN", "join_date": None},
        {"id": 5, "name": "SN Invalid", "rank": "A", "designation": "SN", "join_date": "not-a-date"},
    ]
    shifts = [_empty_12hr_day() for _ in range(14)]

    parsed = twelve_hour_algo._parse_inputs(  # noqa: SLF001
        nurses,
        shifts,
        hard_requests=None,
        soft_requests=None,
        prev_last_shift=None,
        shift_hours=None,
        non_working_shift_codes=None,
        milp_config=None,
    )

    assert parsed["ssn_rank_a_daily_balance_nurses"] == [0]
    assert parsed["ssn_rank_a_fallback_nurses"] == [1]


def test_twelve_hour_long_service_sn_fallback_counts_as_one_replacement(monkeypatch: pytest.MonkeyPatch) -> None:
    test_weights = {key: 0 for key in twelve_hour_algo._DEFAULT_WEIGHTS}
    test_weights["ssn_rank_a_daily_shift_balance"] = 100
    monkeypatch.setattr(twelve_hour_algo, "_DEFAULT_WEIGHTS", test_weights)

    nurses = [
        {"id": 1, "name": "SN A12 1", "rank": "A", "designation": "SN", "join_date": date(2020, 1, 1)},
        {"id": 2, "name": "SN A12 2", "rank": "A", "designation": "SN", "join_date": date(2020, 1, 2)},
        {"id": 3, "name": "SN N12", "rank": "A", "designation": "SN", "join_date": date(2020, 1, 3)},
    ]
    shifts = [_empty_12hr_day() for _ in range(14)]
    hard_requests = {
        1: [(0, "A-12")] + [(day_idx, "OFF") for day_idx in range(1, 14)],
        2: [(0, "A-12")] + [(day_idx, "OFF") for day_idx in range(1, 14)],
        3: [(0, "N-12")] + [(day_idx, "OFF") for day_idx in range(1, 14)],
    }

    result = run_twelve_hour_pipeline(
        nurses,
        shifts,
        hard_requests=hard_requests,
        milp_config={
            "twelve_hour_time_limit_s": 5,
            "twelve_hour_min_nights": 0,
            "daily_total_shift_balance_enabled": False,
            "ssn_rank_a_shift_gap_target": 0,
        },
    )

    assert result["metadata"]["penalty_score"] == 0
