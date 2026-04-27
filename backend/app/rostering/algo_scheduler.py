# this is the algorithm scheduler
from app.rostering.milp_algo import run_milp_pipeline, MILPError


def _run_ab_ratio_pipeline(*args, **kwargs):
    """
    Import the A/B ratio pipeline lazily so the backend can start even when
    optional solver dependencies are not installed.
    """
    try:
        from app.rostering.ab_ratio_algo import run_ab_ratio_pipeline
    except ModuleNotFoundError as exc:
        if exc.name == "ortools":
            raise RuntimeError(
                "AB-RATIO requires the optional 'ortools' dependency, "
                "but it is not installed in this environment."
            ) from exc
        raise
    return run_ab_ratio_pipeline(*args, **kwargs)


def _run_twelve_hour_pipeline(*args, **kwargs):
    """
    Temporary 12-hour pipeline hook.

    The scheduler now separates 8-hour and 12-hour parsing first. This runner
    remains as the current execution path for 12-hour wards until dedicated
    12-hour MILP / AB-RATIO implementations are introduced.
    """
    try:
        from app.rostering.twelve_hour_algo import run_twelve_hour_pipeline
    except ModuleNotFoundError as exc:
        if exc.name == "ortools":
            raise RuntimeError(
                "12HR rostering requires the optional 'ortools' dependency, "
                "but it is not installed in this environment."
            ) from exc
        raise
    return run_twelve_hour_pipeline(*args, **kwargs)


EIGHT_HOUR_WARD_TYPES = {"8_HOURS", "8HR", "8_HR", "8-HOUR", "8_HOUR"}
TWELVE_HOUR_WARD_TYPES = {"12_HOURS", "12HR", "12_HR", "12-HOUR", "12_HOUR"}
TWELVE_HOUR_ALGORITHM_ALIASES = {"12H", "12HR", "12-HR", "TWELVE_HOUR", "TWELVE-HOUR"}
TWELVE_HOUR_SHIFT_ALIASES = {"A-12", "A12", "A_12", "N-12", "N12", "N_12"}


def _normalize_algorithm_name(algorithm):
    forced = str(algorithm).strip().upper() if algorithm else None
    if forced in {"AB_RATIO", "ABRATIO"}:
        return "AB-RATIO"
    if forced in TWELVE_HOUR_ALGORITHM_ALIASES:
        return "12HR"
    return forced


def _resolve_ward_mode(ward_hour_type=None, algorithm=None):
    forced = _normalize_algorithm_name(algorithm)
    if forced == "12HR":
        return "12HR"
    if forced in {"MILP", "AB-RATIO"}:
        return "8HR"

    normalized = str(ward_hour_type or "").strip().upper()
    if normalized in TWELVE_HOUR_WARD_TYPES:
        return "12HR"
    if normalized in EIGHT_HOUR_WARD_TYPES:
        return "8HR"
    return "8HR"


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


def _normalize_request_groups(request_groups, ward_mode="8HR"):
    if request_groups is None:
        return None

    normalized_groups = {}
    for nurse_id, req_list in request_groups.items():
        normalized_items = []
        for item in req_list:
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                normalized_items.append(item)
                continue

            if ward_mode == "12HR":
                normalized_items.append(item)
                continue

            day_idx, shift_name = item[0], item[1]
            if len(item) >= 3:
                normalized_items.append((day_idx, _normalize_shift_name(shift_name), item[2]))
            else:
                normalized_items.append((day_idx, _normalize_shift_name(shift_name)))
        normalized_groups[nurse_id] = normalized_items
    return normalized_groups


def _normalize_prev_last_shift(prev_last_shift, ward_mode="8HR"):
    if prev_last_shift is None:
        return None

    if ward_mode == "12HR":
        return dict(prev_last_shift)

    return {
        nurse_id: _normalize_shift_name(shift_name)
        for nurse_id, shift_name in prev_last_shift.items()
    }


def _prepare_inputs_for_ward_mode(
    nurses,
    shifts,
    hard_requests,
    soft_requests,
    prev_last_shift,
    non_working_shift_codes,
    ward_mode,
):
    hard_requests = _normalize_request_groups(hard_requests, ward_mode)
    soft_requests = _normalize_request_groups(soft_requests, ward_mode)
    prev_last_shift = _normalize_prev_last_shift(prev_last_shift, ward_mode)

    if ward_mode == "12HR":
        validate_12hr_inputs(
            nurses,
            shifts,
            hard_requests,
            soft_requests,
            non_working_shift_codes,
        )
    else:
        validate_inputs(
            nurses,
            shifts,
            hard_requests,
            soft_requests,
            non_working_shift_codes,
        )

    return hard_requests, soft_requests, prev_last_shift


def generate_roster(
    nurses,
    shifts,
    hard_requests=None,
    soft_requests=None,
    prev_last_shift=None,
    shift_hours=None,
    non_working_shift_codes=None,
    ward_name="DEFAULT",
    ward_hour_type=None,
    progress_callback=None,
    milp_config=None,
    algorithm=None,
):
    """
    Generate a nurse roster using the appropriate parser and algorithm route.

    Parsing is selected from the ward hour type already stored in the
    database. This keeps 8-hour and 12-hour input handling isolated so we can
    later plug in dedicated 12-hour MILP / AB-RATIO runners without reshaping
    the public scheduler API again.
    """
    forced = _normalize_algorithm_name(algorithm)
    ward_mode = _resolve_ward_mode(ward_hour_type=ward_hour_type, algorithm=forced)

    hard_requests, soft_requests, prev_last_shift = _prepare_inputs_for_ward_mode(
        nurses=nurses,
        shifts=shifts,
        hard_requests=hard_requests,
        soft_requests=soft_requests,
        prev_last_shift=prev_last_shift,
        non_working_shift_codes=non_working_shift_codes,
        ward_mode=ward_mode,
    )

    if ward_mode == "12HR":
        print("[SCHEDULER] Running 12HR pipeline")
        roster = _run_twelve_hour_pipeline(
            nurses,
            shifts,
            hard_requests=hard_requests,
            soft_requests=soft_requests,
            prev_last_shift=prev_last_shift,
            shift_hours=shift_hours,
            non_working_shift_codes=non_working_shift_codes,
            progress_callback=progress_callback,
            milp_config=milp_config,
        )
        print("[SCHEDULER] 12HR pipeline succeeded - returning result")
        return {"method": "12HR", "roster": roster}

    if forced == "AB-RATIO":
        roster = _run_ab_ratio_pipeline(
            nurses,
            shifts,
            hard_requests=hard_requests,
            soft_requests=soft_requests,
            prev_last_shift=prev_last_shift,
            non_working_shift_codes=non_working_shift_codes,
            progress_callback=progress_callback,
            shift_hours=shift_hours,
            milp_config=milp_config,
        )
        return {"method": "AB-RATIO", "roster": roster}

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
        print("[SCHEDULER] MILP succeeded - returning result")
        return {"method": "MILP", "roster": roster}

    print("[SCHEDULER] Running MILP (auto: default algorithm)")
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
        print("[SCHEDULER] MILP succeeded - returning result")
        return {"method": "MILP", "roster": roster}
    except MILPError as exc:
        print(f"[SCHEDULER] MILP infeasible ({exc}); falling back to AB-RATIO")
        roster = _run_ab_ratio_pipeline(
            nurses,
            shifts,
            hard_requests=hard_requests,
            soft_requests=soft_requests,
            prev_last_shift=prev_last_shift,
            non_working_shift_codes=non_working_shift_codes,
            progress_callback=progress_callback,
            shift_hours=shift_hours,
            milp_config=milp_config,
        )
        print("[SCHEDULER] AB-RATIO fallback succeeded - returning result")
        return {"method": "AB-RATIO", "roster": roster}


def validate_inputs(nurses, shifts, hard_requests, soft_requests, non_working_shift_codes=None):
    """
    Validate the structure and values of 8-hour ward inputs.

    Raises ValueError on any problem.
    """
    if not isinstance(nurses, list) or not nurses:
        raise ValueError("nurses must be a non-empty list")

    required_keys = {"id", "name", "rank"}
    valid_ranks = {"A", "B", "C"}
    nurse_ids = set()

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
                if not (isinstance(item, (list, tuple)) and len(item) in {2, 3}):
                    raise ValueError(
                        f"Each request must be a (day_index, shift_name) pair "
                        f"or (day_index, shift_name, priority); "
                        f"got {item!r} for nurse {nurse_id}"
                    )
                day_idx, shift_name = item[0], item[1]
                if not (0 <= day_idx < num_days):
                    raise ValueError(
                        f"Invalid day index {day_idx} for nurse {nurse_id} "
                        f"(must be 0-{num_days - 1})"
                    )
                normalized_shift = _normalize_shift_name(shift_name)
                if (
                    normalized_shift not in valid_request_shifts
                    and normalized_shift not in non_working_shift_codes
                ):
                    raise ValueError(
                        f"Invalid shift name '{shift_name}' in request for nurse {nurse_id}. "
                        f"Must be one of {valid_request_shifts} or a configured non-working shift code"
                    )


def validate_12hr_inputs(
    nurses,
    shifts,
    hard_requests,
    soft_requests,
    non_working_shift_codes=None,
):
    """
    Validate the structure and values of 12-hour ward inputs.

    Raises ValueError on any problem.
    """
    if not isinstance(nurses, list) or not nurses:
        raise ValueError("nurses must be a non-empty list")

    required_keys = {"id", "name", "rank"}
    valid_ranks = {"A", "B", "C"}
    nurse_ids = set()

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

    if not isinstance(shifts, list) or not shifts:
        raise ValueError("shifts must be a non-empty list")

    for day_idx, day_shifts in enumerate(shifts):
        if not isinstance(day_shifts, dict):
            raise ValueError(f"Day {day_idx} shifts must be a dictionary")

        for shift_name, reqs in day_shifts.items():
            normalized_shift = str(shift_name).strip().upper()
            if normalized_shift not in TWELVE_HOUR_SHIFT_ALIASES:
                raise ValueError(
                    f"Invalid shift name '{shift_name}' for 12-hour ward on day {day_idx}. "
                    f"Must be one of {TWELVE_HOUR_SHIFT_ALIASES}"
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

    num_days = len(shifts)
    valid_request_shifts = TWELVE_HOUR_SHIFT_ALIASES | {"OFF", "AL"}
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
                if not (isinstance(item, (list, tuple)) and len(item) in {2, 3}):
                    raise ValueError(
                        f"Each request must be a (day_index, shift_name) pair "
                        f"or (day_index, shift_name, priority); "
                        f"got {item!r} for nurse {nurse_id}"
                    )
                day_idx, shift_name = item[0], item[1]
                if not (0 <= day_idx < num_days):
                    raise ValueError(
                        f"Invalid day index {day_idx} for nurse {nurse_id} "
                        f"(must be 0-{num_days - 1})"
                    )
                normalized_shift = str(shift_name).strip().upper()
                if (
                    normalized_shift not in valid_request_shifts
                    and normalized_shift not in non_working_shift_codes
                ):
                    raise ValueError(
                        f"Invalid shift name '{shift_name}' in request for nurse {nurse_id}. "
                        f"Must be one of {valid_request_shifts} or a configured non-working shift code"
                    )
