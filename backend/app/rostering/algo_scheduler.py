#this is the algorithm scheduler
from app.rostering.milp_algo import MILPError, run_milp_pipeline


def _run_cp_sat_pipeline(*args, **kwargs):
    """
    Import the CP-SAT pipeline lazily so the backend can start even when
    optional solver dependencies (for example ortools) are not installed.
    """
    try:
        from app.rostering.cp_sat_algo import run_ga_pipeline
    except ModuleNotFoundError as exc:
        if exc.name == "ortools":
            raise RuntimeError(
                "CP-SAT requires the optional 'ortools' dependency, "
                "but it is not installed in this environment."
            ) from exc
        raise
    return run_ga_pipeline(*args, **kwargs)


def _normalize_shift_name(shift_name):
    normalized = str(shift_name).strip().upper()
    return {
        "A": "AM",
        "AM": "AM",
        "P": "PM",
        "PM": "PM",
        "N": "NIGHT",
        "NIGHT": "NIGHT",
        "DO": "OFF",
        "OFF": "OFF",
        "AL": "AL",
    }.get(normalized, normalized)


def _normalize_request_groups(request_groups):
    if request_groups is None:
        return None

    normalized_groups = {}
    for nurse_id, req_list in request_groups.items():
        normalized_groups[nurse_id] = [
            (day_idx, _normalize_shift_name(shift_name))
            for day_idx, shift_name in req_list
        ]
    return normalized_groups


def _normalize_prev_last_shift(prev_last_shift):
    if prev_last_shift is None:
        return None

    return {
        nurse_id: _normalize_shift_name(shift_name)
        for nurse_id, shift_name in prev_last_shift.items()
    }


def generate_roster(
    nurses,
    shifts,
    hard_requests=None,
    soft_requests=None,
    prev_last_shift=None,
    shift_hours=None,
    non_working_shift_codes=None,
    ward_name="DEFAULT",
    progress_callback=None,
    milp_config=None,
    algorithm=None,
):
    """
    Generate a nurse roster using MILP (primary) or CP-SAT (fallback).

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

    hard_requests : dict, optional
        Approved requests keyed by nurse_id.

    soft_requests : dict, optional
        Pending requests keyed by nurse_id.

    prev_last_shift : dict, optional
        Previous-period final shift keyed by nurse_id.

    shift_hours : dict, optional
        DB-derived shift durations keyed by AM/PM/NIGHT/OFF.

    non_working_shift_codes : collection[str], optional
        Shift codes that should be treated as non-working by CP-SAT.

    ward_name : str, optional
        Key into WARD_CONFIG (e.g. "WARD 04", "WARD 08").
        Defaults to "DEFAULT" if omitted or unrecognised.

    milp_config : dict, optional
        WARD_CONFIG-compatible override dict derived from staffing_json.
        When provided, the MILP solver uses this instead of WARD_CONFIG[ward_name].

    Returns
    -------
    {
        "method": "MILP" | "CP-SAT",
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
                "algorithm":   "MILP" | "CP-SAT",
                "solver_status": str   # MILP only
                # OR
                "penalty_score": float # CP-SAT only
            }
        }
    }

    Raises
    ------
    ValueError
        If input validation fails.
    """
    hard_requests = _normalize_request_groups(hard_requests)
    soft_requests = _normalize_request_groups(soft_requests)
    prev_last_shift = _normalize_prev_last_shift(prev_last_shift)

    validate_inputs(nurses, shifts, hard_requests, soft_requests, non_working_shift_codes)

    forced = str(algorithm).upper() if algorithm else None
    if forced == "GA":
        forced = "CP-SAT"

    # ── CP-SAT-only path ───────────────────────────────────────────────────
    if forced in {"CP-SAT", "CPSAT"}:
        print("[SCHEDULER] Running CP-SAT (forced by caller)")
        roster = _run_cp_sat_pipeline(
            nurses,
            shifts,
            hard_requests=hard_requests,
            soft_requests=soft_requests,
            prev_last_shift=prev_last_shift,
            non_working_shift_codes=non_working_shift_codes,
            progress_callback=progress_callback,
            shift_hours=shift_hours,
        )
        print("[SCHEDULER] CP-SAT succeeded — returning result")
        return {"method": "CP-SAT", "roster": roster}

    # ── MILP-only path ─────────────────────────────────────────────────────
    if forced == "MILP":
        print("[SCHEDULER] Running MILP (forced by caller)")
        roster = run_milp_pipeline(
            nurses,
            shifts,
            hard_requests=hard_requests,
            soft_requests=soft_requests,
            prev_last_shift=prev_last_shift,
            non_working_shift_codes=non_working_shift_codes,
            ward_name=ward_name,
            milp_config=milp_config,
            progress_callback=progress_callback,
        )
        print("[SCHEDULER] MILP succeeded — returning result")
        return {"method": "MILP", "roster": roster}

    # ── Auto: MILP primary, CP-SAT fallback ────────────────────────────────
    print("[SCHEDULER] Running MILP (primary algorithm)")
    try:
        roster = run_milp_pipeline(
            nurses,
            shifts,
            hard_requests=hard_requests,
            soft_requests=soft_requests,
            prev_last_shift=prev_last_shift,
            non_working_shift_codes=non_working_shift_codes,
            ward_name=ward_name,
            milp_config=milp_config,
            progress_callback=progress_callback,
        )
        print("[SCHEDULER] MILP succeeded — returning result")
        return {"method": "MILP", "roster": roster}

    except MILPError as e:
        print(f"[SCHEDULER] MILP failed: {e} — falling back to CP-SAT")
    except Exception as e:
        print(f"[SCHEDULER] MILP failed with unexpected error: {e} — falling back to CP-SAT")

    # ── Fallback: CP-SAT ───────────────────────────────────────────────────
    print("[SCHEDULER] Running CP-SAT (fallback algorithm)")
    roster = _run_cp_sat_pipeline(
        nurses,
        shifts,
        hard_requests=hard_requests,
        soft_requests=soft_requests,
        prev_last_shift=prev_last_shift,
        non_working_shift_codes=non_working_shift_codes,
        progress_callback=progress_callback,
        shift_hours=shift_hours,
    )
    print("[SCHEDULER] CP-SAT succeeded — returning result")
    return {"method": "CP-SAT", "roster": roster}


def validate_inputs(nurses, shifts, hard_requests, soft_requests, non_working_shift_codes=None):
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
    num_days = len(shifts)
    valid_request_shifts = {"AM", "PM", "NIGHT", "OFF", "AL"}
    non_working_shift_codes = {
        str(code).upper() for code in (non_working_shift_codes or set())
    }

    for request_group, label in ((hard_requests, "hard_requests"), (soft_requests, "soft_requests")):
        if request_group is None:
            continue
        if not isinstance(request_group, dict):
            raise ValueError(f"{label} must be a dictionary")

        for nurse_id, req_list in request_group.items():
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
                normalized_shift = _normalize_shift_name(shift_name)
                if normalized_shift not in valid_request_shifts and normalized_shift not in non_working_shift_codes:
                    raise ValueError(
                        f"Invalid shift name '{shift_name}' in request for nurse {nurse_id}. "
                        f"Must be one of {valid_request_shifts} or a configured non-working shift code"
                    )
