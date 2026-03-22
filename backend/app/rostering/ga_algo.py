# Genetic Algorithm with Standardized Input/Output
import os
import random
import numpy as np
from dataclasses import dataclass
from concurrent.futures import ProcessPoolExecutor

# Module-level shift code for AL (Annual Leave) — used in evaluate_individual
_AL_CODE = 4

# Leave types beyond "AL" that should be treated as leave internally by the GA.
# The original code is preserved in the output via the leave_overlay mechanism.
_LEAVE_CODES = {"HOL", "MC", "URG", "CL", "UPL", "PH", "BCL", "CCL", "ML", "EML"}


@dataclass(frozen=True)
class GAContext:
    num_days: int
    num_nurses: int
    off: int
    am: int
    pm: int
    night: int
    patterns: dict
    shift_hours: dict
    nurse_ranks: list
    demand: list
    approved_requests: list
    pending_requests: list
    hard_requests: list
    min_hours: int
    max_hours: int
    hard_pen_shift: float
    hard_pen_hour: float
    hard_pen_dayoff: float
    hard_pen_ndo: float
    hard_pen_nights: float
    soft_w_approved_request: float
    soft_w_pending_request: float
    soft_w_night_fair: float
    soft_w_weekend_fair: float
    soft_w_weekday_pref: float
    soft_w_morning_pref: float
    soft_w_daily_balance: float
    soft_w_overtime: float
    # Annual Leave support
    al_nurses: frozenset = frozenset()
    working_nurses: tuple = ()
    hard_pen_al: float = 1_000_000
    # Precomputed helpers for faster evaluation
    weekend_days: tuple = (5, 6, 12, 13)
    weekday_days: tuple = ()
    avg_min: float = 0.0
    shift_hours_by_code: tuple = ()
    approved_req_sets: tuple = ()
    pending_req_sets: tuple = ()
    hard_req_sets: tuple = ()


_WORKER_CTX = None


def _init_worker(ctx: GAContext):
    global _WORKER_CTX
    _WORKER_CTX = ctx


def _expand_pattern_list(pattern_list, patterns):
    shifts = []
    for p in pattern_list:
        shifts.extend(patterns[p])
    return shifts


def _expand_individual(individual, ctx: GAContext):
    schedule = [_expand_pattern_list(individual[n], ctx.patterns) for n in range(ctx.num_nurses)]
    for seq in schedule:
        if len(seq) != ctx.num_days:
            raise ValueError("Expanded sequence length mismatch")
    return schedule


def _night_weekly_penalty(schedule, ctx: GAContext):
    penalty = 0
    nurses = ctx.working_nurses if ctx.working_nurses else range(ctx.num_nurses)
    for n in nurses:
        for week in (range(0, 7), range(7, 14)):
            night_count = sum(1 for d in week if schedule[n][d] == ctx.night)
            if night_count < 1:
                penalty += (1 - night_count) * ctx.hard_pen_nights * 0.8
            elif night_count > 2:
                penalty += (night_count - 2) * ctx.hard_pen_nights
    return penalty


# FIX 1: removed schedule_cache — keyed by id() which reuses after GC and was
# never actually hit (each individual evaluated once per _score_population call).
def evaluate_individual(individual, ctx: GAContext):
    schedule = _expand_individual(individual, ctx)
    penalty = 0
    AL = _AL_CODE

    num_days = ctx.num_days
    num_nurses = ctx.num_nurses
    off = ctx.off
    am = ctx.am
    pm = ctx.pm
    night = ctx.night
    demand = ctx.demand
    nurse_ranks = ctx.nurse_ranks
    shift_hours_by_code = ctx.shift_hours_by_code
    approved_req_sets = ctx.approved_req_sets
    pending_req_sets = ctx.pending_req_sets
    hard_req_sets = ctx.hard_req_sets

    # Determine working nurses (non-AL)
    working = ctx.working_nurses if ctx.working_nurses else tuple(range(num_nurses))

    # 0) AL violation penalty
    if ctx.al_nurses:
        for n in ctx.al_nurses:
            violations = sum(1 for d in range(num_days) if schedule[n][d] != AL)
            penalty += violations * ctx.hard_pen_al

    # 1) Shift coverage minima (hard) — AL nurses have AL code, not AM/PM/NIGHT, so no change needed
    for d in range(num_days):
        for shift in [am, pm, night]:
            available = {"A": 0, "B": 0, "C": 0}
            for n in range(num_nurses):
                if schedule[n][d] == shift:
                    r = nurse_ranks[n]
                    available[r] += 1

            req = demand[d][shift]
            remaining = available.copy()

            used_A_for_A = min(remaining["A"], req["A"])
            remaining["A"] -= used_A_for_A
            missing_A = req["A"] - used_A_for_A

            needed_B = req["B"]
            used_B_for_B = min(remaining["B"], needed_B)
            remaining["B"] -= used_B_for_B
            needed_B -= used_B_for_B

            used_A_for_B = min(remaining["A"], needed_B)
            remaining["A"] -= used_A_for_B
            needed_B -= used_A_for_B
            missing_B = needed_B

            needed_C = req["C"]
            used_C_for_C = min(remaining["C"], needed_C)
            remaining["C"] -= used_C_for_C
            needed_C -= used_C_for_C

            used_B_for_C = min(remaining["B"], needed_C)
            remaining["B"] -= used_B_for_C
            needed_C -= used_B_for_C

            used_A_for_C = min(remaining["A"], needed_C)
            remaining["A"] -= used_A_for_C
            needed_C -= used_A_for_C

            missing_C = needed_C
            penalty += (missing_A + missing_B + missing_C) * ctx.hard_pen_shift

    # 2) Hours per nurse (hard) — skip AL nurses
    hours_per_nurse = []
    for n in working:
        h = sum(shift_hours_by_code[s] for s in schedule[n][:num_days])
        hours_per_nurse.append(h)
        if h < ctx.min_hours:
            penalty += (ctx.min_hours - h) * ctx.hard_pen_hour * 1.2
        if h > ctx.max_hours:
            penalty += (h - ctx.max_hours) * ctx.hard_pen_hour * 0.8

    # 3) 2 days off per week (hard) — skip AL nurses
    for n in working:
        for week in (range(0, 7), range(7, 14)):
            offs = sum(1 for d in week if schedule[n][d] == off)
            if offs < 2:
                penalty += (2 - offs) * ctx.hard_pen_dayoff
            elif offs > 2:
                penalty += (offs - 2) * 0.9 * ctx.hard_pen_dayoff

    # 5) Requests (soft) — skip AL nurses
    for n in working:
        for (d, s) in approved_req_sets[n]:
            if d < num_days and schedule[n][d] != s:
                penalty += ctx.soft_w_approved_request

    for n in working:
        for (d, s) in pending_req_sets[n]:
            if d < num_days and schedule[n][d] != s:
                penalty += ctx.soft_w_pending_request

    # 5.5) DO after last-week night — skip AL nurses
    for n in working:
        for (d, s) in hard_req_sets[n]:
            if schedule[n][d] != s:
                penalty += ctx.hard_pen_ndo

    # 6) Night fairness — working nurses only
    night_counts = [sum(1 for d in range(num_days) if schedule[n][d] == night) for n in working]
    if len(night_counts) > 1:
        penalty += (max(night_counts) - min(night_counts)) * ctx.soft_w_night_fair

    # 7) Weekend fairness — working nurses only
    weekend_days = ctx.weekend_days
    weekend_counts = [sum(1 for d in weekend_days if schedule[n][d] != off) for n in working]
    if len(weekend_counts) > 1:
        penalty += (max(weekend_counts) - min(weekend_counts)) * ctx.soft_w_weekend_fair

    # 8) Weekday coverage preference & daily balance — working nurses only
    weekday_days = ctx.weekday_days
    daily_totals = [sum(1 for n in working if schedule[n][d] not in (off, AL)) for d in range(num_days)]
    avg_min = ctx.avg_min
    avg_weekday_coverage = sum(daily_totals[d] for d in weekday_days) / (len(weekday_days)) if weekday_days else 0
    if avg_weekday_coverage < avg_min:
        penalty += (avg_min - avg_weekday_coverage) * ctx.soft_w_weekday_pref * 5

    if len(daily_totals) > 1:
        penalty += (max(daily_totals) - min(daily_totals)) * ctx.soft_w_daily_balance

    # 9) Preference for mornings (soft) — working nurses only
    am_count = sum(1 for n in working for d in range(num_days) if schedule[n][d] == am)
    penalty -= am_count * ctx.soft_w_morning_pref * 0.05

    # 10) Overtime soft — working nurses only
    for h in hours_per_nurse:
        if h > ctx.max_hours:
            penalty += (h - ctx.max_hours) * ctx.soft_w_overtime

    penalty += _night_weekly_penalty(schedule, ctx)
    return penalty


def _evaluate_worker(individual):
    return evaluate_individual(individual, _WORKER_CTX)


# FIX 1 (cont): removed schedule_cache from single-threaded path
def _score_population(population, ctx: GAContext, executor=None, worker_count=1):
    if executor is None:
        return [evaluate_individual(ind, ctx) for ind in population]
    chunksize = max(1, len(population) // max(1, worker_count * 4))
    return list(executor.map(_evaluate_worker, population, chunksize=chunksize))


def _detect_al_nurses(nurse_requests_parsed, num_days):
    """
    Identify nurses whose request list covers every day with an AL request.
    These nurses are locked to ["AL-FULL"] for the entire run.
    """
    AL = _AL_CODE
    al_set = set()
    for n, req_list in enumerate(nurse_requests_parsed):
        al_days = {d for (d, s) in req_list if s == AL}
        if len(al_days) >= num_days:
            al_set.add(n)
    return frozenset(al_set)


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
    Main entry point for Genetic Algorithm nurse rostering.

    Args:
        nurses: List of nurse dicts with keys: id, name, rank
        shifts: List of shift requirement dicts (one per day)
        hard_requests: Dict mapping nurse_id to approved request tuples
        soft_requests: Dict mapping nurse_id to pending request tuples
        prev_last_shift: Dict mapping nurse_id to previous-period final shift
        shift_hours: Dict mapping AM/PM/NIGHT/OFF to duration hours
        non_working_shift_codes: Set of non-working DB shift codes to map to OFF
        progress_callback: Optional callable(gen, total_gens, best_score) called every 25 generations

    Returns:
        Standardized roster dict with keys: nurses, metadata
    """
    # Parse inputs
    parsed_data = parse_inputs(
        nurses,
        shifts,
        hard_requests,
        soft_requests,
        prev_last_shift,
        shift_hours,
        non_working_shift_codes,
    )

    # Run GA solver
    best_individual, best_penalty = run_ga(
        parsed_data['nurse_names'],
        parsed_data['nurse_ranks'],
        parsed_data['demand'],
        parsed_data['approved_requests'],
        parsed_data['pending_requests'],
        parsed_data['hard_requests'],
        parsed_data['shift_hours'],
        parsed_data['num_days'],
        al_nurses=parsed_data.get('al_nurses', frozenset()),
        progress_callback=progress_callback,
    )

    # Build leave overlay: nurse_name -> {day_idx: original_leave_code}
    # so format_output can restore the specific leave type (HOL, MC, etc.)
    _all_leave_codes = _LEAVE_CODES | {"AL"}
    _id_to_name = {n["id"]: n["name"] for n in nurses}
    leave_overlay: dict[str, dict[int, str]] = {}
    for nurse_id, req_list in (hard_requests or {}).items():
        name = _id_to_name.get(nurse_id)
        if name is None:
            continue
        for day_idx, code in req_list:
            if str(code).upper() in _all_leave_codes:
                leave_overlay.setdefault(name, {})[day_idx] = str(code).upper()

    # Convert to standardized output
    output = format_output(
        nurses,
        best_individual,
        parsed_data['nurse_names'],
        parsed_data['nurse_ranks'],
        parsed_data['num_days'],
        best_penalty,
        leave_overlay=leave_overlay,
    )

    return output


def parse_inputs(
    nurses,
    shifts,
    hard_requests=None,
    soft_requests=None,
    prev_last_shift=None,
    shift_hours=None,
    non_working_shift_codes=None,
    num_days=14,
):
    """
    Parse JSON inputs into GA-compatible format.

    Returns dict with:
        - nurse_names: List of nurse names
        - nurse_ranks: List of nurse ranks (A/B/C)
        - demand: List of daily shift requirements
        - approved_requests: List of request lists per nurse
        - pending_requests: List of request lists per nurse
        - num_days: Number of days
    """
    hard_requests = hard_requests or {}
    soft_requests = soft_requests or {}
    prev_last_shift = prev_last_shift or {}
    shift_hours = shift_hours or {"AM": 8.0, "PM": 8.0, "NIGHT": 10.0, "OFF": 0.0}
    non_working_shift_codes = {
        str(code).upper() for code in (non_working_shift_codes or set())
    }

    # Shift codes (must match GA internal representation)
    OFF, AM, PM, NIGHT, AL = 0, 1, 2, 3, _AL_CODE
    SHIFT_CODE = {
        "OFF": OFF,
        "AM": AM,
        "PM": PM,
        "NIGHT": NIGHT,
        "AL": AL,
    }

    # Sort nurses by ID for consistent ordering
    nurses_sorted = sorted(nurses, key=lambda x: x["id"])

    nurse_names = [n["name"] for n in nurses_sorted]
    nurse_ranks = [n["rank"] for n in nurses_sorted]
    num_nurses = len(nurses_sorted)

    # Validate shifts data
    if len(shifts) != num_days:
        raise ValueError(f"Expected {num_days} days of shift data, got {len(shifts)}")

    # Parse demand (shift requirements per day) — AL carries no staffing demand
    demand = []
    for day_idx in range(num_days):
        day_entry = {}
        for shift_name, requirements in shifts[day_idx].items():
            shift_key = str(shift_name).upper()
            if shift_key in SHIFT_CODE and shift_key != "AL":
                shift_code = SHIFT_CODE[shift_key]
                day_entry[shift_code] = {
                    "A": int(requirements.get("A", 0)),
                    "B": int(requirements.get("B", 0)),
                    "C": int(requirements.get("C", 0)),
                }
        demand.append(day_entry)

    # Parse nurse requests — preserve AL code so _detect_al_nurses can find it
    nurse_id_to_index = {n["id"]: idx for idx, n in enumerate(nurses_sorted)}

    def _parse_request_bucket(source, preserve_al=False):
        output = [[] for _ in range(num_nurses)]
        for nurse_id, req_list in source.items():
            nurse_idx = nurse_id_to_index.get(nurse_id)
            if nurse_idx is None:
                continue
            for day_idx, shift_name in req_list:
                shift_key = str(shift_name).upper()
                # Non-AL leave types (HOL, MC, etc.) are treated as AL internally
                if shift_key in _LEAVE_CODES:
                    shift_key = "AL"
                if shift_key not in SHIFT_CODE or shift_key in non_working_shift_codes:
                    shift_key = "OFF"
                if not preserve_al and shift_key == "AL":
                    shift_key = "OFF"
                if 0 <= day_idx < num_days:
                    output[nurse_idx].append((day_idx, SHIFT_CODE[shift_key]))
        return output

    # Parse approved requests preserving AL to detect AL nurses
    approved_requests_raw = _parse_request_bucket(hard_requests, preserve_al=True)
    al_nurses = _detect_al_nurses(approved_requests_raw, num_days)

    # Strip AL entries from approved/pending (non-AL nurses only get real shift requests)
    approved_requests = [
        [(d, s) for (d, s) in reqs if s != AL]
        for reqs in approved_requests_raw
    ]
    pending_requests = _parse_request_bucket(soft_requests, preserve_al=False)

    # Hard DO requests ensure rest after a previous-period night shift (AL nurses exempt)
    do_requests = [[] for _ in range(num_nurses)]
    for nurse_id, shift_name in prev_last_shift.items():
        nurse_idx = nurse_id_to_index.get(nurse_id)
        if nurse_idx is None:
            continue
        if nurse_idx in al_nurses:
            continue
        if str(shift_name).strip().upper() == "NIGHT":
            do_requests[nurse_idx].append((0, OFF))

    working_nurses = tuple(n for n in range(num_nurses) if n not in al_nurses)

    return {
        'nurse_names': nurse_names,
        'nurse_ranks': nurse_ranks,
        'demand': demand,
        'approved_requests': approved_requests,
        'pending_requests': pending_requests,
        'hard_requests': do_requests,
        'shift_hours': shift_hours,
        'num_days': num_days,
        'al_nurses': al_nurses,
        'working_nurses': working_nurses,
    }


def run_ga(nurse_names, nurse_ranks, demand, approved_requests, pending_requests, hard_requests, shift_hours, num_days=14, al_nurses=None, progress_callback=None):
    """
    Run the genetic algorithm to generate a roster.

    Returns: (best_individual, best_penalty)
    """
    # ===================== CONFIG =====================
    NUM_DAYS = num_days
    NUM_NURSES = len(nurse_names)

    # Shift codes
    OFF = 0
    AM = 1
    PM = 2
    NIGHT = 3
    AL = _AL_CODE   # Annual Leave

    SHIFT_HOURS = {
        OFF:   float(shift_hours.get("OFF", 0)),
        AM:    float(shift_hours.get("AM", 0)),
        PM:    float(shift_hours.get("PM", 0)),
        NIGHT: float(shift_hours.get("NIGHT", 0)),
        AL:    0.0,
    }

    # Patterns and their day sequences (list of shift codes)
    PATTERNS = {
        "AM":      [AM],
        "PM":      [PM],
        "OFF":     [OFF],
        "N-OFF":   [NIGHT, OFF],
        "N-N-OFF": [NIGHT, NIGHT, OFF],
        "N-END":   [NIGHT],
        "N-N-END": [NIGHT, NIGHT],
        "AL-FULL": [AL] * NUM_DAYS,
    }
    PATTERN_NAMES    = list(PATTERNS.keys())
    WORKING_PATTERNS = [p for p in PATTERN_NAMES if p != "AL-FULL"]

    NURSE_RANKS = nurse_ranks

    DEMAND = demand

    APPROVED_REQUESTS = approved_requests
    PENDING_REQUESTS  = pending_requests
    HARD_REQUESTS     = hard_requests

    # AL nurses
    AL_NURSES      = al_nurses if al_nurses is not None else frozenset()
    WORKING_NURSES = [n for n in range(NUM_NURSES) if n not in AL_NURSES]

    # Hours constraints (over 14 days)
    MIN_HOURS = 84
    MAX_HOURS = 88

    # Penalty weights
    HARD_PEN_NDO    = 999_999  # DO missing after last roster trailing night
    HARD_PEN_SHIFT  = 150_000  # missing required staff
    HARD_PEN_HOUR   = 100_000  # hours outside min/max
    HARD_PEN_DAYOFF = 160_000  # missing required days-off (2 per week)
    HARD_PEN_NIGHTS =  80_000  # too few or too many nights
    HARD_PEN_AL     = 1_000_000  # per AL day not honoured

    # FIX 2: shift_targets computed per-day (was only day 0).
    # Repair/search helpers now use the correct target for each specific day.
    shift_targets = [
        {
            s: sum(DEMAND[d][s].get(r, 0) for r in ['A', 'B', 'C'])
            for s in [AM, PM, NIGHT]
            if s in DEMAND[d]
        }
        for d in range(NUM_DAYS)
    ] if DEMAND else [{} for _ in range(NUM_DAYS)]

    SOFT_W_APPROVED_REQUEST = 50
    SOFT_W_PENDING_REQUEST  = 50
    SOFT_W_NIGHT_FAIR       = 5
    SOFT_W_WEEKEND_FAIR     = 5
    SOFT_W_WEEKDAY_PREF     = 8
    SOFT_W_MORNING_PREF     = 4
    SOFT_W_DAILY_BALANCE    = 50
    SOFT_W_OVERTIME         = 200

    # GA hyperparams
    POP_SIZE           = 200
    GENERATIONS        = 700
    TOURNAMENT_K       = 2
    CROSSOVER_RATE     = 0.7
    REBALANCE_PROB     = 0.4
    PATTERN_SWAP_PROB  = 0.3
    PATTERN_SWAP_MAX   = 0.6
    BASE_MUTATION_RATE = 0.2
    MAX_MUTATION_RATE  = 0.7
    PLATEAU_GENS       = 10
    ELITISM            = 3

    # ===================== CPU CONFIG =====================
    cpu_count = os.cpu_count() or 1
    worker_count = max(1, cpu_count - 1)
    print(f"GA workers: {worker_count} (cpu_count={cpu_count})")

    # ===================== UTILITIES =====================
    def extract_night_blocks(schedule, nurse):
        blocks = []
        d = 0
        while d < NUM_DAYS:
            if schedule[nurse][d] == NIGHT:
                start = d
                while d < NUM_DAYS and schedule[nurse][d] == NIGHT:
                    d += 1
                if d < NUM_DAYS and schedule[nurse][d] == OFF:
                    blocks.append((start, d))  # [start, off_day)
            d += 1
        return blocks

    def rebalance_night_blocks(ind):
        schedule = expand_individual(ind)

        for week_start in [0, 7]:
            week_end = week_start + 7

            night_counts = [
                sum(1 for d in range(week_start, week_end)
                    if schedule[n][d] == NIGHT)
                for n in range(NUM_NURSES)
            ]

            heavy = [n for n, c in enumerate(night_counts) if c > 2]
            light = [n for n, c in enumerate(night_counts) if c < 1]

            random.shuffle(heavy)
            random.shuffle(light)

            for src in heavy:
                blocks = extract_night_blocks(schedule, src)
                for start, end in blocks:
                    if not (week_start <= start < week_end):
                        continue

                    for dst in light:
                        if all(schedule[dst][d] == OFF for d in range(start, end)):
                            # move block
                            for d in range(start, end):
                                schedule[src][d] = OFF
                                schedule[dst][d] = NIGHT if d < end - 1 else OFF
                            break

        return schedule_to_patterns(schedule, fallback_ind=ind)

    def pattern_swap_mutation(ind):
        n1, n2 = random.sample(range(NUM_NURSES), 2)
        p1 = random.randrange(len(ind[n1]))
        p2 = random.randrange(len(ind[n2]))
        ind[n1][p1], ind[n2][p2] = ind[n2][p2], ind[n1][p1]
        return ind

    def rebalance_nights_weekly(ind):
        schedule = expand_individual(ind)

        for week in [(0, 7), (7, 14)]:
            night_counts = [
                sum(1 for d in range(*week) if schedule[n][d] == NIGHT)
                for n in range(NUM_NURSES)
            ]

            over  = [n for n, c in enumerate(night_counts) if c > 2]
            under = [n for n, c in enumerate(night_counts) if c < 1]

            for src, dst in zip(over, under):
                candidates = [
                    d for d in range(*week)
                    if schedule[src][d] == NIGHT
                    and schedule[dst][d] == OFF
                ]
                if not candidates:
                    continue
                d = random.choice(candidates)
                schedule[src][d] = OFF
                schedule[dst][d] = NIGHT

        return schedule_to_patterns(schedule, fallback_ind=ind)

    def schedule_to_patterns(schedule, fallback_ind=None):
        """
        Convert a full schedule[nurse][day] back into pattern-based representation.
        AL nurses always get ["AL-FULL"]. Falls back to original patterns on failure.
        """
        new_ind = []

        for n in range(NUM_NURSES):
            if n in AL_NURSES:
                new_ind.append(["AL-FULL"])
                continue

            days = schedule[n]
            patterns = []
            i = 0
            ok = True

            while i < NUM_DAYS:
                # Try longest patterns first
                if i + 3 <= NUM_DAYS and days[i:i+3] == [NIGHT, NIGHT, OFF]:
                    patterns.append("N-N-OFF")
                    i += 3
                elif i + 2 <= NUM_DAYS and days[i:i+2] == [NIGHT, OFF]:
                    patterns.append("N-OFF")
                    i += 2
                elif days[i] == NIGHT:
                    if i == NUM_DAYS - 2 and i + 2 <= NUM_DAYS and days[i + 1] == NIGHT:
                        patterns.append("N-N-END")
                        i += 2
                    elif i == NUM_DAYS - 1:
                        patterns.append("N-END")
                        i += 1
                    else:
                        ok = False
                        break
                elif days[i] == AM:
                    patterns.append("AM")
                    i += 1
                elif days[i] == PM:
                    patterns.append("PM")
                    i += 1
                elif days[i] == OFF:
                    patterns.append("OFF")
                    i += 1
                else:
                    ok = False
                    break

            # Final safety check
            if not ok or sum(len(PATTERNS[p]) for p in patterns) != NUM_DAYS:
                if fallback_ind is not None:
                    patterns = fallback_ind[n]
                else:
                    patterns = gen_pattern_sequence_for_nurse()

            new_ind.append(patterns)

        return new_ind

    def local_search(ind, steps=40):
        """Hill-climbing with three neighbourhood moves over working nurses only."""
        # FIX 3: shallow copy instead of deepcopy
        best = [list(nurse) for nurse in ind]
        best_score = evaluate(best)
        sched = expand_individual(best)

        for _ in range(steps):
            move = random.choice(["intra_swap", "inter_swap", "shift_move"])

            if move == "intra_swap":
                n = random.choice(WORKING_NURSES)
                d1, d2 = random.sample(range(NUM_DAYS), 2)
                if sched[n][d1] == sched[n][d2]:
                    continue
                sched[n][d1], sched[n][d2] = sched[n][d2], sched[n][d1]
                trial = schedule_to_patterns(sched)
                trial = repair_individual(trial)
                score = evaluate(trial)
                if score < best_score:
                    best = trial
                    best_score = score
                    sched = expand_individual(best)
                else:
                    # FIX 4: revert swap in-place instead of re-expanding from best
                    sched[n][d1], sched[n][d2] = sched[n][d2], sched[n][d1]

            elif move == "inter_swap":
                n1, n2 = random.sample(WORKING_NURSES, 2)
                d = random.randrange(NUM_DAYS)
                if sched[n1][d] == sched[n2][d]:
                    continue
                sched[n1][d], sched[n2][d] = sched[n2][d], sched[n1][d]
                trial = schedule_to_patterns(sched)
                trial = repair_individual(trial)
                score = evaluate(trial)
                if score < best_score:
                    best = trial
                    best_score = score
                    sched = expand_individual(best)
                else:
                    # FIX 4: revert in-place
                    sched[n1][d], sched[n2][d] = sched[n2][d], sched[n1][d]

            else:  # shift_move
                d = random.randrange(NUM_DAYS)
                # FIX 2: use per-day targets
                targets = shift_targets[d]
                counts = {
                    s: sum(1 for n in WORKING_NURSES if sched[n][d] == s)
                    for s in [AM, PM, NIGHT]
                }
                surplus = [s for s in [AM, PM, NIGHT] if counts[s] > targets.get(s, 0)]
                deficit = [s for s in [AM, PM, NIGHT] if counts[s] < targets.get(s, 0)]
                if not surplus or not deficit:
                    continue
                s_from = random.choice(surplus)
                s_to   = random.choice(deficit)
                candidates = [n for n in WORKING_NURSES if sched[n][d] == s_from]
                if not candidates:
                    continue
                n = random.choice(candidates)
                old_shift = sched[n][d]
                sched[n][d] = s_to
                trial = schedule_to_patterns(sched)
                trial = repair_individual(trial)
                score = evaluate(trial)
                if score < best_score:
                    best = trial
                    best_score = score
                    sched = expand_individual(best)
                else:
                    # FIX 4: revert in-place
                    sched[n][d] = old_shift

        return best

    def optimize_shift_variance(ind, steps=120):
        """
        Targeted post-processing: pick the worst-variance day and try all
        pairwise working-nurse swaps on that day, keeping any improvement.
        """
        # FIX 3: shallow copy instead of deepcopy
        best = [list(nurse) for nurse in ind]
        best_score = evaluate(best)

        for _ in range(steps):
            sched = expand_individual(best)
            # FIX 2: use per-day targets
            d = max(
                range(NUM_DAYS),
                key=lambda d: sum(
                    abs(sum(1 for n in WORKING_NURSES if sched[n][d] == s) - shift_targets[d].get(s, 0))
                    for s in [AM, PM, NIGHT]
                )
            )
            improved = False
            for n1 in WORKING_NURSES:
                for n2 in WORKING_NURSES:
                    if n1 == n2 or sched[n1][d] == sched[n2][d]:
                        continue
                    sched[n1][d], sched[n2][d] = sched[n2][d], sched[n1][d]
                    trial = schedule_to_patterns(sched, fallback_ind=best)
                    trial = repair_individual(trial)
                    score = evaluate(trial)
                    if score < best_score:
                        best = trial
                        best_score = score
                        improved = True
                        break
                    sched[n1][d], sched[n2][d] = sched[n2][d], sched[n1][d]
                if improved:
                    break

        return best

    def expand_pattern_list(pattern_list):
        """Given a list of pattern names for one nurse, expand to shift codes (length NUM_DAYS)."""
        shifts = []
        for p in pattern_list:
            shifts.extend(PATTERNS[p])
        return shifts

    def gen_pattern_sequence_for_nurse():
        """
        Generate a feasible 14-day pattern sequence using ONLY:
        "N-N-OFF", "N-OFF", "OFF", "AM", "PM"

        Guarantees:
        - Exactly 14 days
        - Exactly 4 OFF days
        - 2-4 total nights
        """
        patterns = []
        days_used = 0
        off_count = 0

        # ---- Step 1: Choose total nights (2–4) ----
        nights_target = random.choice([2, 3, 4])
        nights_remaining = nights_target

        # ---- Step 2: Insert night blocks ----
        while nights_remaining > 0:
            # If exactly 1 day left and 1 night remaining
            if days_used == 13 and nights_remaining == 1:
                patterns.append("N-END")
                days_used += 1
                nights_remaining -= 1
                # FIX 5: continue prevents fall-through into the if/else below
                # which would append an extra pattern when nights_remaining is now 0.
                continue
            # Prefer double-night blocks when possible
            if nights_remaining >= 2 and random.random() < 0.5:
                patterns.append("N-N-OFF")
                days_used += 3
                off_count += 1
                nights_remaining -= 2
            else:
                patterns.append("N-OFF")
                days_used += 2
                off_count += 1
                nights_remaining -= 1

        # ---- Step 3: Ensure exactly 4 OFF total ----
        while off_count < 4:
            patterns.append("OFF")
            days_used += 1
            off_count += 1

        # ---- Step 4: Fill remaining days with AM/PM ----
        while days_used < NUM_DAYS:
            shift = random.choice(["AM", "PM"])
            patterns.append(shift)
            days_used += 1

        # ---- Step 5: If overshoot (rare edge case), regenerate ----
        if days_used != NUM_DAYS:
            return gen_pattern_sequence_for_nurse()

        random.shuffle(patterns)
        return patterns

    def create_individual():
        """Create an individual: list (for nurses) of pattern lists. AL nurses get AL-FULL."""
        return [
            ["AL-FULL"] if n in AL_NURSES else gen_pattern_sequence_for_nurse()
            for n in range(NUM_NURSES)
        ]

    def expand_individual(ind):
        """Expand individual (pattern-lists) to schedule matrix: schedule[nurse][day] -> shift code."""
        schedule = [expand_pattern_list(ind[n]) for n in range(NUM_NURSES)]
        for seq in schedule:
            if len(seq) != NUM_DAYS:
                raise ValueError("Expanded sequence length mismatch")
        return schedule

    # ===================== FITNESS =====================

    weekend_days = (5, 6, 12, 13)
    weekday_days = tuple(d for d in range(NUM_DAYS) if d not in weekend_days and d != NUM_DAYS)
    avg_min = 0.0
    if weekday_days:
        avg_min = sum(
            (DEMAND[d][s]["A"] + DEMAND[d][s]["B"] + DEMAND[d][s]["C"])
            for d in weekday_days
            for s in [AM, PM, NIGHT]
        ) / (len(weekday_days) * 3)

    max_shift_code = max(list(SHIFT_HOURS.keys()) + [AL])
    shift_hours_by_code = [0.0] * (max_shift_code + 1)
    for code in range(max_shift_code + 1):
        shift_hours_by_code[code] = float(SHIFT_HOURS.get(code, 0))

    approved_req_sets = tuple(set(reqs) for reqs in APPROVED_REQUESTS)
    pending_req_sets  = tuple(set(reqs) for reqs in PENDING_REQUESTS)
    hard_req_sets     = tuple(set(reqs) for reqs in HARD_REQUESTS)

    ctx = GAContext(
        num_days=NUM_DAYS,
        num_nurses=NUM_NURSES,
        off=OFF,
        am=AM,
        pm=PM,
        night=NIGHT,
        patterns=PATTERNS,
        shift_hours=SHIFT_HOURS,
        nurse_ranks=NURSE_RANKS,
        demand=DEMAND,
        approved_requests=APPROVED_REQUESTS,
        pending_requests=PENDING_REQUESTS,
        hard_requests=HARD_REQUESTS,
        min_hours=MIN_HOURS,
        max_hours=MAX_HOURS,
        hard_pen_shift=HARD_PEN_SHIFT,
        hard_pen_hour=HARD_PEN_HOUR,
        hard_pen_dayoff=HARD_PEN_DAYOFF,
        hard_pen_ndo=HARD_PEN_NDO,
        hard_pen_nights=HARD_PEN_NIGHTS,
        soft_w_approved_request=SOFT_W_APPROVED_REQUEST,
        soft_w_pending_request=SOFT_W_PENDING_REQUEST,
        soft_w_night_fair=SOFT_W_NIGHT_FAIR,
        soft_w_weekend_fair=SOFT_W_WEEKEND_FAIR,
        soft_w_weekday_pref=SOFT_W_WEEKDAY_PREF,
        soft_w_morning_pref=SOFT_W_MORNING_PREF,
        soft_w_daily_balance=SOFT_W_DAILY_BALANCE,
        soft_w_overtime=SOFT_W_OVERTIME,
        al_nurses=AL_NURSES,
        working_nurses=tuple(WORKING_NURSES),
        hard_pen_al=HARD_PEN_AL,
        weekend_days=weekend_days,
        weekday_days=weekday_days,
        avg_min=avg_min,
        shift_hours_by_code=tuple(shift_hours_by_code),
        approved_req_sets=approved_req_sets,
        pending_req_sets=pending_req_sets,
        hard_req_sets=hard_req_sets,
    )

    def evaluate(individual):
        return evaluate_individual(individual, ctx)

    # ===================== REPAIR & VALIDATION =====================

    def repair_individual(ind):
        """
        Ensure each nurse's pattern-list expands exactly to NUM_DAYS.
        AL nurses are always locked to ["AL-FULL"].
        """
        # FIX 6: shallow copy (list of lists of immutable strings) instead of deepcopy
        ind2 = [list(nurse) for nurse in ind]
        for n in range(NUM_NURSES):
            if n in AL_NURSES:
                ind2[n] = ["AL-FULL"]
            elif len(expand_pattern_list(ind2[n])) != NUM_DAYS:
                ind2[n] = gen_pattern_sequence_for_nurse()
        return ind2

    def repair_coverage(ind):
        """
        Repair coverage deficits by reassigning OFF nurses
        (or low-impact shifts) to required shifts.
        """
        schedule = expand_individual(ind)

        for d in range(14):
            for shift in [AM, PM, NIGHT]:

                available = {'A': 0, 'B': 0, 'C': 0}
                for n in range(NUM_NURSES):
                    if schedule[n][d] == shift:
                        available[NURSE_RANKS[n]] += 1

                req = DEMAND[d][shift]
                deficit = {
                    r: max(0, req[r] - available[r])
                    for r in ['A', 'B', 'C']
                }

                for rank in ['A', 'B', 'C']:
                    while deficit[rank] > 0:

                        if rank == 'A':
                            candidate_ranks = ['A']
                        elif rank == 'B':
                            candidate_ranks = ['B', 'A']
                        else:
                            candidate_ranks = ['C', 'B', 'A']

                        assigned = False

                        for n in range(NUM_NURSES):
                            if NURSE_RANKS[n] not in candidate_ranks:
                                continue
                            if schedule[n][d] == OFF:
                                if shift != NIGHT:
                                    if d > 0 and schedule[n][d-1] == NIGHT:
                                        continue
                                    if d < 13 and schedule[n][d+1] == NIGHT:
                                        continue
                                schedule[n][d] = shift
                                deficit[rank] -= 1
                                assigned = True
                                break

                        if not assigned:
                            for n in range(NUM_NURSES):
                                if NURSE_RANKS[n] not in candidate_ranks:
                                    continue
                                if schedule[n][d] in [AM, PM] and shift == NIGHT:
                                    schedule[n][d] = NIGHT
                                    deficit[rank] -= 1
                                    assigned = True
                                    break

                        if not assigned:
                            break

        return schedule_to_patterns(schedule, fallback_ind=ind)

    def repair_shift_variance(ind):
        """Move nurses from surplus shifts to deficit shifts to reduce day-to-day variance."""
        schedule = expand_individual(ind)
        for d in range(NUM_DAYS):
            # FIX 2: per-day targets
            targets = shift_targets[d]
            counts  = {s: sum(1 for n in WORKING_NURSES if schedule[n][d] == s) for s in [AM, PM, NIGHT]}
            surplus = [s for s in [AM, PM, NIGHT] if counts[s] > targets.get(s, 0)]
            deficit = [s for s in [AM, PM, NIGHT] if counts[s] < targets.get(s, 0)]
            for s_sur in surplus:
                for s_def in deficit:
                    while counts[s_sur] > targets.get(s_sur, 0) and counts[s_def] < targets.get(s_def, 0):
                        candidates = [
                            n for n in WORKING_NURSES
                            if schedule[n][d] == s_sur
                            and (s_def != NIGHT or (d == 0 or schedule[n][d - 1] != NIGHT))
                        ]
                        if not candidates:
                            break
                        n = random.choice(candidates)
                        schedule[n][d] = s_def
                        counts[s_sur] -= 1
                        counts[s_def] += 1
        return schedule_to_patterns(schedule, fallback_ind=ind)

    def repair_shift_balance(ind):
        """Rebalance AM/PM surplus per day to match shift targets."""
        schedule = expand_individual(ind)
        for d in range(NUM_DAYS):
            # FIX 2: per-day targets moved inside the loop
            am_target = shift_targets[d].get(AM, 0)
            pm_target = shift_targets[d].get(PM, 0)
            am_count = sum(1 for n in WORKING_NURSES if schedule[n][d] == AM)
            pm_count = sum(1 for n in WORKING_NURSES if schedule[n][d] == PM)
            while am_count > am_target + 1 and pm_count < pm_target:
                cands = [n for n in WORKING_NURSES
                         if schedule[n][d] == AM and (d == 0 or schedule[n][d - 1] != OFF)]
                if not cands:
                    break
                n = random.choice(cands)
                schedule[n][d] = PM
                am_count -= 1; pm_count += 1
            while pm_count > pm_target + 1 and am_count < am_target:
                cands = [n for n in WORKING_NURSES
                         if schedule[n][d] == PM and (d == 0 or schedule[n][d - 1] != OFF)]
                if not cands:
                    break
                n = random.choice(cands)
                schedule[n][d] = AM
                pm_count -= 1; am_count += 1
        return schedule_to_patterns(schedule, fallback_ind=ind)

    def repair_night_coverage(ind):
        """Ensure each working nurse has 1–2 nights per week."""
        schedule = expand_individual(ind)
        for week_start, week_end in [(0, 7), (7, 14)]:
            week = range(week_start, min(week_end, NUM_DAYS))
            for n in WORKING_NURSES:
                nc = sum(1 for d in week if schedule[n][d] == NIGHT)
                if nc < 1:
                    candidates = [
                        d for d in week
                        if schedule[n][d] in [AM, PM]
                        and d + 1 < NUM_DAYS
                        and schedule[n][d + 1] == OFF
                    ]
                    if candidates:
                        schedule[n][random.choice(candidates)] = NIGHT
                elif nc > 2:
                    night_days = [d for d in week if schedule[n][d] == NIGHT]
                    for d in reversed(night_days[2:]):
                        if d == 0 or schedule[n][d - 1] != NIGHT:
                            schedule[n][d] = AM
                            break
        return schedule_to_patterns(schedule, fallback_ind=ind)

    def repair_rank_coverage(ind):
        """Ensure B-rank nurses fill B-required slots where possible."""
        schedule = expand_individual(ind)

        def working_hours(n):
            return sum(SHIFT_HOURS.get(schedule[n][d], 0) for d in range(NUM_DAYS))

        for d in range(NUM_DAYS):
            for shift in [AM, PM, NIGHT]:
                if shift not in DEMAND[d]:
                    continue
                b_needed  = DEMAND[d][shift].get('B', 0)
                b_present = sum(1 for n in WORKING_NURSES if schedule[n][d] == shift and NURSE_RANKS[n] == 'B')
                if b_present >= b_needed:
                    continue
                a_on_shift   = [n for n in WORKING_NURSES if schedule[n][d] == shift and NURSE_RANKS[n] == 'A']
                other_shifts = [s for s in [AM, PM, NIGHT] if s != shift]
                b_elsewhere  = [n for n in WORKING_NURSES if schedule[n][d] in other_shifts and NURSE_RANKS[n] == 'B']
                while b_present < b_needed and a_on_shift and b_elsewhere:
                    a = a_on_shift.pop(); b = b_elsewhere.pop()
                    b_shift = schedule[b][d]
                    if shift == NIGHT:
                        if d > 0 and schedule[b][d - 1] == NIGHT: continue
                        if d < NUM_DAYS - 1 and schedule[b][d + 1] not in [NIGHT, OFF]: continue
                    if b_shift == NIGHT:
                        if d > 0 and schedule[a][d - 1] == NIGHT: continue
                        if d < NUM_DAYS - 1 and schedule[a][d + 1] not in [NIGHT, OFF]: continue
                    schedule[a][d] = b_shift
                    schedule[b][d] = shift
                    b_present += 1
                if b_present < b_needed:
                    b_off = [n for n in WORKING_NURSES if schedule[n][d] == OFF and NURSE_RANKS[n] == 'B']
                    for b in b_off:
                        if b_present >= b_needed: break
                        if working_hours(b) + SHIFT_HOURS.get(shift, 0) > MAX_HOURS: continue
                        if shift != NIGHT:
                            if d > 0 and schedule[b][d - 1] == NIGHT: continue
                            if d < NUM_DAYS - 1 and schedule[b][d + 1] == NIGHT: continue
                        if a_on_shift:
                            a = a_on_shift[-1]
                            if working_hours(a) - SHIFT_HOURS.get(shift, 0) >= MIN_HOURS:
                                schedule[a][d] = OFF
                                a_on_shift.pop()
                        schedule[b][d] = shift
                        b_present += 1
        return schedule_to_patterns(schedule, fallback_ind=ind)

    # FIX 7: combined repair chain — single expand + convert cycle replaces the
    # previous 4–5 sequential expand/convert calls per child per generation.
    def apply_schedule_repairs(ind, *, shift_balance=False, rank_coverage=True,
                               night_coverage=True, coverage=True, shift_variance=False):
        """Apply multiple schedule-level repairs with a single expand/convert cycle."""
        schedule = expand_individual(ind)

        if shift_balance:
            for d in range(NUM_DAYS):
                am_target = shift_targets[d].get(AM, 0)
                pm_target = shift_targets[d].get(PM, 0)
                am_count = sum(1 for n in WORKING_NURSES if schedule[n][d] == AM)
                pm_count = sum(1 for n in WORKING_NURSES if schedule[n][d] == PM)
                while am_count > am_target + 1 and pm_count < pm_target:
                    cands = [n for n in WORKING_NURSES
                             if schedule[n][d] == AM and (d == 0 or schedule[n][d - 1] != OFF)]
                    if not cands:
                        break
                    n = random.choice(cands)
                    schedule[n][d] = PM
                    am_count -= 1; pm_count += 1
                while pm_count > pm_target + 1 and am_count < am_target:
                    cands = [n for n in WORKING_NURSES
                             if schedule[n][d] == PM and (d == 0 or schedule[n][d - 1] != OFF)]
                    if not cands:
                        break
                    n = random.choice(cands)
                    schedule[n][d] = AM
                    pm_count -= 1; am_count += 1

        if rank_coverage:
            def _working_hours(n):
                return sum(SHIFT_HOURS.get(schedule[n][d], 0) for d in range(NUM_DAYS))

            for d in range(NUM_DAYS):
                for shift in [AM, PM, NIGHT]:
                    if shift not in DEMAND[d]:
                        continue
                    b_needed  = DEMAND[d][shift].get('B', 0)
                    b_present = sum(1 for n in WORKING_NURSES if schedule[n][d] == shift and NURSE_RANKS[n] == 'B')
                    if b_present >= b_needed:
                        continue
                    a_on_shift   = [n for n in WORKING_NURSES if schedule[n][d] == shift and NURSE_RANKS[n] == 'A']
                    other_shifts = [s for s in [AM, PM, NIGHT] if s != shift]
                    b_elsewhere  = [n for n in WORKING_NURSES if schedule[n][d] in other_shifts and NURSE_RANKS[n] == 'B']
                    while b_present < b_needed and a_on_shift and b_elsewhere:
                        a = a_on_shift.pop(); b = b_elsewhere.pop()
                        b_shift = schedule[b][d]
                        if shift == NIGHT:
                            if d > 0 and schedule[b][d - 1] == NIGHT: continue
                            if d < NUM_DAYS - 1 and schedule[b][d + 1] not in [NIGHT, OFF]: continue
                        if b_shift == NIGHT:
                            if d > 0 and schedule[a][d - 1] == NIGHT: continue
                            if d < NUM_DAYS - 1 and schedule[a][d + 1] not in [NIGHT, OFF]: continue
                        schedule[a][d] = b_shift
                        schedule[b][d] = shift
                        b_present += 1
                    if b_present < b_needed:
                        b_off = [n for n in WORKING_NURSES if schedule[n][d] == OFF and NURSE_RANKS[n] == 'B']
                        for b in b_off:
                            if b_present >= b_needed: break
                            if _working_hours(b) + SHIFT_HOURS.get(shift, 0) > MAX_HOURS: continue
                            if shift != NIGHT:
                                if d > 0 and schedule[b][d - 1] == NIGHT: continue
                                if d < NUM_DAYS - 1 and schedule[b][d + 1] == NIGHT: continue
                            if a_on_shift:
                                a = a_on_shift[-1]
                                if _working_hours(a) - SHIFT_HOURS.get(shift, 0) >= MIN_HOURS:
                                    schedule[a][d] = OFF
                                    a_on_shift.pop()
                            schedule[b][d] = shift
                            b_present += 1

        if night_coverage:
            for week_start, week_end in [(0, 7), (7, 14)]:
                week = range(week_start, min(week_end, NUM_DAYS))
                for n in WORKING_NURSES:
                    nc = sum(1 for d in week if schedule[n][d] == NIGHT)
                    if nc < 1:
                        candidates = [
                            d for d in week
                            if schedule[n][d] in [AM, PM]
                            and d + 1 < NUM_DAYS
                            and schedule[n][d + 1] == OFF
                        ]
                        if candidates:
                            schedule[n][random.choice(candidates)] = NIGHT
                    elif nc > 2:
                        night_days = [d for d in week if schedule[n][d] == NIGHT]
                        for d in reversed(night_days[2:]):
                            if d == 0 or schedule[n][d - 1] != NIGHT:
                                schedule[n][d] = AM
                                break

        if coverage:
            for d in range(14):
                for shift in [AM, PM, NIGHT]:
                    available = {'A': 0, 'B': 0, 'C': 0}
                    for n in range(NUM_NURSES):
                        if schedule[n][d] == shift:
                            available[NURSE_RANKS[n]] += 1
                    req = DEMAND[d][shift]
                    deficit = {r: max(0, req[r] - available[r]) for r in ['A', 'B', 'C']}
                    for rank in ['A', 'B', 'C']:
                        while deficit[rank] > 0:
                            candidate_ranks = (['A'] if rank == 'A'
                                               else ['B', 'A'] if rank == 'B'
                                               else ['C', 'B', 'A'])
                            assigned = False
                            for n in range(NUM_NURSES):
                                if NURSE_RANKS[n] not in candidate_ranks:
                                    continue
                                if schedule[n][d] == OFF:
                                    if shift != NIGHT:
                                        if d > 0 and schedule[n][d-1] == NIGHT:
                                            continue
                                        if d < 13 and schedule[n][d+1] == NIGHT:
                                            continue
                                    schedule[n][d] = shift
                                    deficit[rank] -= 1
                                    assigned = True
                                    break
                            if not assigned:
                                for n in range(NUM_NURSES):
                                    if NURSE_RANKS[n] not in candidate_ranks:
                                        continue
                                    if schedule[n][d] in [AM, PM] and shift == NIGHT:
                                        schedule[n][d] = NIGHT
                                        deficit[rank] -= 1
                                        assigned = True
                                        break
                            if not assigned:
                                break

        if shift_variance:
            for d in range(NUM_DAYS):
                targets = shift_targets[d]
                counts  = {s: sum(1 for n in WORKING_NURSES if schedule[n][d] == s) for s in [AM, PM, NIGHT]}
                surplus = [s for s in [AM, PM, NIGHT] if counts[s] > targets.get(s, 0)]
                deficit = [s for s in [AM, PM, NIGHT] if counts[s] < targets.get(s, 0)]
                for s_sur in surplus:
                    for s_def in deficit:
                        while counts[s_sur] > targets.get(s_sur, 0) and counts[s_def] < targets.get(s_def, 0):
                            candidates = [
                                n for n in WORKING_NURSES
                                if schedule[n][d] == s_sur
                                and (s_def != NIGHT or (d == 0 or schedule[n][d - 1] != NIGHT))
                            ]
                            if not candidates:
                                break
                            n = random.choice(candidates)
                            schedule[n][d] = s_def
                            counts[s_sur] -= 1
                            counts[s_def] += 1

        return schedule_to_patterns(schedule, fallback_ind=ind)

    # ===================== OPERATORS =====================

    # FIX 8: nurse_penalty now uses precomputed sets (O(1) lookup) instead of lists (O(N))
    def nurse_penalty(schedule, nurse_id):
        pen = 0
        req_a = approved_req_sets[nurse_id]
        req_p = pending_req_sets[nurse_id]
        for d in range(NUM_DAYS):
            s = schedule[nurse_id][d]
            if (d, s) in req_a:
                pen -= SOFT_W_APPROVED_REQUEST
            elif (d, s) in req_p:
                pen -= SOFT_W_PENDING_REQUEST
        return pen

    def tournament(pop, scores, k=TOURNAMENT_K):
        indices = random.sample(range(len(pop)), k)
        best_idx = min(indices, key=lambda i: scores[i])
        return [list(nurse) for nurse in pop[best_idx]]

    def _fix_end_patterns(pats):
        """Ensure N-END / N-N-END only appear at the final position."""
        last = len(pats) - 1
        for i, p in enumerate(pats):
            if i == last:
                break
            if p == "N-END":
                pats[i] = "OFF"
            elif p == "N-N-END":
                pats[i] = "N-N-OFF"

    def demand_guided_mutation(ind):
        """Move a nurse from a surplus shift to a deficit shift on the worst-covered day."""
        # FIX 6: repair_individual makes a shallow copy internally; no extra deepcopy needed
        ind = repair_individual(ind)
        schedule = expand_individual(ind)

        # FIX 2: per-day targets
        day_scores = [
            sum(
                abs(sum(1 for n in WORKING_NURSES if schedule[n][d] == s) - shift_targets[d].get(s, 0))
                for s in [AM, PM, NIGHT]
            )
            for d in range(NUM_DAYS)
        ]
        d = int(np.argmax(day_scores))
        counts = {s: sum(1 for n in WORKING_NURSES if schedule[n][d] == s) for s in [AM, PM, NIGHT]}
        deficit = [s for s in [AM, PM, NIGHT] if counts[s] < shift_targets[d].get(s, 0)]
        surplus = [s for s in [AM, PM, NIGHT] if counts[s] > shift_targets[d].get(s, 0)]
        if not deficit or not surplus:
            return ind
        s_to   = random.choice(deficit)
        s_from = random.choice(surplus)
        cands = [n for n in WORKING_NURSES if schedule[n][d] == s_from and NURSE_RANKS[n] in (DEMAND[d].get(s_to, {}))]
        if not cands:
            cands = [n for n in WORKING_NURSES if schedule[n][d] == s_from]
        if not cands:
            return ind
        schedule[random.choice(cands)][d] = s_to
        return repair_individual(schedule_to_patterns(schedule, fallback_ind=ind))

    def off_to_am_targeted_mutation(ind):
        """Convert an AM that follows an OFF to PM to reduce OFF→AM transitions."""
        schedule = expand_individual(ind)
        n = random.choice(WORKING_NURSES)
        for d in range(NUM_DAYS - 1):
            if schedule[n][d] == OFF and schedule[n][d + 1] == AM:
                schedule[n][d + 1] = PM
                break
        return schedule_to_patterns(schedule, fallback_ind=ind)

    def crossover(parent1, parent2):
        """
        Coverage-aware per-nurse crossover.
        AL nurses always carry ["AL-FULL"] unchanged.
        Length correction uses WORKING_PATTERNS only.
        """
        child = []

        sched1 = expand_individual(parent1)
        sched2 = expand_individual(parent2)

        for n in range(NUM_NURSES):
            if n in AL_NURSES:
                child.append(["AL-FULL"])
                continue

            p1 = parent1[n]
            p2 = parent2[n]

            score1 = nurse_penalty(sched1, n)
            score2 = nurse_penalty(sched2, n)

            if random.random() < 0.7:
                # FIX 6: list() shallow copy instead of deepcopy
                newp = list(p1 if score1 <= score2 else p2)
            elif random.random() < CROSSOVER_RATE and len(p1) > 1 and len(p2) > 1:
                cut1 = random.randint(1, len(p1) - 1)
                cut2 = random.randint(1, len(p2) - 1)
                newp = p1[:cut1] + p2[cut2:]
                # FIX 9: N-END/N-N-END can land mid-sequence after splice —
                # fix before length correction to avoid discarding spliced genes.
                _fix_end_patterns(newp)
            else:
                # FIX 6: list() shallow copy instead of deepcopy
                newp = list(random.choice([p1, p2]))

            exp_len = sum(len(PATTERNS[q]) for q in newp)
            while newp and exp_len > NUM_DAYS:
                newp.pop()
                exp_len = sum(len(PATTERNS[q]) for q in newp)
            choices = [p for p in WORKING_PATTERNS if len(PATTERNS[p]) <= (NUM_DAYS - exp_len)]
            while exp_len < NUM_DAYS and choices:
                pick = random.choice(choices)
                newp.append(pick)
                exp_len = sum(len(PATTERNS[q]) for q in newp)
                choices = [p for p in WORKING_PATTERNS if len(PATTERNS[p]) <= (NUM_DAYS - exp_len)]

            child.append(newp)

        return repair_individual(child)

    def mutate(ind, mutation_rate):
        """Per-nurse mutation. AL nurses are preserved unchanged."""
        # FIX 6: shallow copy instead of deepcopy
        ind2 = [list(nurse) for nurse in ind]
        for n in range(NUM_NURSES):
            if n in AL_NURSES:
                ind2[n] = ["AL-FULL"]
                continue
            if random.random() >= mutation_rate:
                continue

            t = random.choices(
                ['replace_pattern', 'swap_pattern', 'delete_pattern', 'regenerate', 'demand_fix'],
                weights=[0.45, 0.20, 0.15, 0.05, 0.15],
            )[0]
            pats = ind2[n]

            if t == 'regenerate' or not pats:
                ind2[n] = gen_pattern_sequence_for_nurse()
                continue

            if t == 'replace_pattern':
                idx = random.randrange(len(pats))
                old_len = len(PATTERNS[pats[idx]])
                same_len = [p for p in WORKING_PATTERNS if len(PATTERNS[p]) == old_len]
                pats[idx] = random.choice(same_len) if same_len else random.choice(WORKING_PATTERNS)
                exp_len = sum(len(PATTERNS[q]) for q in pats)
                while exp_len > NUM_DAYS and pats:
                    pats.pop(random.randrange(len(pats)))
                    exp_len = sum(len(PATTERNS[q]) for q in pats)
                _fix_end_patterns(pats)
                while exp_len < NUM_DAYS:
                    cands = [p for p in WORKING_PATTERNS if len(PATTERNS[p]) <= NUM_DAYS - exp_len]
                    if not cands:
                        break
                    pats.append(random.choice(cands))
                    exp_len = sum(len(PATTERNS[q]) for q in pats)
                _fix_end_patterns(pats)

            elif t == 'swap_pattern' and len(pats) >= 2:
                i, j = random.sample(range(len(pats)), 2)
                pats[i], pats[j] = pats[j], pats[i]
                _fix_end_patterns(pats)

            elif t == 'delete_pattern' and len(pats) > 1:
                pats.pop(random.randrange(len(pats)))
                exp_len = sum(len(PATTERNS[q]) for q in pats)
                while exp_len < NUM_DAYS:
                    choices = [p for p in WORKING_PATTERNS if len(PATTERNS[p]) <= NUM_DAYS - exp_len]
                    if not choices:
                        break
                    pats.append(random.choice(choices))
                    exp_len = sum(len(PATTERNS[q]) for q in pats)
                _fix_end_patterns(pats)

            elif t == 'demand_fix':
                ind2 = demand_guided_mutation(ind2)

            ind2[n] = pats

        return repair_individual(ind2)

    # ===================== GA MAIN LOOP =====================
    generations = GENERATIONS
    pop_size = POP_SIZE
    executor = None
    try:
        if worker_count > 1:
            executor = ProcessPoolExecutor(
                max_workers=worker_count,
                initializer=_init_worker,
                initargs=(ctx,),
            )

        # init population
        pop = [create_individual() for _ in range(pop_size)]
        scores = _score_population(pop, ctx, executor, worker_count)

        best_idx = min(range(len(scores)), key=lambda i: scores[i])
        # FIX 6: shallow copy instead of deepcopy
        best = [list(nurse) for nurse in pop[best_idx]]
        best_score = scores[best_idx]
        last_improve_gen = 0

        mutation_rate = BASE_MUTATION_RATE

        print(f"Init best penalty: {best_score:.2f}")

        if AL_NURSES:
            al_labels = ", ".join(f"N{n+1}({NURSE_RANKS[n]})" for n in sorted(AL_NURSES))
            print(f"AL nurses (locked): {al_labels}")

        for gen in range(generations):
            gens_since_improve = gen - last_improve_gen
            if gens_since_improve >= PLATEAU_GENS:
                mutation_rate = min(MAX_MUTATION_RATE,
                                    BASE_MUTATION_RATE * (1 + gens_since_improve / PLATEAU_GENS))
            else:
                mutation_rate = BASE_MUTATION_RATE
            rank_idx = sorted(range(len(pop)), key=lambda i: scores[i])
            new_pop = []

            # Elitism: copy and repair top ELITISM individuals
            for e in range(ELITISM):
                # FIX 6: shallow copy instead of deepcopy
                elite = [list(nurse) for nurse in pop[rank_idx[e]]]
                # FIX 7: single expand/convert for the elite repair chain
                elite = apply_schedule_repairs(
                    elite,
                    shift_balance=random.random() < 0.3,
                    rank_coverage=True,
                    night_coverage=True,
                    coverage=False,
                    shift_variance=random.random() < 0.4,
                )
                elite = repair_individual(elite)
                if gen > 70 and gen % 15 == 0:
                    elite = local_search(elite)
                new_pop.append(elite)

            # Build rest of population
            while len(new_pop) < pop_size:
                p1 = tournament(pop, scores)
                p2 = tournament(pop, scores)
                child = crossover(p1, p2)
                child = mutate(child, mutation_rate)

                swap_prob = PATTERN_SWAP_PROB + (
                    (PATTERN_SWAP_MAX - PATTERN_SWAP_PROB) / (1 + np.exp(-0.2 * (gen - 149)))
                )
                if random.random() < swap_prob:
                    child = pattern_swap_mutation(child)
                    child = repair_individual(child)

                if random.random() < REBALANCE_PROB:
                    child = rebalance_night_blocks(child)

                if random.random() < 0.2:
                    child = off_to_am_targeted_mutation(child)
                child = repair_individual(child)

                # FIX 7: single expand/convert for all terminal schedule repairs
                child = apply_schedule_repairs(
                    child,
                    shift_balance=random.random() < 0.2,
                    rank_coverage=random.random() < 0.6,
                    night_coverage=True,
                    coverage=True,
                    shift_variance=random.random() < 0.5,
                )
                child = repair_individual(child)
                new_pop.append(child)

            pop = new_pop
            scores = _score_population(pop, ctx, executor, worker_count)
            gen_best_idx = min(range(len(scores)), key=lambda i: scores[i])
            gen_best_score = scores[gen_best_idx]

            # Immigration: inject fresh individuals when stagnant
            if gens_since_improve > 50 and gen % 50 == 0:
                n_immigrants = max(1, pop_size // 10)
                for i in range(n_immigrants):
                    immigrant = create_individual()
                    # FIX 7: single expand/convert for immigrant repairs
                    immigrant = apply_schedule_repairs(
                        immigrant,
                        rank_coverage=True,
                        night_coverage=True,
                        coverage=True,
                    )
                    immigrant = repair_individual(immigrant)
                    pop[rank_idx[-(i + 1)]] = immigrant
                    scores[rank_idx[-(i + 1)]] = evaluate(immigrant)

            if gen_best_score < best_score:
                if (best_score - gen_best_score) > 1:
                    last_improve_gen = gen
                best_score = gen_best_score
                # FIX 6: shallow copy instead of deepcopy
                best = [list(nurse) for nurse in pop[gen_best_idx]]

            if gen % 25 == 0 or gen == generations - 1:
                print(
                    f"Gen {gen:4d} "
                    f"gen_best={gen_best_score:.2f} "
                    f"best_so_far={best_score:.2f} "
                    f"mut={mutation_rate:.2f}"
                )
                if progress_callback:
                    progress_callback(gen, generations, best_score)

            if best_score == 0:
                break

        # Aggressive post-processing
        best = optimize_shift_variance(best, steps=150)
        best = local_search(best, steps=100)
        best = optimize_shift_variance(best, steps=100)
        best_score = evaluate(best)

        return best, best_score
    finally:
        if executor is not None:
            executor.shutdown(wait=True)

OFF, AM, PM, NIGHT, _AL = 0, 1, 2, 3, _AL_CODE
SHIFT_LABEL = {
    OFF:   "OFF",
    AM:    "AM",
    PM:    "PM",
    NIGHT: "NIGHT",
    _AL:   "AL",
}
PATTERNS_MAP = {
    "AM":      [AM],
    "PM":      [PM],
    "OFF":     [OFF],
    "N-OFF":   [NIGHT, OFF],
    "N-N-OFF": [NIGHT, NIGHT, OFF],
    "N-END":   [NIGHT],
    "N-N-END": [NIGHT, NIGHT],
}


def expand_individual_simple(individual, num_days=14):
    """
    Flatten the pattern-based representation into a daily schedule.
    AL-FULL patterns expand to [AL_CODE] * num_days.
    """
    expanded_schedule = []
    al_pattern = [_AL_CODE] * num_days
    for nurse_pattern_list in individual:
        if nurse_pattern_list == ["AL-FULL"]:
            expanded_schedule.append(al_pattern[:num_days])
            continue
        full_shifts = []
        for p_name in nurse_pattern_list:
            if p_name == "AL-FULL":
                full_shifts.extend([_AL_CODE] * num_days)
            else:
                full_shifts.extend(PATTERNS_MAP.get(p_name, [OFF]))
        expanded_schedule.append(full_shifts[:num_days])
    return expanded_schedule


def format_output(nurses, individual, nurse_names, nurse_ranks, num_days, penalty,
                  leave_overlay=None):
    """Convert GA individual to standardized JSON output. AL nurses get 'AL' schedule.

    leave_overlay: optional {nurse_name: {day_idx: original_leave_code}} used to
    restore specific leave types (HOL, MC, etc.) in the output schedule.
    """
    schedule_codes = expand_individual_simple(individual, num_days)
    name_to_nurse = {n["name"]: n for n in nurses}
    output_nurses = []

    for idx, nurse_name in enumerate(nurse_names):
        if nurse_name not in name_to_nurse:
            continue
        nurse_info = name_to_nurse[nurse_name]
        nurse_codes = schedule_codes[idx] if idx < len(schedule_codes) else [OFF] * num_days
        schedule_names = [SHIFT_LABEL.get(code, "OFF") for code in nurse_codes]

        # Restore original leave types from the overlay (e.g. HOL, MC instead of AL)
        if leave_overlay:
            for day_idx, leave_code in (leave_overlay.get(nurse_name) or {}).items():
                if 0 <= day_idx < num_days:
                    schedule_names[day_idx] = leave_code

        # Alternate DO/RD pattern: every 2nd OFF becomes RD
        off_count = 0
        for i, code in enumerate(schedule_names):
            if code == "OFF":
                off_count += 1
                if off_count % 2 == 0:
                    schedule_names[i] = "RD"

        _leave_labels = _LEAVE_CODES | {"AL"}
        stats = {
            "total_shifts": sum(1 for s in schedule_names if s not in ("OFF", "RD") and s not in _leave_labels),
            "am_shifts":    schedule_names.count("AM"),
            "pm_shifts":    schedule_names.count("PM"),
            "night_shifts": schedule_names.count("NIGHT"),
            "days_off":     schedule_names.count("OFF") + schedule_names.count("RD"),
            "al_days":      sum(1 for s in schedule_names if s in _leave_labels),
        }

        output_nurses.append({
            "id":       nurse_info["id"],
            "name":     nurse_info["name"],
            "rank":     nurse_info["rank"],
            "schedule": schedule_names,
            "stats":    stats,
        })

    output_nurses.sort(key=lambda x: x["id"])

    return {
        "nurses": output_nurses,
        "metadata": {
            "num_days":      num_days,
            "num_nurses":    len(output_nurses),
            "algorithm":     "GA",
            "penalty_score": penalty,
        },
    }
