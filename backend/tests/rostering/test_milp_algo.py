import pytest

from app.rostering.milp_algo import (
    MILPInfeasibilityError,
    _estimate_nurse_work_capacity,
    run_milp_pipeline,
)


def test_milp_allows_single_night_block_when_forced() -> None:
    nurses = [
        {"id": 1, "name": "A1", "rank": "A"},
        {"id": 2, "name": "A2", "rank": "A"},
        {"id": 3, "name": "B1", "rank": "B"},
        {"id": 4, "name": "C1", "rank": "C"},
    ]
    shifts = [
        {
            "AM": {"A": 0, "B": 0, "C": 0},
            "PM": {"A": 0, "B": 0, "C": 0},
            "NIGHT": {"A": 1, "B": 0, "C": 0},
        }
        for _ in range(4)
    ]

    result = run_milp_pipeline(
        nurses,
        shifts,
        hard_requests={1: [(0, "NIGHT"), (1, "OFF")]},
        milp_config={"solver_name": "gurobi", "time_limit": 10},
    )

    nurse_rows = {nurse["name"]: nurse["schedule"] for nurse in result["nurses"]}
    assert nurse_rows["A1"][0] == "NIGHT"
    assert nurse_rows["A1"][1] == "OFF"


def test_milp_fails_fast_when_class_demand_exceeds_capacity() -> None:
    nurses = [
        {"id": i, "name": f"B{i}", "rank": "B"}
        for i in range(1, 12)
    ]
    shifts = [
        {
            "AM": {"A": 0, "B": 4, "C": 0},
            "PM": {"A": 0, "B": 2, "C": 0},
            "NIGHT": {"A": 0, "B": 2, "C": 0},
        }
        for _ in range(14)
    ]

    with pytest.raises(MILPInfeasibilityError, match="EN demand exceeds class capacity"):
        run_milp_pipeline(
            nurses,
            shifts,
            milp_config={"equivalent_shift_target": 10, "soften_equivalent_target": False},
        )


def test_estimate_nurse_work_capacity_treats_full_leave_as_zero_work_capacity() -> None:
    profile = _estimate_nurse_work_capacity(
        "B1",
        num_days=14,
        annual_leave_dict={},
        hard_dict={"B1": {f"Day {day}": "AL" for day in range(1, 15)}},
        nurse_constraints_dict={},
        equivalent_shift_target=10,
    )

    assert profile["work_capacity"] == 0
    assert profile["nurse_equivalent_target"] == 14


def test_estimate_nurse_work_capacity_uses_pattern_targets_for_fixed_shift_nurse() -> None:
    profile = _estimate_nurse_work_capacity(
        "A1",
        num_days=14,
        annual_leave_dict={},
        hard_dict={},
        nurse_constraints_dict={"A1": {"shift_pattern": "AM_ONLY"}},
        equivalent_shift_target=10,
    )

    assert profile["nurse_equivalent_target"] is None
    assert profile["work_capacity"] == 8
