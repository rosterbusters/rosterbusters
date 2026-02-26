#this is the algorithm scheduler
from app.rostering.milp_algo import run_milp_pipeline, MILPError
from app.rostering.ga_algo import run_ga_pipeline


def generate_roster(nurses, shifts, requests=None, ward_name="DEFAULT"):
    """
    Generate a nurse roster using MILP (primary) or GA (fallback).

    Parameters
    ----------
    nurses : list of nurse dicts
        [{"id": int|str, "name": str, "rank": "A"|"B"|"C"}, ...]
        rank "A" = RN, "B" = EN, "C" = HCA

    shifts : list of 14 daily shift-requirement dicts
        [
            {
                "AM":    {"A": int, "B": int, "C": int},
                "PM":    {"A": int, "B": int, "C": int},
                "NIGHT": {"A": int, "B": int, "C": int},
            },
            ...  (one entry per day, must be exactly 14 entries)
        ]

    requests : dict, optional
        {
            nurse_id: [(day_index_0based, "AM"|"PM"|"NIGHT"|"OFF"|"AL"), ...]
        }

    ward_name : str, optional
        Key into WARD_CONFIG (e.g. "WARD 04", "WARD 08").
        Defaults to "DEFAULT" if omitted or unrecognised.

    Returns
    -------
    {
        "method": "MILP" | "GA",
        "roster": {
            "nurses": [
                {
                    "id": ...,
                    "name": ...,
                    "rank": ...,
                    "schedule": ["AM", "OFF", "NIGHT", ...],   # 14 entries
                    "stats": {
                        "total_shifts": int,
                        "am_shifts": int,
                        "pm_shifts": int,
                        "night_shifts": int,
                        "days_off": int,
                    }
                },
                ...
            ],
            "metadata": {
                "num_days":    int,
                "num_nurses":  int,
                "algorithm":   "MILP" | "GA",
                "solver_status": str   # MILP only
                # OR
                "penalty_score": float # GA only
            }
        }
    }

    Raises
    ------
    ValueError
        If input validation fails.
    """
    validate_inputs(nurses, shifts, requests)

    # ── Primary: MILP ──────────────────────────────────────────────────────
    try:
        roster = run_milp_pipeline(nurses, shifts, requests, ward_name=ward_name)
        return {"method": "MILP", "roster": roster}

    except MILPError as e:
        print(f"MILP failed: {e}")

    # ── Fallback: GA ───────────────────────────────────────────────────────
    roster = run_ga_pipeline(nurses, shifts, requests)
    return {"method": "GA", "roster": roster}


def validate_inputs(nurses, shifts, requests):
    """
    Validate the structure and values of all inputs.

    Raises ValueError on any problem.
    """
    # ---- nurses ----
    if not isinstance(nurses, list) or not nurses:
        raise ValueError("nurses must be a non-empty list")

    required_keys = {"id", "name", "rank"}
    valid_ranks   = {"A", "B", "C"}
    nurse_ids     = set()

    for nurse in nurses:
        if not isinstance(nurse, dict):
            raise ValueError("Each nurse must be a dictionary")

        missing = required_keys - nurse.keys()
        if missing:
            raise ValueError(f"Nurse missing required keys: {missing}")

        if nurse["rank"] not in valid_ranks:
            raise ValueError(
                f"Invalid rank '{nurse['rank']}'. Must be A, B, or C"
            )

        if nurse["id"] in nurse_ids:
            raise ValueError(f"Duplicate nurse ID: {nurse['id']}")
        nurse_ids.add(nurse["id"])

    # ---- shifts ----
    if not isinstance(shifts, list) or not shifts:
        raise ValueError("shifts must be a non-empty list")

    valid_shift_names = {"AM", "PM", "NIGHT"}

    for day_idx, day_shifts in enumerate(shifts):
        if not isinstance(day_shifts, dict):
            raise ValueError(f"Day {day_idx} shifts must be a dictionary")

        for shift_name, reqs in day_shifts.items():
            if shift_name not in valid_shift_names:
                raise ValueError(
                    f"Invalid shift name '{shift_name}'. Must be AM, PM, or NIGHT"
                )
            if not isinstance(reqs, dict):
                raise ValueError(
                    f"Requirements for {shift_name} on day {day_idx} must be a dict"
                )
            for rank, count in reqs.items():
                if rank not in valid_ranks:
                    raise ValueError(f"Invalid rank '{rank}' in shift requirements")
                if not isinstance(count, int) or count < 0:
                    raise ValueError(
                        "Shift requirement count must be a non-negative integer"
                    )

    # ---- requests (optional) ----
    if requests is None:
        return

    if not isinstance(requests, dict):
        raise ValueError("requests must be a dictionary")

    num_days = len(shifts)
    valid_request_shifts = {"AM", "PM", "NIGHT", "OFF", "AL"}

    for nurse_id, req_list in requests.items():
        if nurse_id not in nurse_ids:
            raise ValueError(f"Request for unknown nurse ID: {nurse_id}")

        if not isinstance(req_list, list):
            raise ValueError(f"Requests for nurse {nurse_id} must be a list")

        for item in req_list:
            if not (isinstance(item, (list, tuple)) and len(item) == 2):
                raise ValueError(
                    f"Each request must be a (day_index, shift_name) pair; "
                    f"got {item!r} for nurse {nurse_id}"
                )
            day_idx, shift_name = item
            if not (0 <= day_idx < num_days):
                raise ValueError(
                    f"Invalid day index {day_idx} for nurse {nurse_id} "
                    f"(must be 0–{num_days - 1})"
                )
            if str(shift_name).upper() not in valid_request_shifts:
                raise ValueError(
                    f"Invalid shift name '{shift_name}' in request for nurse {nurse_id}. "
                    f"Must be one of {valid_request_shifts}"
                )