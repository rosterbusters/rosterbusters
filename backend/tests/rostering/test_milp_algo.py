import pytest

from app.rostering.milp_algo import MILPInfeasibilityError, run_milp_pipeline


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
            milp_config={"equivalent_shift_target": 10},
        )
