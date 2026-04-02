"""
cp_sat_algo_v2.py — Nurse Rostering Algorithm V2

Optimises rank A (RN) and B (EN) nurses using OR-Tools CP-SAT with:
  - Ratio-based shift targets that generalise across ward sizes
  - Strict DO constraints (exactly 2 per 7-day week, 4 per roster)
  - N-N night pair enforcement (no isolated single nights)
  - Post-N-N mandatory DO
  - Previous-roster carry-over (if prev last shift was NIGHT → day 0 = DO)

Rank C (HCA) nurses receive a simple even AM/PM distribution (no optimisation).

Hard constraints:
  HC1: Exactly one shift per day per nurse
  HC2: AL/leave days pinned to AL
  HC3: Exactly 2 DOs per 7-day week (= 4 total per 14-day roster)
       No other non-working shifts assigned without a leave request
  HC4: 2 ≤ NIGHT count ≤ 4 per nurse per roster (relaxed to 0 if leave-heavy)
  HC5: No isolated nights — every NIGHT must be adjacent to another NIGHT
  HC6: Max 2 consecutive nights
  HC7: After N-N block, next day is DO (or AL)
  HC8: Previous-roster carry-over: if prev last = NIGHT → day 0 = DO
  HC9: Approved hard requests honoured (conflicts logged, not silently dropped)

Soft constraints (penalty weights in priority order):
  S1: Ratio-based shift targets       W = 200 000
  S2: Min rank-A nurses per night     W = 100 000  (breakable)
  S3: Soft shift requests             W =   1 000
  S4: Daily working-count smoothing   W =      50

Output DO mapping: chronological DOs mapped to DO / RD / DO / RD (alternating).
"""
from __future__ import annotations

import os
from typing import Any

try:
    from ortools.sat.python import cp_model
except ModuleNotFoundError:
    cp_model = None  # type: ignore[assignment]

# ── Internal shift codes ──────────────────────────────────────────────────────
AM = 0
PM = 1
NIGHT = 2
DO = 3      # non-working day; output alternates as DO / RD / DO / RD
AL = 4      # leave (AL, HOL, MC, …)
NUM_SHIFTS = 5
WORK_SHIFTS = (AM, PM, NIGHT)

SHIFT_LABEL: dict[int, str] = {AM: "AM", PM: "PM", NIGHT: "NIGHT", DO: "DO", AL: "AL"}

_LEAVE_CODES: frozenset[str] = frozenset({
    "AL", "HOL", "MC", "URG", "CL", "UPL", "PH",
    "BCL", "CCL", "ML", "EML", "MAR",
})

_STR_TO_CODE: dict[str, int] = {
    "AM": AM,   "A":  AM,
    "PM": PM,   "P":  PM,
    "NIGHT": NIGHT, "N": NIGHT,
    "OFF": DO,  "DO": DO,  "RD": DO,
    "AL":  AL,
}

# ── Penalty weights ───────────────────────────────────────────────────────────
W_RATIO    = 200_000   # S1: ratio-based shift targets
W_RN_NIGHT = 100_000   # S2: min rank-A per night per day
W_SOFT_REQ =   1_000   # S3: soft shift requests
W_BALANCE  =      50   # S4: daily working-count smoothing


# ── Helpers ───────────────────────────────────────────────────────────────────

def _coerce_int(val: Any, default: int = 0) -> int:
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def _report_progress(progress_callback, step: int, total_steps: int, best_score: float) -> None:
    """Match the existing backend progress callback contract."""
    if progress_callback:
        progress_callback(step, total_steps, best_score)


def _to_code(raw: str, non_working: set[str]) -> int | None:
    """Convert a raw shift string to an internal code, or None if unrecognised."""
    norm = str(raw).strip().upper()
    if norm in _STR_TO_CODE:
        return _STR_TO_CODE[norm]
    if norm in _LEAVE_CODES or norm in non_working:
        return AL
    return None


# ── Rank C simple pre-assignment ──────────────────────────────────────────────

def _assign_rank_c(
    c_nurses: list[dict],
    al_days_per_nurse: dict[Any, set[int]],
    num_days: int,
) -> list[dict]:
    """
    Pre-assign rank-C nurses outside the CP-SAT model:
      1. AL on leave days
      2. 2 DOs per 7-day week (prefer end-of-week positions)
      3. Remaining days: alternate AM / PM evenly
    """
    results: list[dict] = []
    for nurse in c_nurses:
        nid = nurse["id"]
        al_days = al_days_per_nurse.get(nid, set())
        sched: list[str | None] = [None] * num_days

        # Pin leave days
        for d in al_days:
            if 0 <= d < num_days:
                sched[d] = "AL"

        # Assign 2 DOs per week; prefer positions 5,6 (Sat/Sun equivalent)
        for week_start in (0, 7):
            preferred = [
                week_start + 6, week_start + 5,
                week_start + 4, week_start + 3,
                week_start + 2, week_start + 1,
                week_start,
            ]
            dos_assigned = 0
            for d in preferred:
                if 0 <= d < num_days and sched[d] is None:
                    sched[d] = "DO"
                    dos_assigned += 1
                    if dos_assigned == 2:
                        break

        # Fill remaining with alternating AM / PM
        work_idx = 0
        for d in range(num_days):
            if sched[d] is None:
                sched[d] = "AM" if work_idx % 2 == 0 else "PM"
                work_idx += 1

        # Build DO/RD alternation for output
        do_counter = 0
        mapped: list[str] = []
        for s in sched:
            if s == "DO":
                mapped.append("DO" if do_counter % 2 == 0 else "RD")
                do_counter += 1
            else:
                mapped.append(s or "AM")

        am_ct    = mapped.count("AM")
        pm_ct    = mapped.count("PM")
        do_ct    = mapped.count("DO") + mapped.count("RD")
        al_ct    = mapped.count("AL")
        total    = am_ct + pm_ct  # nights = 0 for rank C

        results.append({
            "id":   nid,
            "name": nurse["name"],
            "rank": "C",
            "schedule": mapped,
            "stats": {
                "total_shifts": total,
                "am_shifts":    am_ct,
                "pm_shifts":    pm_ct,
                "night_shifts": 0,
                "days_off":     do_ct,
            },
        })
    return results


# ── Ratio target computation ───────────────────────────────────────────────────

def _compute_ratio_targets(
    shifts: list[dict],
    ab_nurses: list[dict],
    al_days_per_nurse: dict[Any, set[int]],
    num_days: int,
) -> dict[tuple[int, int], dict[str, int]]:
    """
    Compute soft integer targets for rank-A and rank-B nurses per (day, shift).

    Approach:
      working_frac = (num_days - 4) / num_days   # 4 DOs in 14-day roster ≈ 0.714
      w_s[d]   = demand_AB[d,s] / total_AB[d]    # fraction of workers on shift s
      r_A_s[d] = demand_A[d,s]  / demand_AB[d,s] # A-fraction within shift s

      tgt_A[d,s] = round(avail_A[d] * working_frac * w_s[d] * r_A_s[d])
      tgt_B[d,s] = round(avail_B[d] * working_frac * w_s[d] * (1 − r_A_s[d]))

    This formula scales automatically with the number of available nurses,
    generalising the targets across wards of any size or rank composition.
    """
    rank_a_ids = {n["id"] for n in ab_nurses if n["rank"] == "A"}
    rank_b_ids = {n["id"] for n in ab_nurses if n["rank"] == "B"}
    working_frac = (num_days - 4) / num_days  # ≈ 10/14

    targets: dict[tuple[int, int], dict[str, int]] = {}
    for d in range(num_days):
        day_req = shifts[d] if d < len(shifts) else shifts[-1]

        # Compute per-shift A+B demand and ratios
        demands: dict[int, dict[str, float]] = {}
        total_ab = 0.0
        for s_name, s_code in (("AM", AM), ("PM", PM), ("NIGHT", NIGHT)):
            req = day_req.get(s_name, {}) or {}
            a_dem = float(_coerce_int(req.get("A", 0)))
            b_dem = float(_coerce_int(req.get("B", 0)))
            ab_dem = a_dem + b_dem
            demands[s_code] = {"a": a_dem, "b": b_dem, "ab": ab_dem}
            total_ab += ab_dem

        if total_ab == 0.0:
            total_ab = 3.0  # avoid div/0; uniform distribution fallback

        # Available nurses not on AL on this day
        avail_a = sum(
            1 for nid in rank_a_ids
            if d not in al_days_per_nurse.get(nid, set())
        )
        avail_b = sum(
            1 for nid in rank_b_ids
            if d not in al_days_per_nurse.get(nid, set())
        )

        for s_code in (AM, PM, NIGHT):
            ab_d = demands[s_code]["ab"]
            if ab_d > 0:
                w_s  = ab_d / total_ab
                r_a  = demands[s_code]["a"] / ab_d
            else:
                w_s  = 1.0 / 3.0
                r_a  = 0.5

            tgt_a = round(avail_a * working_frac * w_s * r_a)
            tgt_b = round(avail_b * working_frac * w_s * (1.0 - r_a))
            targets[(d, s_code)] = {"A": tgt_a, "B": tgt_b}

    return targets


# ── Greedy warm-start builder ─────────────────────────────────────────────────

def _build_greedy_hints(
    ab_nurses: list[dict],
    al_days_per_nurse: dict[Any, set[int]],
    prev_last_night: set[Any],
    num_days: int,
    ratio_targets: dict[tuple[int, int], dict[str, int]],
) -> dict[tuple[int, int], int]:
    """
    Build a greedy feasible-ish initial schedule used as CP-SAT warm-start hints.
    Returns {(nurse_index, day): shift_code}.
    """
    n = len(ab_nurses)
    hint: dict[tuple[int, int], int] = {}

    # Step 1: Pin AL days and carry-over DOs
    for ni, nurse in enumerate(ab_nurses):
        nid = nurse["id"]
        for d in al_days_per_nurse.get(nid, set()):
            if 0 <= d < num_days:
                hint[ni, d] = AL
        if nid in prev_last_night:
            hint[ni, 0] = DO

    # Step 2: Assign N-N blocks round-robin (each nurse gets up to 2 pairs = 4 nights)
    night_count = [0] * n
    for pair_round in range(2):
        # Alternate week for each round
        search_start = 0 if pair_round == 0 else 7
        search_end   = 7 if pair_round == 0 else num_days
        for ni, nurse in enumerate(ab_nurses):
            nid = nurse["id"]
            if len(al_days_per_nurse.get(nid, set())) >= num_days:
                continue  # full-AL nurse — skip
            if night_count[ni] >= 4:
                continue
            for start_d in range(search_start, min(search_end, num_days - 1)):
                d2 = start_d + 1
                if hint.get((ni, start_d)) is None and hint.get((ni, d2)) is None:
                    # Check post-night slot availability
                    d3 = d2 + 1
                    post_ok = d3 >= num_days or hint.get((ni, d3)) is None
                    if post_ok:
                        hint[ni, start_d] = NIGHT
                        hint[ni, d2]      = NIGHT
                        night_count[ni]  += 2
                        if d3 < num_days:
                            hint[ni, d3] = DO
                        break

    # Step 3: Fill remaining 2 DOs per week (prefer end-of-week)
    for ni, nurse in enumerate(ab_nurses):
        nid = nurse["id"]
        for week_start in (0, 7):
            week_end = min(week_start + 7, num_days)
            existing = sum(
                1 for d in range(week_start, week_end)
                if hint.get((ni, d)) == DO
            )
            needed = 2 - existing
            for d in range(week_end - 1, week_start - 1, -1):
                if needed <= 0:
                    break
                if hint.get((ni, d)) is None:
                    hint[ni, d] = DO
                    needed -= 1

    # Step 4: Fill remaining days with AM/PM based on ratio deficits
    is_rank_a = [ab_nurses[ni]["rank"] == "A" for ni in range(n)]
    for ni in range(n):
        for d in range(num_days):
            if hint.get((ni, d)) is not None:
                continue
            best_s    = AM
            best_def  = float("-inf")
            for s_code in (AM, PM):
                tgt = ratio_targets.get((d, s_code), {"A": 1, "B": 1})
                t   = tgt["A"] if is_rank_a[ni] else tgt["B"]
                already = sum(
                    1 for ni2 in range(n)
                    if hint.get((ni2, d)) == s_code
                    and is_rank_a[ni2] == is_rank_a[ni]
                )
                deficit = t - already
                if deficit > best_def:
                    best_def = deficit
                    best_s   = s_code
            hint[ni, d] = best_s

    return hint


# ── Infeasibility pre-checker ─────────────────────────────────────────────────

def _check_feasibility(
    ab_nurses: list[dict],
    hard_ab: dict[Any, list[tuple[int, int]]],
    al_days_per_nurse: dict[Any, set[int]],
    prev_last_night: set[Any],
    num_days: int,
) -> list[str]:
    """
    Detect obvious hard-request conflicts before model construction.
    Returns a list of human-readable warning strings.
    """
    warnings: list[str] = []
    for nurse in ab_nurses:
        nid  = nurse["id"]
        name = nurse["name"]
        reqs = hard_ab.get(nid, [])
        al   = al_days_per_nurse.get(nid, set())
        req_days_shifts = {d: s for d, s in reqs}

        for day, shift_code in reqs:
            # Leave conflict
            if day in al and shift_code not in (AL,):
                warnings.append(
                    f"Nurse '{name}': hard request {SHIFT_LABEL.get(shift_code, '?')} "
                    f"on day {day} conflicts with leave — leave takes priority"
                )

            # Carry-over post-night conflict
            if nid in prev_last_night and day == 0 and shift_code not in (DO, AL):
                warnings.append(
                    f"Nurse '{name}': hard request {SHIFT_LABEL.get(shift_code, '?')} "
                    f"on day 0 overridden — post-night DO required "
                    f"(previous roster ended with NIGHT)"
                )

            # Isolated-night check
            if shift_code == NIGHT:
                prev_d_is_night = (
                    (day > 0 and req_days_shifts.get(day - 1) == NIGHT)
                    or (day == 1 and nid in prev_last_night)
                )
                next_d_is_night = req_days_shifts.get(day + 1) == NIGHT
                next_d_is_al    = (day + 1) in al
                prev_d_is_al    = (day - 1) in al if day > 0 else False

                if not prev_d_is_night and not next_d_is_night:
                    if (next_d_is_al or day + 1 >= num_days) and (prev_d_is_al or day == 0):
                        warnings.append(
                            f"Nurse '{name}': hard request NIGHT on day {day} "
                            f"cannot be paired — adjacent days are leave or boundary"
                        )

    return warnings


def _should_skip_hard_request(
    nurse_id: Any,
    day: int,
    shift_code: int,
    request_days: dict[int, int],
    al_days: set[int],
    prev_last_night: set[Any],
    num_days: int,
) -> bool:
    """Return True when a hard request is clearly incompatible with V2 hard rules."""
    if shift_code == AL:
        return False

    if day in al_days:
        return True

    if nurse_id in prev_last_night and day == 0 and shift_code != DO:
        return True

    if shift_code != NIGHT:
        return False

    prev_req_night = day > 0 and request_days.get(day - 1) == NIGHT
    next_req_night = request_days.get(day + 1) == NIGHT
    prev_al = day > 0 and (day - 1) in al_days
    next_al = (day + 1) in al_days

    if day == 0:
        return not next_req_night and (next_al or day + 1 >= num_days)

    if day == num_days - 1:
        return not prev_req_night

    if prev_req_night or next_req_night:
        return False

    return prev_al and next_al


# ── Main pipeline ─────────────────────────────────────────────────────────────

def run_v2_pipeline(
    nurses: list[dict],
    shifts: list[dict],
    hard_requests: dict | None = None,
    soft_requests: dict | None = None,
    prev_last_shift: dict | None = None,
    non_working_shift_codes: set | None = None,
    shift_hours: dict | None = None,
    milp_config: dict | None = None,
    progress_callback=None,
    min_rn_night: int = 2,
    num_days: int = 14,
    time_limit_s: float = 120.0,
    **kwargs,
) -> dict:
    """
    CP-SAT V2 nurse rostering pipeline.

    Parameters
    ----------
    nurses : list[dict]
        Each dict: {"id": ..., "name": str, "rank": "A"|"B"|"C"}
    shifts : list[dict]
        14-element list; each: {"AM": {"A": int, "B": int}, "PM": {...}, "NIGHT": {...}}
    hard_requests : dict, optional
        {nurse_id: [(day_idx, shift_code_str), ...]} — approved requests
    soft_requests : dict, optional
        {nurse_id: [(day_idx, shift_code_str), ...]} — pending requests
    prev_last_shift : dict, optional
        {nurse_id: shift_code_str} — last shift of previous roster period
    min_rn_night : int
        Soft minimum rank-A nurses on NIGHT per day (default 2, breakable)
    num_days : int
        Roster length (default 14)
    time_limit_s : float
        CP-SAT time budget in seconds (default 120)

    Returns
    -------
    dict matching the standard roster output format with an extra
    metadata["infeasibility_warnings"] list.
    """
    if cp_model is None:
        raise RuntimeError(
            "cp_sat_algo_v2 requires ortools. "
            "Install it with: pip install ortools"
        )

    hard_requests    = hard_requests    or {}
    soft_requests    = soft_requests    or {}
    prev_last_shift  = prev_last_shift  or {}
    non_working: set[str] = {str(c).upper() for c in (non_working_shift_codes or set())}

    # ── Split by rank ─────────────────────────────────────────────────────────
    ab_nurses = [n for n in nurses if n["rank"] in ("A", "B")]
    c_nurses  = [n for n in nurses if n["rank"] == "C"]

    # ── Parse AL days for every nurse ─────────────────────────────────────────
    al_days_per_nurse: dict[Any, set[int]] = {}
    for nurse in nurses:
        nid = nurse["id"]
        al_set: set[int] = set()
        for day, raw in hard_requests.get(nid, []):
            code = _to_code(raw, non_working)
            if code == AL:
                al_set.add(day)
        al_days_per_nurse[nid] = al_set

    full_al: dict[Any, bool] = {
        n["id"]: len(al_days_per_nurse[n["id"]]) >= num_days
        for n in nurses
    }

    # ── Carry-over: identify nurses whose previous last shift was NIGHT ───────
    prev_last_night: set[Any] = {
        nid for nid, raw in prev_last_shift.items()
        if str(raw).strip().upper() in ("NIGHT", "N")
    }

    # ── Rank C pre-assignment (outside CP-SAT model) ──────────────────────────
    c_results = _assign_rank_c(c_nurses, al_days_per_nurse, num_days)

    if not ab_nurses:
        return _format_output([], ab_nurses, c_results, num_days, 0.0, "optimal", [])

    # ── Ratio targets ─────────────────────────────────────────────────────────
    ratio_targets = _compute_ratio_targets(shifts, ab_nurses, al_days_per_nurse, num_days)

    # ── Parse requests as internal codes for A/B nurses ───────────────────────
    hard_ab: dict[Any, list[tuple[int, int]]] = {}
    for nurse in ab_nurses:
        nid = nurse["id"]
        parsed = []
        for day, raw in hard_requests.get(nid, []):
            code = _to_code(raw, non_working)
            if code is not None:
                parsed.append((day, code))
        hard_ab[nid] = parsed

    soft_ab: dict[Any, list[tuple[int, int]]] = {}
    for nurse in ab_nurses:
        nid = nurse["id"]
        parsed = []
        for day, raw in soft_requests.get(nid, []):
            code = _to_code(raw, non_working)
            if code is not None:
                parsed.append((day, code))
        soft_ab[nid] = parsed

    # ── Infeasibility pre-check ───────────────────────────────────────────────
    warnings: list[str] = _check_feasibility(
        ab_nurses, hard_ab, al_days_per_nurse, prev_last_night, num_days
    )

    _report_progress(progress_callback, 1, 4, float("inf"))

    # ── Build model ───────────────────────────────────────────────────────────
    model = cp_model.CpModel()
    n_ab = len(ab_nurses)

    # x[ni, d, s] ∈ {0, 1}
    x: dict[tuple[int, int, int], Any] = {
        (ni, d, s): model.NewBoolVar(f"x_{ni}_{d}_{s}")
        for ni in range(n_ab)
        for d in range(num_days)
        for s in range(NUM_SHIFTS)
    }

    # ── HC1: Exactly one shift per day ────────────────────────────────────────
    for ni in range(n_ab):
        for d in range(num_days):
            model.AddExactlyOne([x[ni, d, s] for s in range(NUM_SHIFTS)])

    # ── HC2: AL pinning ───────────────────────────────────────────────────────
    for ni, nurse in enumerate(ab_nurses):
        for d in al_days_per_nurse.get(nurse["id"], set()):
            if 0 <= d < num_days:
                model.Add(x[ni, d, AL] == 1)

    # ── HC3: Exactly 2 DOs per 7-day week ────────────────────────────────────
    for ni, nurse in enumerate(ab_nurses):
        nid = nurse["id"]
        if full_al[nid]:
            continue
        al_set = al_days_per_nurse.get(nid, set())
        for week_start in (0, 7):
            week_end = min(week_start + 7, num_days)
            al_in_week = sum(1 for d in range(week_start, week_end) if d in al_set)
            free_days  = (week_end - week_start) - al_in_week
            dos_needed = min(2, max(0, free_days))
            model.Add(
                sum(x[ni, d, DO] for d in range(week_start, week_end)) == dos_needed
            )

    # ── HC4: Night range 2–4 per roster ──────────────────────────────────────
    for ni, nurse in enumerate(ab_nurses):
        nid = nurse["id"]
        if full_al[nid]:
            continue
        al_count = len(al_days_per_nurse.get(nid, set()))
        # Approximate free non-AL, non-DO days available for nights
        approx_available = max(0, num_days - al_count - 4)

        night_sum = sum(x[ni, d, NIGHT] for d in range(num_days))
        if approx_available >= 2:
            model.Add(night_sum >= 2)
        else:
            warnings.append(
                f"Nurse '{nurse['name']}': too many leave days "
                f"to guarantee ≥2 nights — minimum relaxed to 0"
            )
        model.Add(night_sum <= 4)

    # ── HC5: No isolated nights (N-N pairs only) ──────────────────────────────
    for ni, nurse in enumerate(ab_nurses):
        nid = nurse["id"]
        al_set = al_days_per_nurse.get(nid, set())
        is_prev_night = nid in prev_last_night  # carry-over handled by HC8

        for d in range(num_days):
            if d in al_set:
                continue  # AL day — no NIGHT possible (already pinned)

            prev_ok   = d > 0 and (d - 1) not in al_set
            next_ok   = d < num_days - 1 and (d + 1) not in al_set

            if d == 0:
                if is_prev_night:
                    # Day 0 forced to DO by HC8; no night constraint needed
                    pass
                elif next_ok:
                    model.Add(x[ni, 0, NIGHT] <= x[ni, 1, NIGHT])
                else:
                    model.Add(x[ni, 0, NIGHT] == 0)
            elif d == num_days - 1:
                if prev_ok:
                    model.Add(x[ni, d, NIGHT] <= x[ni, d - 1, NIGHT])
                else:
                    model.Add(x[ni, d, NIGHT] == 0)
            else:
                lhs_terms = []
                if prev_ok:
                    lhs_terms.append(x[ni, d - 1, NIGHT])
                if next_ok:
                    lhs_terms.append(x[ni, d + 1, NIGHT])
                if lhs_terms:
                    model.Add(x[ni, d, NIGHT] <= sum(lhs_terms))
                else:
                    model.Add(x[ni, d, NIGHT] == 0)

    # ── HC6: Max 2 consecutive nights ────────────────────────────────────────
    for ni in range(n_ab):
        for d in range(num_days - 2):
            model.Add(
                x[ni, d, NIGHT] + x[ni, d + 1, NIGHT] + x[ni, d + 2, NIGHT] <= 2
            )

    # ── HC7: Post-N-N mandatory DO (or AL) ───────────────────────────────────
    for ni in range(n_ab):
        for d in range(num_days - 2):
            # x[d,N] + x[d+1,N] - 1  ≤  x[d+2,DO] + x[d+2,AL]
            model.Add(
                x[ni, d, NIGHT] + x[ni, d + 1, NIGHT] - 1
                <= x[ni, d + 2, DO] + x[ni, d + 2, AL]
            )
        # N-N on days 12-13: post-DO falls in next period (flagged in metadata)

    # ── HC8: Carry-over — prev NIGHT → day 0 must be DO ──────────────────────
    for ni, nurse in enumerate(ab_nurses):
        nid = nurse["id"]
        if nid in prev_last_night and 0 not in al_days_per_nurse.get(nid, set()):
            model.Add(x[ni, 0, DO] == 1)

    # ── HC9: Approved hard requests ───────────────────────────────────────────
    for ni, nurse in enumerate(ab_nurses):
        nid  = nurse["id"]
        al_s = al_days_per_nurse.get(nid, set())
        request_days = {day: code for day, code in hard_ab.get(nid, [])}
        for day, shift_code in hard_ab.get(nid, []):
            if shift_code == AL:
                continue          # already handled by HC2
            if _should_skip_hard_request(
                nid, day, shift_code, request_days, al_s, prev_last_night, num_days
            ):
                continue
            model.Add(x[ni, day, shift_code] == 1)

    # ── Penalty terms ─────────────────────────────────────────────────────────
    penalty_terms: list[Any] = []
    rank_a_idx = [ni for ni, n in enumerate(ab_nurses) if n["rank"] == "A"]
    rank_b_idx = [ni for ni, n in enumerate(ab_nurses) if n["rank"] == "B"]
    n_a = max(len(rank_a_idx), 1)
    n_b = max(len(rank_b_idx), 1)

    # ── S1: Ratio-based shift targets ─────────────────────────────────────────
    for d in range(num_days):
        for s_code in (AM, PM, NIGHT):
            tgt = ratio_targets.get((d, s_code), {"A": 0, "B": 0})

            # Rank A deviation
            if rank_a_idx:
                cnt_a = model.NewIntVar(0, n_a, f"cnt_a_{d}_{s_code}")
                model.Add(cnt_a == sum(x[ni, d, s_code] for ni in rank_a_idx))
                dev_a_up = model.NewIntVar(0, n_a, f"dau_{d}_{s_code}")
                dev_a_dn = model.NewIntVar(0, n_a, f"dad_{d}_{s_code}")
                model.Add(cnt_a - tgt["A"] == dev_a_up - dev_a_dn)
                penalty_terms += [W_RATIO * dev_a_up, W_RATIO * dev_a_dn]

            # Rank B deviation
            if rank_b_idx:
                cnt_b = model.NewIntVar(0, n_b, f"cnt_b_{d}_{s_code}")
                model.Add(cnt_b == sum(x[ni, d, s_code] for ni in rank_b_idx))
                dev_b_up = model.NewIntVar(0, n_b, f"dbu_{d}_{s_code}")
                dev_b_dn = model.NewIntVar(0, n_b, f"dbd_{d}_{s_code}")
                model.Add(cnt_b - tgt["B"] == dev_b_up - dev_b_dn)
                penalty_terms += [W_RATIO * dev_b_up, W_RATIO * dev_b_dn]

    # ── S2: Min rank-A per night (soft, breakable) ────────────────────────────
    for d in range(num_days):
        if rank_a_idx:
            rn_night = model.NewIntVar(0, n_a, f"rn_night_{d}")
            model.Add(rn_night == sum(x[ni, d, NIGHT] for ni in rank_a_idx))
            shortfall = model.NewIntVar(0, min_rn_night, f"rn_short_{d}")
            model.Add(shortfall >= min_rn_night - rn_night)
            model.Add(shortfall >= 0)
            penalty_terms.append(W_RN_NIGHT * shortfall)

    # ── S3: Soft shift requests ───────────────────────────────────────────────
    for ni, nurse in enumerate(ab_nurses):
        nid = nurse["id"]
        for day, shift_code in soft_ab.get(nid, []):
            not_met = model.NewBoolVar(f"soft_miss_{ni}_{day}_{shift_code}")
            model.Add(not_met + x[ni, day, shift_code] == 1)
            penalty_terms.append(W_SOFT_REQ * not_met)

    # ── S4: Daily working-count smoothing ─────────────────────────────────────
    daily_wk: list[Any] = []
    for d in range(num_days):
        dw = model.NewIntVar(0, n_ab, f"dw_{d}")
        model.Add(dw == sum(x[ni, d, s] for ni in range(n_ab) for s in WORK_SHIFTS))
        daily_wk.append(dw)
    for d in range(1, num_days):
        diff     = model.NewIntVar(-n_ab, n_ab, f"diff_{d}")
        abs_diff = model.NewIntVar(0,    n_ab, f"adiff_{d}")
        model.Add(diff == daily_wk[d] - daily_wk[d - 1])
        model.AddAbsEquality(abs_diff, diff)
        penalty_terms.append(W_BALANCE * abs_diff)

    # ── Objective ─────────────────────────────────────────────────────────────
    # Upper-bound estimate to size the IntVar
    ub = (
        W_RATIO    * 2 * (n_a + n_b) * num_days * 3
        + W_RN_NIGHT * min_rn_night * num_days
        + W_SOFT_REQ * n_ab * num_days
        + W_BALANCE  * n_ab * num_days
        + 1
    )
    total_penalty = model.NewIntVar(0, ub, "total_penalty")
    model.Add(total_penalty == sum(penalty_terms))
    model.Minimize(total_penalty)

    # ── Greedy warm-start hints ───────────────────────────────────────────────
    hints = _build_greedy_hints(
        ab_nurses, al_days_per_nurse, prev_last_night, num_days, ratio_targets
    )
    for (ni, d), s_code in hints.items():
        for s in range(NUM_SHIFTS):
            model.AddHint(x[ni, d, s], 1 if s == s_code else 0)

    # ── Solve ─────────────────────────────────────────────────────────────────
    search_branching = getattr(
        cp_model,
        "PORTFOLIO_WITH_QUICK_RESTART",
        getattr(cp_model, "PORTFOLIO_WITH_QUICK_RESTART_SEARCH", None),
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds       = time_limit_s
    solver.parameters.num_workers               = max(1, (os.cpu_count() or 2) - 1)
    solver.parameters.linearization_level       = 1
    if search_branching is not None:
        solver.parameters.search_branching = search_branching
    solver.parameters.log_search_progress       = False

    _report_progress(progress_callback, 2, 4, float("inf"))

    status      = solver.Solve(model)
    status_name = solver.StatusName(status)
    status_slug = {
        "OPTIMAL": "optimal",
        "FEASIBLE": "feasible",
        "INFEASIBLE": "infeasible",
    }.get(status_name, status_name.lower())

    feasible = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
    penalty_score = float(solver.ObjectiveValue()) if feasible else float("inf")
    _report_progress(progress_callback, 3, 4, penalty_score)

    # ── Extract schedules ─────────────────────────────────────────────────────
    ab_schedules: list[list[int]] = []
    if feasible:
        for ni in range(n_ab):
            sched: list[int] = []
            for d in range(num_days):
                assigned = DO  # fallback
                for s in range(NUM_SHIFTS):
                    if solver.Value(x[ni, d, s]):
                        assigned = s
                        break
                sched.append(assigned)
            ab_schedules.append(sched)
    else:
        warnings.append(
            f"CP-SAT returned {status_name} — using greedy fallback schedule"
        )
        for ni in range(n_ab):
            sched = [hints.get((ni, d), AM) for d in range(num_days)]
            ab_schedules.append(sched)

    for ni, nurse in enumerate(ab_nurses):
        sched = ab_schedules[ni]
        if num_days >= 2 and sched[num_days - 2] == NIGHT and sched[num_days - 1] == NIGHT:
            warnings.append(
                f"Nurse '{nurse['name']}': final N-N pair spills mandatory post-night DO into next roster"
            )

    _report_progress(progress_callback, 4, 4, penalty_score)

    return _format_output(
        ab_schedules, ab_nurses, c_results,
        num_days, penalty_score, status_slug, warnings
    )


# ── Output formatter ──────────────────────────────────────────────────────────

def _format_output(
    ab_schedules: list[list[int]],
    ab_nurses: list[dict],
    c_results: list[dict],
    num_days: int,
    penalty_score: float,
    status_name: str,
    infeasibility_warnings: list[str],
) -> dict:
    """Build the standard roster output dict."""
    nurse_rows: list[dict] = []

    for ni, nurse in enumerate(ab_nurses):
        raw = ab_schedules[ni]

        # Map DO codes → alternating "DO" / "RD"
        do_counter = 0
        mapped: list[str] = []
        for code in raw:
            if code == DO:
                mapped.append("DO" if do_counter % 2 == 0 else "RD")
                do_counter += 1
            else:
                mapped.append(SHIFT_LABEL[code])

        am_ct    = raw.count(AM)
        pm_ct    = raw.count(PM)
        night_ct = raw.count(NIGHT)
        do_ct    = raw.count(DO)

        nurse_rows.append({
            "id":   nurse["id"],
            "name": nurse["name"],
            "rank": nurse["rank"],
            "schedule": mapped,
            "stats": {
                "total_shifts": am_ct + pm_ct + night_ct,
                "am_shifts":    am_ct,
                "pm_shifts":    pm_ct,
                "night_shifts": night_ct,
                "days_off":     do_ct,
            },
        })

    nurse_rows.extend(c_results)

    return {
        "nurses": nurse_rows,
        "metadata": {
            "num_days":               num_days,
            "num_nurses":             len(nurse_rows),
            "algorithm":              "CP-SAT-V2",
            "solver_status":          status_name,
            "penalty_score":          penalty_score,
            "infeasibility_warnings": infeasibility_warnings,
        },
    }
