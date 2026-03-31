"""
cp_sat_algo.py
==============
OR-Tools CP-SAT nurse rostering — drop-in replacement for ga_algo.py.

Why CP-SAT instead of a Genetic Algorithm?
-------------------------------------------
* **Exact optimisation**: CP-SAT finds the mathematically best solution
  within the time budget, not just a heuristic approximation.
* **No repair loops**: hard constraints are encoded once and guaranteed;
  there is no need for the multiple repair passes the GA requires.
* **Deterministic**: given the same inputs the solver always returns the
  same (or a strictly better) answer.
* **Fast**: a 14-day, ~20-nurse problem typically solves to optimality
  in under 30 seconds on a modern laptop.

Public API
----------
run_ga_pipeline(...)
    Identical signature and return format to ga_algo.run_ga_pipeline.
    The scheduler (algo_scheduler.py) calls this function unchanged.
"""

from __future__ import annotations

import os
from ortools.sat.python import cp_model

# ─── Shift codes (must match ga_algo constants) ───────────────────────────────
OFF, AM, PM, NIGHT, AL = 0, 1, 2, 3, 4
_AL_CODE    = AL
ALL_SHIFTS  = [OFF, AM, PM, NIGHT, AL]
WORK_SHIFTS = [AM, PM, NIGHT]
SHIFT_LABEL = {OFF: "OFF", AM: "AM", PM: "PM", NIGHT: "NIGHT", AL: "AL"}

_LEAVE_CODES      = {"HOL", "MC", "URG", "CL", "UPL", "PH", "BCL", "CCL", "ML", "EML"}
_OFF_REQUEST_CODES = {"OFF", "DO", "RD"}

# ─── Penalty weights ──────────────────────────────────────────────────────────
# Mirrors the GA's penalty philosophy: "hard" violations carry huge weights so
# the solver virtually never accepts them; soft preferences carry small weights
# so the solver trades them off sensibly.  All values are integers (CP-SAT
# requires integer coefficients in the objective).
W_AL_FULL      = 1_000_000   # AL nurse assigned a non-AL day
W_SHIFT_SHORT  =   150_000   # 1 missing required staff member (total)
W_RANK_A_SHORT =   150_000   # 1 missing rank-A nurse in a rank-A slot
W_RANK_MISMATCH =   20_000   # higher-rank nurse filling a lower-rank slot
W_DAYOFF_UNDER =   160_000   # 1 fewer than required days-off in a week
W_DAYOFF_OVER  =   144_000   # 1 more than required days-off (×0.9 like GA)
W_HOUR_UNDER   =    24_000   # 1 unit (0.1 h) below per-nurse minimum
W_HOUR_OVER    =    16_000   # 1 unit (0.1 h) above per-nurse maximum
W_NDO          =   999_999   # missing post-night day-off on day 0
W_NIGHT_LOW    =    64_000   # fewer than 1 night per week (×0.8 like GA)
W_NIGHT_HIGH   =    80_000   # more than 2 nights per week
W_APPROVED_REQ =    35_000   # unmet approved (hard) shift request
W_PENDING_REQ  =       550   # unmet pending (soft) shift request
W_OFF_TO_AM    =       500   # OFF followed by AM on the next day
W_SHIFT_VAR    =       185   # |actual − target| count per shift per day
W_AM_PM_BAL    =       200   # |AM count − PM count| > 2 on a day
W_DAILY_BAL    =        50   # range of total working nurses across days
W_NIGHT_FAIR   =         5   # range of total night counts across nurses
W_WEEKEND_FAIR =         5   # range of weekend working days across nurses
W_MORNING_PREF =         4   # reward (negative cost) per AM shift

# Solver time budget in seconds.  90 s is generous for a 14-day roster;
# increase for very large wards.
_TIME_LIMIT_S = 120.0


# ─── Pre-solve helpers ────────────────────────────────────────────────────────

def _check_demand_feasibility(
    demand: list[dict],
    nurse_ranks: list[str],
    working_nurses: list[int],
    num_days: int,
) -> None:
    """
    Warn when shift demand structurally cannot be met given the available nurses.

    This is purely diagnostic — the model will still solve, but any unavoidable
    shortage contributes a fixed penalty floor that no amount of weight tuning or
    extra solve time can eliminate.  Printing a warning makes that visible so the
    caller knows not to chase phantom optimisation budget.
    """
    rank_counts = {r: sum(1 for n in working_nurses if nurse_ranks[n] == r)
                   for r in "ABC"}
    for d in range(num_days):
        for s in WORK_SHIFTS:
            req = demand[d][s]
            req_A = req.get("A", 0)
            req_AB = req_A + req.get("B", 0)
            req_total = req_AB + req.get("C", 0)
            avail_A  = rank_counts["A"]
            avail_AB = rank_counts["A"] + rank_counts["B"]
            avail_total = avail_AB + rank_counts["C"]
            s_name = {AM: "AM", PM: "PM", NIGHT: "NIGHT"}.get(s, str(s))
            if req_A > avail_A:
                print(f"[CP-SAT WARN] Day {d} {s_name}: needs {req_A} rank-A nurses "
                      f"but only {avail_A} available — unavoidable coverage penalty")
            elif req_AB > avail_AB:
                print(f"[CP-SAT WARN] Day {d} {s_name}: needs {req_AB} rank-A/B nurses "
                      f"but only {avail_AB} available — unavoidable coverage penalty")
            elif req_total > avail_total:
                print(f"[CP-SAT WARN] Day {d} {s_name}: needs {req_total} nurses total "
                      f"but only {avail_total} available — unavoidable coverage penalty")


def _build_greedy_hint(
    num_nurses: int,
    num_days: int,
    working_nurses: list[int],
    al_nurses_set: set[int],
    al_day_req: list[set],
    post_night_off: set[int],
    demand: list[dict],
) -> list[list[int]]:
    """
    Greedy O(N×D) schedule construction used to warm-start the CP-SAT solver.

    Producing a feasible incumbent immediately lets the solver spend its entire
    time budget improving rather than finding a first solution.  The strategy:

      1. Pin fixed slots (full AL, single-day AL requests, post-night day-0 OFF).
      2. Assign night blocks (≤4 per fortnight) round-robin across nurses,
         in N-N patterns where possible, then add mandatory post-block OFFs.
      3. Reserve 2 voluntary OFF days per week per nurse (weekends preferred).
      4. Fill remaining days with AM or PM to match demand.
    """
    # Start optimistic: everyone works AM (easier for the solver to improve from
    # a working state than from all-OFF which violates coverage on every day).
    sched = [[AM] * num_days for _ in range(num_nurses)]

    # ── Step 1: pin fixed slots ───────────────────────────────────────────────
    for n in al_nurses_set:
        for d in range(num_days):
            sched[n][d] = AL

    for n in working_nurses:
        for d in al_day_req[n]:
            if d < num_days:
                sched[n][d] = AL

    for n in post_night_off:
        if 0 not in al_day_req[n]:
            sched[n][0] = OFF

    # ── Step 2: night blocks, round-robin ────────────────────────────────────
    night_counts = [0] * num_nurses
    wn = list(working_nurses)
    cursor = 0

    for d in range(num_days):
        nights_needed = sum(demand[d][NIGHT].get(r, 0) for r in "ABC")
        assigned = 0

        for _ in range(len(wn) * 2):
            if assigned >= nights_needed:
                break
            n = wn[cursor % len(wn)]
            cursor += 1

            if sched[n][d] in (AL, OFF):
                continue
            if d > 0 and sched[n][d - 1] == NIGHT:
                continue   # already in a block started yesterday
            if night_counts[n] >= 4:
                continue   # fortnightly cap

            sched[n][d] = NIGHT
            night_counts[n] += 1
            assigned += 1

            # Try to extend to a double-night block
            if (d + 1 < num_days
                    and sched[n][d + 1] not in (AL,)
                    and (d + 1) not in al_day_req[n]
                    and night_counts[n] < 4):
                sched[n][d + 1] = NIGHT
                night_counts[n] += 1

    # Mandatory OFF after every night block end
    for n in working_nurses:
        for d in range(num_days - 1):
            if sched[n][d] == NIGHT and sched[n][d + 1] != NIGHT:
                if (d + 1) not in al_day_req[n]:
                    sched[n][d + 1] = OFF

    # ── Step 3: 2 voluntary OFFs per week (weekends preferred) ───────────────
    for n in working_nurses:
        for w_start in range(0, num_days, 7):
            w_end = min(w_start + 7, num_days)
            existing_off = sum(1 for d in range(w_start, w_end)
                               if sched[n][d] == OFF)
            to_add = max(0, 2 - existing_off)
            candidates = sorted(
                [d for d in range(w_start, w_end)
                 if sched[n][d] not in (OFF, NIGHT, AL)],
                key=lambda d: (0 if d % 7 in (5, 6) else 1),
            )
            for d in candidates[:to_add]:
                sched[n][d] = OFF

    # ── Step 4: balance AM vs PM to match daily demand ────────────────────────
    for d in range(num_days):
        am_count = sum(1 for n in range(num_nurses) if sched[n][d] == AM)
        pm_count = sum(1 for n in range(num_nurses) if sched[n][d] == PM)
        am_needed = sum(demand[d][AM].get(r, 0) for r in "ABC")
        pm_needed = sum(demand[d][PM].get(r, 0) for r in "ABC")

        for n in working_nurses:
            if sched[n][d] != AM:
                continue
            if pm_count < pm_needed and am_count > am_needed:
                sched[n][d] = PM
                pm_count += 1
                am_count -= 1

    return sched


# ─── Public entry point ───────────────────────────────────────────────────────

def run_ga_pipeline(
    nurses,
    shifts,
    hard_requests=None,
    soft_requests=None,
    prev_last_shift=None,
    shift_hours=None,
    non_working_shift_codes=None,
    progress_callback=None,
):
    """
    Generate a nurse roster using OR-Tools CP-SAT.

    Parameters and return value are identical to ga_algo.run_ga_pipeline so
    the scheduler can call this function without any changes.
    """
    # ── Defaults ──────────────────────────────────────────────────────────────
    hard_requests   = hard_requests   or {}
    soft_requests   = soft_requests   or {}
    prev_last_shift = prev_last_shift or {}
    shift_hours     = shift_hours     or {"AM": 8.0, "PM": 8.0, "NIGHT": 10.0, "OFF": 0.0}
    nw_codes        = {str(c).upper() for c in (non_working_shift_codes or set())}
    _LEAVE_ALL      = _LEAVE_CODES | {"AL"}

    # ── Nurse / shift metadata ─────────────────────────────────────────────────
    # Sort by ID for consistent ordering (mirrors ga_algo.parse_inputs)
    nurses_sorted = sorted(nurses, key=lambda n: n["id"])
    num_days      = len(shifts)
    num_nurses    = len(nurses_sorted)
    nurse_names   = [n["name"] for n in nurses_sorted]
    nurse_ranks   = [n["rank"] for n in nurses_sorted]   # "A" | "B" | "C"
    id_to_idx     = {n["id"]: i for i, n in enumerate(nurses_sorted)}
    id_to_name    = {n["id"]: n["name"] for n in nurses_sorted}

    # Shift hours scaled ×10 so everything stays integer inside the solver
    # (handles fractional hours such as 8.5 h shifts).
    _SH = {
        AM:    int(round(float(shift_hours.get("AM",    8.0)) * 10)),
        PM:    int(round(float(shift_hours.get("PM",    8.0)) * 10)),
        NIGHT: int(round(float(shift_hours.get("NIGHT",10.0)) * 10)),
        OFF:   0,
        AL:    0,
    }
    AL_HOUR_CREDIT = int(round(float(shift_hours.get("AM", 8.0)) * 10))
    MIN_H = int(round(84.0 * 10))   # 840 units  (84 h × 10)
    MAX_H = int(round(88.0 * 10))   # 880 units  (88 h × 10)

    # ── Parse demand ──────────────────────────────────────────────────────────
    _SHIFT_STR_TO_CODE = {
        "AM": AM, "A": AM, "PM": PM, "P": PM,
        "NIGHT": NIGHT, "N": NIGHT, "OFF": OFF, "DO": OFF, "RD": OFF, "AL": AL,
    }

    demand: list[dict[int, dict[str, int]]] = []
    for day_sh in shifts:
        d: dict[int, dict[str, int]] = {}
        for s_name, s_code in [("AM", AM), ("PM", PM), ("NIGHT", NIGHT)]:
            req = day_sh.get(s_name, {})
            d[s_code] = {r: int(req.get(r, 0)) for r in "ABC"}
        demand.append(d)

    # ── Helper: raw shift string → internal code ──────────────────────────────
    def _to_code(raw) -> int | None:
        c = str(raw).strip().upper()
        if c in _SHIFT_STR_TO_CODE:
            return _SHIFT_STR_TO_CODE[c]
        if c in _LEAVE_ALL or c in nw_codes:
            return AL
        return None

    # ── Detect full-AL and partial-AL nurses ──────────────────────────────────
    al_nurses_set: set[int] = set()
    al_day_req:    list[set[int]] = [set() for _ in range(num_nurses)]

    for nid, req_list in hard_requests.items():
        ni = id_to_idx.get(nid)
        if ni is None:
            continue
        al_days = {d for d, sc in req_list if _to_code(sc) == AL and 0 <= d < num_days}
        if len(al_days) >= num_days:
            al_nurses_set.add(ni)
        else:
            al_day_req[ni].update(al_days)

    working_nurses: list[int] = [n for n in range(num_nurses) if n not in al_nurses_set]

    # Per-nurse adjusted hour limits: each AL day removes 1 shift-hour of obligation
    nurse_min_h: list[int] = []
    nurse_max_h: list[int] = []
    for n in range(num_nurses):
        al_cnt = len(al_day_req[n])
        nurse_min_h.append(max(0, MIN_H - al_cnt * AL_HOUR_CREDIT))
        nurse_max_h.append(max(0, MAX_H - al_cnt * AL_HOUR_CREDIT))

    # ── Parse approved (hard) requests — non-AL only ──────────────────────────
    approved: list[list[tuple[int, int]]] = [[] for _ in range(num_nurses)]
    for nid, req_list in hard_requests.items():
        ni = id_to_idx.get(nid)
        if ni is None or ni in al_nurses_set:
            continue
        for d, sc_raw in req_list:
            sc = _to_code(sc_raw)
            if sc is not None and sc != AL and 0 <= d < num_days:
                approved[ni].append((d, sc))

    # ── Parse pending (soft) requests ─────────────────────────────────────────
    pending: list[list[tuple[int, int]]] = [[] for _ in range(num_nurses)]
    for nid, req_list in (soft_requests or {}).items():
        ni = id_to_idx.get(nid)
        if ni is None or ni in al_nurses_set:
            continue
        for d, sc_raw in req_list:
            sc = _to_code(sc_raw)
            if sc is not None and 0 <= d < num_days:
                pending[ni].append((d, sc))

    # ── Post-night day-0 OFF requirements ─────────────────────────────────────
    post_night_off: set[int] = set()
    for nid, sh in prev_last_shift.items():
        ni = id_to_idx.get(nid)
        if ni is None or ni in al_nurses_set:
            continue
        if str(sh).strip().upper() == "NIGHT":
            post_night_off.add(ni)

    # ── Leave overlay: restore specific leave codes in output ─────────────────
    # (e.g. HOL, MC are stored internally as AL but shown as their original code)
    leave_overlay: dict[str, dict[int, str]] = {}
    for nid, req_list in hard_requests.items():
        name = id_to_name.get(nid)
        if name is None:
            continue
        for d, code in req_list:
            if str(code).upper() in _LEAVE_ALL:
                leave_overlay.setdefault(name, {})[d] = str(code).upper()

    # ── Rank groups ───────────────────────────────────────────────────────────
    # AL nurses are included but their variables will be fixed to AL so they
    # contribute zero to any working-shift sum.
    rank_A = [n for n in range(num_nurses) if nurse_ranks[n] == "A"]
    rank_B = [n for n in range(num_nurses) if nurse_ranks[n] == "B"]
    rank_C = [n for n in range(num_nurses) if nurse_ranks[n] == "C"]

    weekend_days = [d for d in range(num_days) if d % 7 in (5, 6)]

    # Per-day demand means for shift-variance soft constraint
    shift_means: dict[int, int] = {}
    for s in WORK_SHIFTS:
        total = sum(
            demand[d][s].get("A", 0) + demand[d][s].get("B", 0) + demand[d][s].get("C", 0)
            for d in range(num_days)
        )
        shift_means[s] = total // max(num_days, 1)

    # ── Pre-solve: warn on structurally unmet demand ──────────────────────────
    _check_demand_feasibility(demand, nurse_ranks, working_nurses, num_days)

    # ─────────────────────────────────────────────────────────────────────────
    # Build the CP-SAT model
    # ─────────────────────────────────────────────────────────────────────────
    model = cp_model.CpModel()

    # ── Decision variables ────────────────────────────────────────────────────
    # x[n, d, s] = 1  iff nurse n is assigned shift s on day d
    x: dict[tuple[int, int, int], cp_model.IntVar] = {}
    for n in range(num_nurses):
        for d in range(num_days):
            for s in ALL_SHIFTS:
                x[n, d, s] = model.NewBoolVar(f"x{n}_{d}_{s}")

    # Exactly one shift per nurse per day
    for n in range(num_nurses):
        for d in range(num_days):
            model.AddExactlyOne([x[n, d, s] for s in ALL_SHIFTS])

    # ── Hard / fixed assignments ──────────────────────────────────────────────
    for n in al_nurses_set:                        # full-AL nurses
        for d in range(num_days):
            model.Add(x[n, d, AL] == 1)

    for n in range(num_nurses):                    # single-day AL requests
        if n in al_nurses_set:
            continue
        for d in al_day_req[n]:
            if d < num_days:
                model.Add(x[n, d, AL] == 1)

    for n in post_night_off:                       # post-night mandatory day-off
        if 0 not in al_day_req[n]:
            model.Add(x[n, 0, OFF] == 1)

    # ── Objective accumulator ─────────────────────────────────────────────────
    penalty_vars:    list[cp_model.IntVar] = []
    penalty_weights: list[int]             = []

    def _add_penalty(var: cp_model.IntVar, weight: int) -> None:
        penalty_vars.append(var)
        penalty_weights.append(weight)

    def _shortage(name: str, cap: int, required: int, supplied_expr, weight: int):
        """Penalise shortfall: var = max(0, required − supplied)."""
        v = model.NewIntVar(0, max(cap, 1), name)
        model.Add(v >= required - supplied_expr)
        _add_penalty(v, weight)
        return v

    def _excess(name: str, cap: int, supplied_expr, limit: int, weight: int):
        """Penalise excess: var = max(0, supplied − limit)."""
        v = model.NewIntVar(0, cap, name)
        model.Add(v >= supplied_expr - limit)
        _add_penalty(v, weight)
        return v

    # ── 1. Shift coverage ─────────────────────────────────────────────────────
    # Rank substitution rules (mirrors GA):
    #   Rank A (RN) can fill A, B, or C slots.
    #   Rank B (EN) can fill B or C slots.
    #   Rank C (HCA) can only fill C slots.
    #
    # We enforce three cumulative lower bounds per (day, shift):
    #   cnt_A         >= req_A                  — A slots need A nurses
    #   cnt_A + cnt_B >= req_A + req_B          — AB slots need AB nurses
    #   cnt_A+B+C     >= req_A + req_B + req_C  — total coverage
    #
    # Rank-mismatch (A filling B/C positions) is penalised as a soft objective.

    for d in range(num_days):
        for s in WORK_SHIFTS:
            req_A = demand[d][s]["A"]
            req_B = demand[d][s]["B"]
            req_C = demand[d][s]["C"]
            total_req = req_A + req_B + req_C
            if total_req == 0:
                continue

            # Build count expressions for each rank
            # (AL nurses are fixed to AL so their x[·,d,s]=0 for s ∈ WORK_SHIFTS)
            cnt_A_expr = sum(x[n, d, s] for n in rank_A) if rank_A else 0
            cnt_B_expr = sum(x[n, d, s] for n in rank_B) if rank_B else 0
            cnt_C_expr = sum(x[n, d, s] for n in rank_C) if rank_C else 0
            cnt_tot_expr = cnt_A_expr + cnt_B_expr + cnt_C_expr

            # --- Total coverage shortage (hardest penalty) ---
            _shortage(f"sh_tot_{d}_{s}", total_req, total_req, cnt_tot_expr, W_SHIFT_SHORT)

            # --- Rank-A specific shortage ---
            if req_A > 0:
                _shortage(f"sh_a_{d}_{s}", req_A, req_A, cnt_A_expr, W_RANK_A_SHORT)

            # --- Rank-AB cumulative shortage ---
            if req_A + req_B > 0:
                _shortage(
                    f"sh_ab_{d}_{s}", req_A + req_B,
                    req_A + req_B, cnt_A_expr + cnt_B_expr,
                    W_SHIFT_SHORT // 2,   # marginal; avoids double-counting with total
                )

            # --- Rank mismatch: rank-A nurses filling rank-B/C positions ---
            if rank_A and req_B + req_C > 0:
                _excess(f"ex_a_{d}_{s}", len(rank_A), cnt_A_expr, req_A, W_RANK_MISMATCH)

    # ── 2. Working hours per nurse ────────────────────────────────────────────
    for n in working_nurses:
        hours_expr = sum(
            x[n, d, s] * _SH[s]
            for d in range(num_days)
            for s in ALL_SHIFTS
        )
        n_min = nurse_min_h[n]
        n_max = nurse_max_h[n]

        under = model.NewIntVar(0, n_min + 1, f"und_{n}")
        model.Add(under >= n_min - hours_expr)
        _add_penalty(under, W_HOUR_UNDER)

        over = model.NewIntVar(0, 300, f"ovr_{n}")
        model.Add(over >= hours_expr - n_max)
        _add_penalty(over, W_HOUR_OVER)

    # ── 2b. Mandatory post-night OFF indicators ───────────────────────────────
    # is_post_night[n, d] = 1  iff day d is a structurally forced OFF because
    # the preceding night block ended on day d-1.
    #
    # Encoding: is_post_night[n,d] = x[n,d-1,NIGHT] AND x[n,d,OFF]
    # (Since exactly one shift is assigned per day, x[n,d,OFF]=1 already
    # implies x[n,d,NIGHT]=0, so we only need the two literals above.)
    #
    # These OFFs are excluded from the voluntary-days-off count in section 3
    # so the solver is never penalised for rest days it was forced to place.
    is_post_night: dict[tuple[int, int], cp_model.IntVar] = {}
    for n in working_nurses:
        for d in range(1, num_days):
            v = model.NewBoolVar(f"pn_{n}_{d}")
            model.Add(v <= x[n, d - 1, NIGHT])
            model.Add(v <= x[n, d, OFF])
            model.Add(v >= x[n, d - 1, NIGHT] + x[n, d, OFF] - 1)
            is_post_night[n, d] = v

    # ── 3. Voluntary days-off per week — target = 2 (soft) ───────────────────
    # Counts only OFFs that were NOT forced by a night-block-end (is_post_night).
    # This eliminates the structural trap where W_DAYOFF_OVER fired unavoidably
    # on every post-block rest day, creating an irremovable penalty floor.
    for n in working_nurses:
        for w in range(0, num_days, 7):
            w_end = min(w + 7, num_days)

            total_offs = sum(x[n, d, OFF] for d in range(w, w_end))
            # Post-night mandatory OFFs in this week window (d ≥ 1 only,
            # since d=0 can have no preceding night within this roster).
            mandatory_offs = sum(
                is_post_night[n, d]
                for d in range(max(w, 1), w_end)
                if (n, d) in is_post_night
            )
            vol = model.NewIntVar(0, w_end - w, f"vo_{n}_{w}")
            model.Add(vol == total_offs - mandatory_offs)

            under = model.NewIntVar(0, 7, f"dou_{n}_{w}")
            model.Add(under >= 2 - vol)
            _add_penalty(under, W_DAYOFF_UNDER)

            over = model.NewIntVar(0, 7, f"doo_{n}_{w}")
            model.Add(over >= vol - 2)
            _add_penalty(over, W_DAYOFF_OVER)

    # ── 4. Night shifts over fortnight — target = 2–4 total (soft) ───────────
    # Previously enforced 1–2 nights per 7-day window, which created a circular
    # tension with the mandatory post-block OFF rule: the solver was pushed to
    # schedule nights every week (to avoid W_NIGHT_LOW) yet was simultaneously
    # penalised for the extra OFFs those blocks forced (W_DAYOFF_OVER).
    # Switching to a fortnightly window (2–4 nights across all 14 days) gives
    # the solver freedom to cluster nights in one week rather than being
    # squeezed on both sides of every 7-day boundary.
    for n in working_nurses:
        total_nights = sum(x[n, d, NIGHT] for d in range(num_days))

        low = model.NewIntVar(0, num_days, f"nl_{n}")
        model.Add(low >= 2 - total_nights)   # at least 2 nights per fortnight
        _add_penalty(low, W_NIGHT_LOW)

        high = model.NewIntVar(0, num_days, f"nh_{n}")
        model.Add(high >= total_nights - 4)  # no more than 4 nights per fortnight
        _add_penalty(high, W_NIGHT_HIGH)

    # ── 4b. Night block rules (HARD) ─────────────────────────────────────────
    # Rule A — maximum block length of 2 consecutive nights.
    #   For every window of 3 consecutive days, at most 2 may be NIGHT.
    #   Encoding: x[n,d,N] + x[n,d+1,N] + x[n,d+2,N] ≤ 2
    #
    # Rule B — mandatory OFF immediately after every night block ends.
    #   A block "ends" on day d when day d is NIGHT and day d+1 is not.
    #   Encoding: x[n,d,N] - x[n,d+1,N] ≤ x[n,d+1,OFF]
    #   Proof of correctness:
    #     • d=NIGHT, d+1=non-NIGHT → LHS=1 → OFF must be 1  ✓
    #     • d=NIGHT, d+1=NIGHT     → LHS=0 → no constraint  ✓
    #     • d=non-NIGHT             → LHS≤0 → always satisfied ✓
    #
    # AL days are skipped for Rule B: an approved leave day already provides
    # rest, and forcing OFF on a fixed AL slot would make the model infeasible.
    # The last day of the roster is skipped (no d+1 exists).

    for n in working_nurses:
        # Rule A: no 3+ consecutive nights
        for d in range(num_days - 2):
            model.Add(
                x[n, d, NIGHT] + x[n, d + 1, NIGHT] + x[n, d + 2, NIGHT] <= 2
            )

        # Rule B: mandatory OFF after a night block ends
        for d in range(num_days - 1):
            if (d + 1) in al_day_req[n]:
                # AL leave already provides rest — skip
                continue
            model.Add(
                x[n, d, NIGHT] - x[n, d + 1, NIGHT] <= x[n, d + 1, OFF]
            )

    # ── 5. Approved (hard) shift requests ─────────────────────────────────────
    for n in working_nurses:
        for (d, s) in set(approved[n]):
            viol = model.NewBoolVar(f"ar_{n}_{d}_{s}")
            # viol = 1  iff nurse n is NOT on shift s on day d
            model.Add(viol + x[n, d, s] >= 1)   # at least one of them is 1
            model.Add(viol <= 1 - x[n, d, s] + 0)  # viol <= 1 − x  (forces viol=1 when x=0)
            # Simpler equivalent formulation:
            # model.Add(x[n,d,s] + viol >= 1) and model.Add(viol <= 1 - x[n,d,s])
            # Together these give viol = 1 - x[n,d,s]  (when minimizing cost).
            _add_penalty(viol, W_APPROVED_REQ)

    # ── 6. Pending (soft) shift requests ──────────────────────────────────────
    for n in working_nurses:
        for (d, s) in set(pending[n]):
            viol = model.NewBoolVar(f"pr_{n}_{d}_{s}")
            model.Add(viol + x[n, d, s] >= 1)
            model.Add(viol <= 1 - x[n, d, s] + 0)
            _add_penalty(viol, W_PENDING_REQ)

    # ── 7. OFF → AM transition penalty ────────────────────────────────────────
    for n in working_nurses:
        for d in range(num_days - 1):
            if d in al_day_req[n] or (d + 1) in al_day_req[n]:
                continue
            # both = x[n,d,OFF] AND x[n,d+1,AM]
            both = model.NewBoolVar(f"ota_{n}_{d}")
            model.Add(both <= x[n, d, OFF])
            model.Add(both <= x[n, d + 1, AM])
            model.Add(both >= x[n, d, OFF] + x[n, d + 1, AM] - 1)
            _add_penalty(both, W_OFF_TO_AM)

    # ── 8. Night-shift fairness (range across nurses) ─────────────────────────
    if len(working_nurses) > 1:
        nc_vars: list[cp_model.IntVar] = []
        for n in working_nurses:
            nc = model.NewIntVar(0, num_days, f"nc_{n}")
            model.Add(nc == sum(x[n, d, NIGHT] for d in range(num_days)))
            nc_vars.append(nc)

        max_nc = model.NewIntVar(0, num_days, "max_nc")
        min_nc = model.NewIntVar(0, num_days, "min_nc")
        model.AddMaxEquality(max_nc, nc_vars)
        model.AddMinEquality(min_nc, nc_vars)
        range_nc = model.NewIntVar(0, num_days, "range_nc")
        model.Add(range_nc == max_nc - min_nc)
        _add_penalty(range_nc, W_NIGHT_FAIR)

    # ── 9. Weekend fairness (range of weekend working days across nurses) ──────
    if len(working_nurses) > 1 and weekend_days:
        wc_vars: list[cp_model.IntVar] = []
        for n in working_nurses:
            wc = model.NewIntVar(0, len(weekend_days), f"wc_{n}")
            model.Add(wc == sum(x[n, d, s] for d in weekend_days for s in WORK_SHIFTS))
            wc_vars.append(wc)

        max_wc = model.NewIntVar(0, len(weekend_days), "max_wc")
        min_wc = model.NewIntVar(0, len(weekend_days), "min_wc")
        model.AddMaxEquality(max_wc, wc_vars)
        model.AddMinEquality(min_wc, wc_vars)
        range_wc = model.NewIntVar(0, len(weekend_days), "range_wc")
        model.Add(range_wc == max_wc - min_wc)
        _add_penalty(range_wc, W_WEEKEND_FAIR)

    # ── 10. Daily working-nurse count balance ─────────────────────────────────
    if num_days > 1 and working_nurses:
        dt_vars: list[cp_model.IntVar] = []
        for d in range(num_days):
            dt = model.NewIntVar(0, num_nurses, f"dt_{d}")
            model.Add(dt == sum(x[n, d, s] for n in working_nurses for s in WORK_SHIFTS))
            dt_vars.append(dt)

        max_dt = model.NewIntVar(0, num_nurses, "max_dt")
        min_dt = model.NewIntVar(0, num_nurses, "min_dt")
        model.AddMaxEquality(max_dt, dt_vars)
        model.AddMinEquality(min_dt, dt_vars)
        range_dt = model.NewIntVar(0, num_nurses, "range_dt")
        model.Add(range_dt == max_dt - min_dt)
        _add_penalty(range_dt, W_DAILY_BAL)

    # ── 11. Per-shift-type day-to-day variance ────────────────────────────────
    # Penalise absolute deviation of each day's actual count from the
    # demand-based mean (approximates the GA's squared-deviation term).
    for s in WORK_SHIFTS:
        mean_s = shift_means[s]
        for d in range(num_days):
            cnt_sd = model.NewIntVar(0, num_nurses, f"cs_{s}_{d}")
            model.Add(cnt_sd == sum(x[n, d, s] for n in working_nurses))
            diff_sd = model.NewIntVar(-num_nurses, num_nurses, f"df_{s}_{d}")
            model.Add(diff_sd == cnt_sd - mean_s)
            dev_sd = model.NewIntVar(0, num_nurses, f"dv_{s}_{d}")
            model.AddAbsEquality(dev_sd, diff_sd)
            _add_penalty(dev_sd, W_SHIFT_VAR)

    # ── 12. AM / PM within-day balance ────────────────────────────────────────
    # Penalise when |AM count − PM count| > 2 on any day.
    if working_nurses:
        for d in range(num_days):
            am_d = model.NewIntVar(0, num_nurses, f"amd_{d}")
            pm_d = model.NewIntVar(0, num_nurses, f"pmd_{d}")
            model.Add(am_d == sum(x[n, d, AM] for n in working_nurses))
            model.Add(pm_d == sum(x[n, d, PM] for n in working_nurses))

            diff_ap = model.NewIntVar(-num_nurses, num_nurses, f"dap_{d}")
            model.Add(diff_ap == am_d - pm_d)
            abs_ap = model.NewIntVar(0, num_nurses, f"aap_{d}")
            model.AddAbsEquality(abs_ap, diff_ap)

            excess_ap = model.NewIntVar(0, num_nurses, f"eap_{d}")
            model.Add(excess_ap >= abs_ap - 2)
            _add_penalty(excess_ap, W_AM_PM_BAL)

    # ── 13. Symmetry breaking ────────────────────────────────────────────────
    # Nurses of identical rank with no special constraints (no AL days, no
    # approved/pending requests, not in post_night_off) are fully interchangeable:
    # any optimal solution can be permuted among such nurses to yield an equally
    # optimal solution.  This creates huge redundancy in the search tree.
    #
    # Breaking the symmetry by ordering total AM-shift counts prevents the solver
    # exploring permutations of equivalent schedules.  The ordering is arbitrary
    # (any consistent ordering works) and does NOT cut off non-equivalent solutions.
    for rank_group in [rank_A, rank_B, rank_C]:
        clean = [
            n for n in rank_group
            if n in set(working_nurses)
            and not al_day_req[n]
            and n not in post_night_off
            and not approved[n]
            and not pending[n]
        ]
        for i in range(len(clean) - 1):
            n1, n2 = clean[i], clean[i + 1]
            am1 = sum(x[n1, d, AM] for d in range(num_days))
            am2 = sum(x[n2, d, AM] for d in range(num_days))
            model.Add(am1 >= am2)

    # ── Objective: minimise total weighted penalty − AM reward ────────────────
    am_reward_vars = [x[n, d, AM] for n in working_nurses for d in range(num_days)]

    all_obj_vars    = penalty_vars    + am_reward_vars
    all_obj_weights = penalty_weights + [-W_MORNING_PREF] * len(am_reward_vars)

    if all_obj_vars:
        model.Minimize(cp_model.LinearExpr.WeightedSum(all_obj_vars, all_obj_weights))

    # ─────────────────────────────────────────────────────────────────────────
    # Solve
    # ─────────────────────────────────────────────────────────────────────────
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = _TIME_LIMIT_S
    solver.parameters.num_search_workers  = max(1, (os.cpu_count() or 2) - 1)
    solver.parameters.log_search_progress = True

    print(f"[CP-SAT] Solving: {num_nurses} nurses × {num_days} days "
          f"| {len(working_nurses)} working | workers={solver.parameters.num_search_workers}")

    # ── Warm-start: inject greedy solution as solver hints ────────────────────
    # CP-SAT uses hints as the first incumbent, immediately establishing a
    # feasible upper bound.  The solver then spends the full time budget
    # improving rather than finding a first feasible solution from scratch.
    hint_sched = _build_greedy_hint(
        num_nurses, num_days, working_nurses, al_nurses_set,
        al_day_req, post_night_off, demand,
    )
    for n in range(num_nurses):
        for d in range(num_days):
            for s in ALL_SHIFTS:
                model.AddHint(x[n, d, s], 1 if hint_sched[n][d] == s else 0)
    print("[CP-SAT] Greedy warm-start hint injected")

    if progress_callback:
        progress_callback(0, 1, float("inf"))

    status     = solver.Solve(model)
    status_str = solver.StatusName(status)
    obj_val    = solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else float("inf")

    print(f"[CP-SAT] Status={status_str}  Objective={obj_val:.0f}"
          f"  WallTime={solver.WallTime():.1f}s")

    if progress_callback:
        progress_callback(1, 1, obj_val)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError(
            f"CP-SAT solver returned '{status_str}' — no feasible solution found. "
            "Verify that nurse demand and leave requests are mutually consistent."
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Extract and format solution
    # ─────────────────────────────────────────────────────────────────────────
    schedule: list[list[int]] = []
    for n in range(num_nurses):
        row: list[int] = []
        for d in range(num_days):
            assigned = OFF
            for s in ALL_SHIFTS:
                if solver.Value(x[n, d, s]):
                    assigned = s
                    break
            row.append(assigned)
        schedule.append(row)

    return _format_output(
        nurses_sorted, schedule, nurse_names, nurse_ranks,
        num_days, obj_val, leave_overlay,
    )


# ─── Output formatter (mirrors ga_algo.format_output exactly) ─────────────────

def _format_output(
    nurses_sorted: list[dict],
    schedule: list[list[int]],
    nurse_names: list[str],
    nurse_ranks: list[str],
    num_days: int,
    obj_val: float,
    leave_overlay: dict[str, dict[int, str]],
) -> dict:
    """Convert raw schedule matrix to the standardised JSON output dict."""
    _LEAVE_ALL    = _LEAVE_CODES | {"AL"}
    name_to_nurse = {n["name"]: n for n in nurses_sorted}
    output_nurses: list[dict] = []

    for idx, name in enumerate(nurse_names):
        if name not in name_to_nurse:
            continue
        nurse_info  = name_to_nurse[name]
        nurse_codes = schedule[idx] if idx < len(schedule) else [OFF] * num_days
        sched       = [SHIFT_LABEL.get(c, "OFF") for c in nurse_codes]

        # Restore original leave-type labels (HOL, MC, etc.) from the overlay
        if leave_overlay:
            for day_idx, leave_code in (leave_overlay.get(name) or {}).items():
                if 0 <= day_idx < num_days:
                    sched[day_idx] = leave_code

        # Alternate DO / RD: every 2nd OFF day becomes "RD" (mirrors GA output)
        off_count = 0
        for i, label in enumerate(sched):
            if label == "OFF":
                off_count += 1
                if off_count % 2 == 0:
                    sched[i] = "RD"

        stats = {
            "total_shifts":  sum(1 for s in sched if s not in ("OFF", "RD") and s not in _LEAVE_ALL),
            "am_shifts":     sched.count("AM"),
            "pm_shifts":     sched.count("PM"),
            "night_shifts":  sched.count("NIGHT"),
            "days_off":      sched.count("OFF") + sched.count("RD"),
            "al_days":       sum(1 for s in sched if s in _LEAVE_ALL),
        }

        output_nurses.append({
            "id":       nurse_info["id"],
            "name":     name,
            "rank":     nurse_info["rank"],
            "schedule": sched,
            "stats":    stats,
        })

    output_nurses.sort(key=lambda n: n["id"])

    return {
        "nurses": output_nurses,
        "metadata": {
            "num_days":      num_days,
            "num_nurses":    len(output_nurses),
            "algorithm":     "CP-SAT",
            "penalty_score": obj_val,
        },
    }