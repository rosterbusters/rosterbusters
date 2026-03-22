"""
Pattern-based Genetic Algorithm for Nurse Rostering  (V2)
==========================================================
Algorithm : Experimental GA V2 engine
            — AL (Annual Leave) support via AL-FULL pattern
            — WORKING_NURSES optimisation (AL nurses skipped in all inner loops)
            — Rich repair pipeline, demand-guided mutation, adaptive mutation,
              local search helpers, aggressive post-processing
Interface  : Compatible with algo_scheduler.py via run_ga_pipeline()

Annual Leave design
───────────────────
AL nurses are identified from the request list passed by the scheduler.
Any nurse whose requests include (day, "AL") for every single day in the
roster period is treated as fully on leave.  Their individual is locked to
["AL-FULL"] throughout the run.  The fitness function enforces this via a
hard_al_violation penalty so the unified penalty framework is preserved —
operators are never structurally blocked, just heavily penalised.

Entry point
───────────
    run_ga_pipeline(nurses, shifts, hard_requests, soft_requests,
                    prev_last_shift, non_working_shift_codes,
                    progress_callback, shift_hours)

All GA state lives in module-level globals overwritten by run_ga_pipeline()
before each run, so helper functions can call each other freely without
closure nesting.
"""

import random
from copy import deepcopy
import numpy as np

# ===================== SHIFT CODES =====================
OFF   = 0
AM    = 1
PM    = 2
NIGHT = 3
AL    = 4          # Annual Leave — full period only

SHIFT_LABEL        = {OFF: "DO", AM: "A ", PM: "P ", NIGHT: "N ", AL: "AL"}
SHIFT_HOURS        = {OFF: 0, AM: 8, PM: 8, NIGHT: 10, AL: 0}
SHIFT_CODE_TO_NAME = {OFF: "OFF", AM: "AM", PM: "PM", NIGHT: "NIGHT", AL: "AL"}
SHIFT_NAME_TO_CODE = {"AM": AM, "PM": PM, "NIGHT": NIGHT, "OFF": OFF, "AL": AL}

# ===================== PATTERNS =====================
# AL-FULL is rebuilt with the correct NUM_DAYS in _build_runtime_state().
PATTERNS = {
    "AM":      [AM],
    "PM":      [PM],
    "OFF":     [OFF],
    "N-OFF":   [NIGHT, OFF],
    "N-N-OFF": [NIGHT, NIGHT, OFF],
    "N-END":   [NIGHT],           # single night ending the fortnight
    "N-N-END": [NIGHT, NIGHT],    # two nights ending the fortnight
    "AL-FULL": [AL] * 14,         # rebuilt in _build_runtime_state()
}
PATTERN_NAMES    = list(PATTERNS.keys())
WORKING_PATTERNS = [p for p in PATTERN_NAMES if p != "AL-FULL"]

RANKS     = ["A", "B", "C"]
_RANK_MAP = {'A': 0, 'B': 1, 'C': 2}

# ===================== GA HYPERPARAMETERS =====================
POP_SIZE           = 336
GENERATIONS        = 1000
TOURNAMENT_K       = 2
CROSSOVER_RATE     = 0.7
REBALANCE_PROB     = 0.4
PATTERN_SWAP_PROB  = 0.3
PATTERN_SWAP_MAX   = 0.6
BASE_MUTATION_RATE = 0.2
MAX_MUTATION_RATE  = 0.7
PLATEAU_GENS       = 10
ELITISM            = 3

MIN_HOURS = 84
MAX_HOURS = 88

# Hard-constraint penalty weights
HARD_PEN_NDO    = 999_999   # DO missing after last roster trailing night
HARD_PEN_SHIFT  = 150_000   # uncovered required shift slot
HARD_PEN_HOUR   = 100_000   # hours outside [MIN_HOURS, MAX_HOURS]
HARD_PEN_DAYOFF = 160_000   # fewer than 2 days off per week
HARD_PEN_NIGHTS =  80_000   # <1 or >2 nights per week per nurse
HARD_PEN_AL     = 1_000_000 # per AL day not honoured

# Soft-constraint penalty weights
SOFT_W_REQUEST                =    50
SOFT_W_NIGHT_FAIR             =     5
SOFT_W_WEEKEND_FAIR           =     5
SOFT_W_WEEKDAY_PREF           =     8
SOFT_W_MORNING_PREF           =     4
SOFT_W_DAILY_BALANCE          =    50
SOFT_W_OVERTIME               =   200
SOFT_W_RANK_MISMATCH          = 40_000
SOFT_W_OFF_TO_AM              =   500
SOFT_W_WEEKDAY_SHIFT_VARIANCE =   185
SOFT_W_AM_PM_BALANCE          =   200

# ===================== RUNTIME STATE =====================
# All globals below are overwritten by run_ga_pipeline() before each run.
# Defaults allow the __main__ block to work without calling run_ga_pipeline().

NUM_DAYS       = 14
NUM_NURSES     = 28
NURSE_RANKS    = ['A'] * 12 + ['B'] * 11 + ['C'] * 5
WEEKEND_DAYS   = [5, 6, 12, 13]

DEMAND         : list      = []          # DEMAND[day][shift_code] = {'A':int,'B':int,'C':int}
NURSE_REQUESTS : list      = []          # NURSE_REQUESTS[n] = [(day, shift_code), ...]
HARD_REQUESTS  : list      = []          # carry-over DO requests from previous roster

AL_NURSES      : frozenset = frozenset() # nurse indices on full-period Annual Leave
WORKING_NURSES : list      = []          # all nurse indices NOT in AL_NURSES

# Precomputed fast-lookup tables (rebuilt by _build_runtime_state)
_fitness_cache            : dict = {}
_SHIFT_HOURS_ARR          = np.array([SHIFT_HOURS[s] for s in range(5)], dtype=np.int32)
_RANK_IDX                 = np.zeros(NUM_NURSES, dtype=np.int8)
_REQUEST_SHIFT            = np.full((NUM_NURSES, NUM_DAYS), -1, dtype=np.int8)
_WEEKDAY_MASK             = np.ones(NUM_DAYS, dtype=bool)
_SHIFT_TARGETS            : dict = {}    # {shift_code: total_required_per_day}
_NURSE_CANDIDATES_BY_RANK : dict = {}    # {rank: rank-sorted WORKING_NURSES}


def _build_runtime_state() -> None:
    """
    Rebuild all derived data structures after the module-level globals have
    been updated.  Must be called once inside run_ga_pipeline().
    """
    global _SHIFT_HOURS_ARR, _RANK_IDX, _REQUEST_SHIFT
    global _WEEKDAY_MASK, _SHIFT_TARGETS, _NURSE_CANDIDATES_BY_RANK

    # Rebuild AL-FULL with the correct NUM_DAYS
    PATTERNS["AL-FULL"] = [AL] * NUM_DAYS

    _SHIFT_HOURS_ARR = np.array([SHIFT_HOURS[s] for s in range(5)], dtype=np.int32)
    _RANK_IDX        = np.array([_RANK_MAP[r] for r in NURSE_RANKS], dtype=np.int8)

    _REQUEST_SHIFT = np.full((NUM_NURSES, NUM_DAYS), -1, dtype=np.int8)
    for n_ in range(NUM_NURSES):
        for (d_, s_) in NURSE_REQUESTS[n_]:
            if d_ < NUM_DAYS:
                _REQUEST_SHIFT[n_, d_] = s_

    _WEEKDAY_MASK = np.array([d not in WEEKEND_DAYS for d in range(NUM_DAYS)], dtype=bool)

    if DEMAND:
        _SHIFT_TARGETS = {
            shift: sum(DEMAND[0][shift].get(r, 0) for r in ['A', 'B', 'C'])
            for shift in [AM, PM, NIGHT]
            if shift in DEMAND[0]
        }
    else:
        _SHIFT_TARGETS = {AM: 0, PM: 0, NIGHT: 0}

    _NURSE_CANDIDATES_BY_RANK = {
        rank: sorted(WORKING_NURSES, key=lambda n: (0 if NURSE_RANKS[n] == rank else 1))
        for rank in ['A', 'B', 'C']
    }


# ===================== CHROMOSOME UTILITIES =====================

def expand_pattern_list(pattern_list: list) -> list:
    shifts = []
    for p in pattern_list:
        shifts.extend(PATTERNS[p])
    return shifts


def expand_individual(ind: list) -> list:
    schedule = [expand_pattern_list(ind[n]) for n in range(NUM_NURSES)]
    for seq in schedule:
        if len(seq) != NUM_DAYS:
            raise ValueError(f"Expanded sequence length {len(seq)} != {NUM_DAYS}")
    return schedule


def gen_pattern_sequence_for_nurse() -> list:
    """
    Generate a feasible working pattern sequence (no AL).

    Guarantees: exactly NUM_DAYS days, 2-4 nights, 4 days off,
    all nights followed by OFF except at fortnight end (N-END/N-N-END).
    """
    patterns         = []
    days_used        = 0
    off_count        = 0
    nights_target    = random.choice([2, 3, 4])
    nights_remaining = nights_target

    while nights_remaining > 0:
        if days_used == NUM_DAYS - 1 and nights_remaining == 1:
            patterns.append("N-END"); days_used += 1; nights_remaining -= 1; break
        if days_used == NUM_DAYS - 2 and nights_remaining == 2:
            patterns.append("N-N-END"); days_used += 2; nights_remaining -= 2; break
        if nights_remaining >= 2 and random.random() < 0.5:
            patterns.append("N-N-OFF"); days_used += 3; off_count += 1; nights_remaining -= 2
        else:
            patterns.append("N-OFF");   days_used += 2; off_count += 1; nights_remaining -= 1

    while off_count < 4 and days_used < NUM_DAYS:
        patterns.append("OFF"); days_used += 1; off_count += 1

    while days_used < NUM_DAYS:
        patterns.append(random.choice(["AM", "PM"])); days_used += 1

    if days_used != NUM_DAYS:
        return gen_pattern_sequence_for_nurse()

    random.shuffle(patterns)
    return patterns


def create_individual() -> list:
    return [
        ["AL-FULL"] if n in AL_NURSES else gen_pattern_sequence_for_nurse()
        for n in range(NUM_NURSES)
    ]


def schedule_to_patterns(schedule: list, fallback_ind: list = None) -> list:
    new_ind = []

    for n in range(NUM_NURSES):
        if n in AL_NURSES:
            new_ind.append(["AL-FULL"])
            continue

        days     = schedule[n]
        patterns = []
        i        = 0
        ok       = True

        while i < NUM_DAYS:
            if days[i] == AL:
                ok = False; break
            elif i + 3 <= NUM_DAYS and days[i:i+3] == [NIGHT, NIGHT, OFF]:
                patterns.append("N-N-OFF"); i += 3
            elif i + 2 <= NUM_DAYS and days[i:i+2] == [NIGHT, OFF]:
                patterns.append("N-OFF");   i += 2
            elif days[i] == NIGHT:
                if i == NUM_DAYS - 2 and i + 2 <= NUM_DAYS and days[i + 1] == NIGHT:
                    patterns.append("N-N-END"); i += 2
                elif i == NUM_DAYS - 1:
                    patterns.append("N-END"); i += 1
                else:
                    ok = False; break
            elif days[i] == AM:
                patterns.append("AM"); i += 1
            elif days[i] == PM:
                patterns.append("PM"); i += 1
            elif days[i] == OFF:
                patterns.append("OFF"); i += 1
            else:
                ok = False; break

        if not ok or sum(len(PATTERNS[p]) for p in patterns) != NUM_DAYS:
            patterns = (
                fallback_ind[n]
                if fallback_ind is not None
                else gen_pattern_sequence_for_nurse()
            )
        new_ind.append(patterns)

    return new_ind


def _fix_end_patterns(pats: list) -> None:
    last = len(pats) - 1
    for i, p in enumerate(pats):
        if i == last:
            break
        if p == "N-END":
            pats[i] = "OFF"
        elif p == "N-N-END":
            pats[i] = "N-N-OFF"


# ===================== FITNESS =====================

def evaluate_components(individual: list) -> dict:
    """
    Compute every penalty component.  All inner loops use WORKING_NURSES.
    AL nurses are excluded from every calculation except hard_al_violation.
    """
    schedule     = expand_individual(individual)
    weekday_days = [d for d in range(NUM_DAYS) if d not in WEEKEND_DAYS]

    c = {
        "hard_al_violation":     0.0,
        "hard_ndo":              0.0,
        "hard_shift_coverage":   0.0,
        "hard_hours":            0.0,
        "hard_days_off":         0.0,
        "hard_nights_weekly":    0.0,
        "soft_rank_mismatch":    0.0,
        "soft_requests":         0.0,
        "soft_night_fairness":   0.0,
        "soft_weekend_fairness": 0.0,
        "soft_weekday_coverage": 0.0,
        "soft_daily_balance":    0.0,
        "soft_morning_pref":     0.0,
        "soft_overtime":         0.0,
        "soft_off_to_am":        0.0,
        "soft_shift_variance":   0.0,
        "soft_am_pm_balance":    0.0,
    }

    # 0a) AL violation
    for n in AL_NURSES:
        for d in range(NUM_DAYS):
            if schedule[n][d] != AL:
                c["hard_al_violation"] += HARD_PEN_AL

    # 0b) System-injected carry-over DO requests
    for n in range(NUM_NURSES):
        for (d, s) in HARD_REQUESTS[n]:
            if d < NUM_DAYS and schedule[n][d] != s:
                c["hard_ndo"] += HARD_PEN_NDO

    # 1) Shift coverage + rank-substitution mismatch
    for d in range(NUM_DAYS):
        for shift in [AM, PM, NIGHT]:
            available = {'A': 0, 'B': 0, 'C': 0}
            for n in WORKING_NURSES:
                if schedule[n][d] == shift:
                    available[NURSE_RANKS[n]] += 1

            req        = DEMAND[d][shift]
            remaining  = available.copy()
            subs_count = 0

            used_A_for_A   = min(remaining['A'], req['A'])
            remaining['A'] -= used_A_for_A
            missing_A       = req['A'] - used_A_for_A

            needed_B       = req['B']
            used_B_for_B   = min(remaining['B'], needed_B)
            remaining['B'] -= used_B_for_B
            needed_B       -= used_B_for_B
            used_A_for_B   = min(remaining['A'], needed_B)
            remaining['A'] -= used_A_for_B
            needed_B       -= used_A_for_B
            subs_count     += used_A_for_B
            missing_B       = needed_B

            needed_C       = req['C']
            used_C_for_C   = min(remaining['C'], needed_C)
            remaining['C'] -= used_C_for_C
            needed_C       -= used_C_for_C
            used_B_for_C   = min(remaining['B'], needed_C)
            remaining['B'] -= used_B_for_C
            needed_C       -= used_B_for_C
            subs_count     += used_B_for_C
            used_A_for_C   = min(remaining['A'], needed_C)
            remaining['A'] -= used_A_for_C
            needed_C       -= used_A_for_C
            subs_count     += used_A_for_C
            missing_C       = needed_C

            c["hard_shift_coverage"] += (missing_A + missing_B + missing_C) * HARD_PEN_SHIFT
            c["soft_rank_mismatch"]  += subs_count * SOFT_W_RANK_MISMATCH

    # 2) Hours per working nurse
    hours_per_nurse = []
    for n in WORKING_NURSES:
        h = sum(SHIFT_HOURS[s] for s in schedule[n])
        hours_per_nurse.append(h)
        if h < MIN_HOURS:
            c["hard_hours"] += (MIN_HOURS - h) * HARD_PEN_HOUR * 1.2
        elif h > MAX_HOURS:
            c["hard_hours"] += (h - MAX_HOURS) * HARD_PEN_HOUR * 0.8

    # 3) Days off per week
    for n in WORKING_NURSES:
        for week in (range(0, 7), range(7, 14)):
            offs = sum(1 for d in week if schedule[n][d] == OFF)
            if offs < 2:
                c["hard_days_off"] += (2 - offs) * HARD_PEN_DAYOFF
            elif offs > 2:
                c["hard_days_off"] += (offs - 2) * 0.9 * HARD_PEN_DAYOFF

    # 4) Nights per week
    for n in WORKING_NURSES:
        for week in (range(0, 7), range(7, 14)):
            nc = sum(1 for d in week if schedule[n][d] == NIGHT)
            if nc < 1:
                c["hard_nights_weekly"] += (1 - nc) * HARD_PEN_NIGHTS * 0.8
            elif nc > 2:
                c["hard_nights_weekly"] += (nc - 2) * HARD_PEN_NIGHTS

    # 5) Shift requests
    for n in WORKING_NURSES:
        for (d, s) in NURSE_REQUESTS[n]:
            if d < NUM_DAYS and schedule[n][d] != s:
                c["soft_requests"] += SOFT_W_REQUEST

    # 6) Night-count fairness
    night_counts = [
        sum(1 for d in range(NUM_DAYS) if schedule[n][d] == NIGHT)
        for n in WORKING_NURSES
    ]
    c["soft_night_fairness"] = (max(night_counts) - min(night_counts)) * SOFT_W_NIGHT_FAIR

    # 7) Weekend working fairness
    weekend_counts = [
        sum(1 for d in WEEKEND_DAYS if schedule[n][d] != OFF)
        for n in WORKING_NURSES
    ]
    c["soft_weekend_fairness"] = (
        (max(weekend_counts) - min(weekend_counts)) * SOFT_W_WEEKEND_FAIR
    )

    # 8) Weekday coverage + daily balance
    daily_totals = [
        sum(1 for n in WORKING_NURSES if schedule[n][d] != OFF)
        for d in range(NUM_DAYS)
    ]
    if weekday_days:
        avg_min = sum(
            DEMAND[d][s]['A'] + DEMAND[d][s]['B'] + DEMAND[d][s]['C']
            for d in weekday_days for s in [AM, PM, NIGHT]
        ) / (len(weekday_days) * 3)
        avg_cov = sum(daily_totals[d] for d in weekday_days) / len(weekday_days)
        if avg_cov < avg_min:
            c["soft_weekday_coverage"] += (avg_min - avg_cov) * SOFT_W_WEEKDAY_PREF * 5
    c["soft_daily_balance"] = (max(daily_totals) - min(daily_totals)) * SOFT_W_DAILY_BALANCE

    # 9) Morning preference (reward AM shifts)
    am_count = sum(
        1 for n in WORKING_NURSES for d in range(NUM_DAYS) if schedule[n][d] == AM
    )
    c["soft_morning_pref"] = -am_count * SOFT_W_MORNING_PREF * 0.05

    # 10) Overtime
    for h in hours_per_nurse:
        if h > MAX_HOURS:
            c["soft_overtime"] += (h - MAX_HOURS) * SOFT_W_OVERTIME

    # 11) OFF → AM transitions
    for n in WORKING_NURSES:
        for d in range(NUM_DAYS - 1):
            if schedule[n][d] == OFF and schedule[n][d + 1] == AM:
                c["soft_off_to_am"] += SOFT_W_OFF_TO_AM

    # 12a) Day-to-day shift-count variance (mean-centred squared deviation)
    for shift in [AM, PM, NIGHT]:
        counts     = [
            sum(1 for n in WORKING_NURSES if schedule[n][d] == shift)
            for d in range(NUM_DAYS)
        ]
        mean_count = sum(counts) / NUM_DAYS
        c["soft_shift_variance"] += (
            sum((cnt - mean_count) ** 2 for cnt in counts)
            * SOFT_W_WEEKDAY_SHIFT_VARIANCE
        )

    # 12b) Within-day AM/PM balance (squared penalty beyond ±2 gap)
    pen = 0
    for d in range(NUM_DAYS):
        am_d = sum(1 for n in WORKING_NURSES if schedule[n][d] == AM)
        pm_d = sum(1 for n in WORKING_NURSES if schedule[n][d] == PM)
        diff = abs(am_d - pm_d)
        if diff > 2:
            pen += (diff - 2) ** 2 * SOFT_W_AM_PM_BALANCE
    c["soft_am_pm_balance"] = pen

    return c


def evaluate(individual: list) -> float:
    return sum(evaluate_components(individual).values())


def _ind_key(ind: list) -> tuple:
    return tuple(tuple(p) for p in ind)


def evaluate_cached(ind: list) -> float:
    key = _ind_key(ind)
    if key not in _fitness_cache:
        _fitness_cache[key] = evaluate(ind)
    return _fitness_cache[key]


# ===================== REPAIR FUNCTIONS =====================

def repair_individual(ind: list) -> list:
    ind2 = deepcopy(ind)
    for n in range(NUM_NURSES):
        if n in AL_NURSES:
            ind2[n] = ["AL-FULL"]
        elif len(expand_pattern_list(ind2[n])) != NUM_DAYS:
            ind2[n] = gen_pattern_sequence_for_nurse()
    return ind2


def repair_coverage(ind: list) -> list:
    """
    Fill shift-coverage deficits by re-assigning working nurses.
    Uses precomputed _NURSE_CANDIDATES_BY_RANK for efficiency.
    """
    schedule = expand_individual(ind)

    for d in range(NUM_DAYS):
        for shift in [AM, PM, NIGHT]:
            available = {'A': 0, 'B': 0, 'C': 0}
            for n in WORKING_NURSES:
                if schedule[n][d] == shift:
                    available[NURSE_RANKS[n]] += 1

            req     = DEMAND[d][shift]
            deficit = {r: max(0, req[r] - available[r]) for r in ['A', 'B', 'C']}

            for rank in ['A', 'B', 'C']:
                candidate_ranks  = (
                    ['A'] if rank == 'A' else
                    ['B', 'A'] if rank == 'B' else
                    ['C', 'B', 'A']
                )
                nurse_candidates = _NURSE_CANDIDATES_BY_RANK[rank]

                while deficit[rank] > 0:
                    assigned = False

                    # For AM: try flipping PM nurses first (avoids new OFF→AM)
                    if shift == AM:
                        for n in nurse_candidates:
                            if deficit[rank] <= 0:
                                break
                            if NURSE_RANKS[n] not in candidate_ranks:
                                continue
                            if schedule[n][d] != PM:
                                continue
                            if d > 0 and schedule[n][d - 1] in [NIGHT, OFF]:
                                continue
                            schedule[n][d] = AM
                            deficit[rank] -= 1
                            assigned = True

                    # Draw from OFF nurses
                    if not assigned:
                        for n in nurse_candidates:
                            if NURSE_RANKS[n] not in candidate_ranks:
                                continue
                            if schedule[n][d] != OFF:
                                continue
                            if shift != NIGHT:
                                if d > 0 and schedule[n][d - 1] == NIGHT:
                                    continue
                                if d < NUM_DAYS - 1 and schedule[n][d + 1] == NIGHT:
                                    continue
                            schedule[n][d] = shift
                            deficit[rank] -= 1
                            assigned = True
                            break

                    # Last resort: convert AM/PM to NIGHT
                    if not assigned:
                        for n in nurse_candidates:
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


def repair_shift_variance(ind: list) -> list:
    schedule = expand_individual(ind)

    for d in range(NUM_DAYS):
        targets = {s: _SHIFT_TARGETS.get(s, 0) for s in [AM, PM, NIGHT]}
        counts  = {
            s: sum(1 for n in WORKING_NURSES if schedule[n][d] == s)
            for s in [AM, PM, NIGHT]
        }
        surplus = [s for s in [AM, PM, NIGHT] if counts[s] > targets[s]]
        deficit = [s for s in [AM, PM, NIGHT] if counts[s] < targets[s]]

        for s_sur in surplus:
            for s_def in deficit:
                while counts[s_sur] > targets[s_sur] and counts[s_def] < targets[s_def]:
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


def repair_shift_balance(ind: list) -> list:
    schedule  = expand_individual(ind)
    am_target = _SHIFT_TARGETS.get(AM, 0)
    pm_target = _SHIFT_TARGETS.get(PM, 0)

    for d in range(NUM_DAYS):
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


def repair_night_coverage(ind: list) -> list:
    schedule = expand_individual(ind)

    for week_start, week_end in [(0, 7), (7, 14)]:
        week = range(week_start, week_end)
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


def repair_rank_coverage(ind: list) -> list:
    schedule = expand_individual(ind)

    def working_hours(n):
        return sum(SHIFT_HOURS[schedule[n][d]] for d in range(NUM_DAYS))

    for d in range(NUM_DAYS):
        for shift in [AM, PM, NIGHT]:
            b_needed  = DEMAND[d][shift]['B']
            b_present = sum(
                1 for n in WORKING_NURSES
                if schedule[n][d] == shift and NURSE_RANKS[n] == 'B'
            )
            if b_present >= b_needed:
                continue

            a_on_shift  = [n for n in WORKING_NURSES
                           if schedule[n][d] == shift and NURSE_RANKS[n] == 'A']
            other_shifts = [s for s in [AM, PM, NIGHT] if s != shift]
            b_elsewhere  = [n for n in WORKING_NURSES
                            if schedule[n][d] in other_shifts and NURSE_RANKS[n] == 'B']

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
                b_off = [n for n in WORKING_NURSES
                         if schedule[n][d] == OFF and NURSE_RANKS[n] == 'B']
                for b in b_off:
                    if b_present >= b_needed: break
                    if working_hours(b) + SHIFT_HOURS[shift] > MAX_HOURS: continue
                    if shift != NIGHT:
                        if d > 0 and schedule[b][d - 1] == NIGHT: continue
                        if d < NUM_DAYS - 1 and schedule[b][d + 1] == NIGHT: continue
                    if a_on_shift:
                        a = a_on_shift[-1]
                        if working_hours(a) - SHIFT_HOURS[shift] >= MIN_HOURS:
                            schedule[a][d] = OFF
                            a_on_shift.pop()
                    schedule[b][d] = shift
                    b_present += 1

    return schedule_to_patterns(schedule, fallback_ind=ind)


# ===================== LOCAL SEARCH =====================

def local_search(ind: list, steps: int = 40) -> list:
    """Hill-climbing with three neighbourhood moves over working nurses only."""
    best       = deepcopy(ind)
    best_score = evaluate_cached(best)
    sched      = expand_individual(best)

    for _ in range(steps):
        move = random.choice(["intra_swap", "inter_swap", "shift_move"])

        if move == "intra_swap":
            n      = random.choice(WORKING_NURSES)
            d1, d2 = random.sample(range(NUM_DAYS), 2)
            if sched[n][d1] != sched[n][d2]:
                sched[n][d1], sched[n][d2] = sched[n][d2], sched[n][d1]

        elif move == "inter_swap":
            n1, n2 = random.sample(WORKING_NURSES, 2)
            d      = random.randrange(NUM_DAYS)
            if sched[n1][d] != sched[n2][d]:
                sched[n1][d], sched[n2][d] = sched[n2][d], sched[n1][d]

        else:
            d = random.randrange(NUM_DAYS)

            targets = {
                AM:    sum(DEMAND[d][AM][r]    for r in ['A', 'B', 'C']),
                PM:    sum(DEMAND[d][PM][r]    for r in ['A', 'B', 'C']),
                NIGHT: sum(DEMAND[d][NIGHT][r] for r in ['A', 'B', 'C']),
            }

            counts = {
                s: sum(1 for n in WORKING_NURSES if sched[n][d] == s)  # ← was range(NUM_NURSES)
                for s in [AM, PM, NIGHT]
            }

            surplus = [s for s in [AM, PM, NIGHT] if counts[s] > targets[s]]
            deficit = [s for s in [AM, PM, NIGHT] if counts[s] < targets[s]]

            if surplus and deficit:
                s_from = random.choice(surplus)
                s_to   = random.choice(deficit)

                candidates = [n for n in WORKING_NURSES if sched[n][d] == s_from]  # ← was range(NUM_NURSES)

                if candidates:
                    sched[random.choice(candidates)][d] = s_to

        trial = schedule_to_patterns(sched)
        trial = repair_individual(trial)
        score = evaluate_cached(trial)

        if score < best_score:
            best       = trial
            best_score = score
            sched      = expand_individual(best)
        else:
            sched = expand_individual(best)

    return best


def optimize_shift_variance(ind: list, steps: int = 120) -> list:
    """
    Targeted post-processing: pick the worst-variance day and try all
    pairwise working-nurse swaps on that day, keeping any improvement.
    """
    best       = deepcopy(ind)
    best_score = evaluate_cached(best)

    for _ in range(steps):
        sched = expand_individual(best)
        d = max(
            range(NUM_DAYS),
            key=lambda d: sum(
                abs(
                    sum(1 for n in WORKING_NURSES if sched[n][d] == s)
                    - _SHIFT_TARGETS.get(s, 0)
                )
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
                score = evaluate_cached(trial)
                if score < best_score:
                    best       = trial
                    best_score = score
                    improved   = True
                    break
                sched[n1][d], sched[n2][d] = sched[n2][d], sched[n1][d]
            if improved:
                break

    return best


# ===================== MUTATION / DIVERSIFICATION OPERATORS =====================

def demand_guided_mutation(ind: list) -> list:
    ind      = repair_individual(deepcopy(ind))
    schedule = expand_individual(ind)

    day_scores = [
        sum(
            abs(
                sum(1 for n in WORKING_NURSES if schedule[n][d] == s)
                - _SHIFT_TARGETS.get(s, 0)
            )
            for s in [AM, PM, NIGHT]
        )
        for d in range(NUM_DAYS)
    ]

    d      = int(np.argmax(day_scores))
    counts = {
        s: sum(1 for n in WORKING_NURSES if schedule[n][d] == s)
        for s in [AM, PM, NIGHT]
    }
    deficit = [s for s in [AM, PM, NIGHT] if counts[s] < _SHIFT_TARGETS.get(s, 0)]
    surplus = [s for s in [AM, PM, NIGHT] if counts[s] > _SHIFT_TARGETS.get(s, 0)]

    if not deficit or not surplus:
        return ind

    s_to  = random.choice(deficit)
    s_from = random.choice(surplus)
    cands  = [
        n for n in WORKING_NURSES
        if schedule[n][d] == s_from and NURSE_RANKS[n] in DEMAND[d][s_to]
    ]
    if not cands:
        return ind

    schedule[random.choice(cands)][d] = s_to
    return repair_individual(schedule_to_patterns(schedule, fallback_ind=ind))


def off_to_am_targeted_mutation(ind: list) -> list:
    schedule = expand_individual(ind)
    n = random.choice(WORKING_NURSES)
    for d in range(NUM_DAYS - 1):
        if schedule[n][d] == OFF and schedule[n][d + 1] == AM:
            schedule[n][d + 1] = PM
            break
    return schedule_to_patterns(schedule, fallback_ind=ind)


def pattern_swap_mutation(ind: list) -> list:
    n1, n2 = random.sample(WORKING_NURSES, 2)
    p1     = random.randrange(len(ind[n1]))
    p2     = random.randrange(len(ind[n2]))
    ind[n1][p1], ind[n2][p2] = ind[n2][p2], ind[n1][p1]
    return ind

def extract_night_blocks(schedule: list, nurse: int) -> list:
    blocks = []
    d = 0
    while d < NUM_DAYS:
        if schedule[nurse][d] == NIGHT:
            start = d
            while d < NUM_DAYS and schedule[nurse][d] == NIGHT:
                d += 1
            if d < NUM_DAYS and schedule[nurse][d] == OFF:
                blocks.append((start, d))
        d += 1
    return blocks


def rebalance_night_blocks(ind: list) -> list:
    schedule = expand_individual(ind)

    for week_start in [0, 7]:
        week_end = week_start + 7
        night_counts = [
            sum(1 for d in range(week_start, week_end) if schedule[n][d] == NIGHT)
            for n in WORKING_NURSES
        ]
        heavy = [WORKING_NURSES[i] for i, c in enumerate(night_counts) if c > 2]
        light = [WORKING_NURSES[i] for i, c in enumerate(night_counts) if c < 1]
        random.shuffle(heavy)
        random.shuffle(light)

        for src in heavy:
            blocks = extract_night_blocks(schedule, src)
            for start, end in blocks:
                if not (week_start <= start < week_end):
                    continue
                for dst in light:
                    if all(schedule[dst][d] == OFF for d in range(start, end)):
                        for d in range(start, end):
                            schedule[src][d] = OFF
                            schedule[dst][d] = NIGHT if d < end - 1 else OFF
                        break

    return schedule_to_patterns(schedule, fallback_ind=ind)


def mutate(ind: list, mutation_rate: float) -> list:
    """
    Per-nurse mutation (working nurses only).
    AL nurses always receive ["AL-FULL"] unchanged.
    """
    ind2 = deepcopy(ind)

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
            idx      = random.randrange(len(pats))
            old_len  = len(PATTERNS[pats[idx]])
            same     = [p for p in WORKING_PATTERNS if len(PATTERNS[p]) == old_len]
            pats[idx] = random.choice(same) if same else random.choice(WORKING_PATTERNS)
            exp_len  = sum(len(PATTERNS[q]) for q in pats)
            while exp_len > NUM_DAYS and pats:
                pats.pop(random.randrange(len(pats)))
                exp_len = sum(len(PATTERNS[q]) for q in pats)
            _fix_end_patterns(pats)
            while exp_len < NUM_DAYS:
                cands = [p for p in WORKING_PATTERNS if len(PATTERNS[p]) <= NUM_DAYS - exp_len]
                if not cands: break
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
                cands = [p for p in WORKING_PATTERNS if len(PATTERNS[p]) <= NUM_DAYS - exp_len]
                if not cands: break
                pats.append(random.choice(cands))
                exp_len = sum(len(PATTERNS[q]) for q in pats)
            _fix_end_patterns(pats)

        elif t == 'demand_fix':
            ind2 = demand_guided_mutation(ind2)

        ind2[n] = pats

    return repair_individual(ind2)


# ===================== SELECTION & CROSSOVER =====================

def _nurse_penalty(schedule: list, nurse_id: int) -> float:
    pen = 0.0
    for (d, s) in NURSE_REQUESTS[nurse_id]:
        if d < NUM_DAYS and schedule[nurse_id][d] == s:
            pen -= SOFT_W_REQUEST
    return pen


def tournament(pop: list, k: int = TOURNAMENT_K) -> list:
    picks = random.sample(pop, k)
    return deepcopy(min(picks, key=evaluate_cached))


def crossover(parent1: list, parent2: list, cr: float = CROSSOVER_RATE) -> list:
    """
    Coverage-aware per-nurse crossover.
    AL nurses: always carry ["AL-FULL"] unchanged.
    Length correction uses WORKING_PATTERNS only (never AL-FULL).
    """
    child  = []
    sched1 = expand_individual(parent1)
    sched2 = expand_individual(parent2)

    for n in range(NUM_NURSES):
        if n in AL_NURSES:
            child.append(["AL-FULL"])
            continue

        p1, p2 = parent1[n], parent2[n]
        s1     = _nurse_penalty(sched1, n)
        s2     = _nurse_penalty(sched2, n)

        if random.random() < 0.7:
            newp = deepcopy(p1 if s1 <= s2 else p2)
        elif random.random() < cr and len(p1) > 1 and len(p2) > 1:
            cut1 = random.randint(1, len(p1) - 1)
            cut2 = random.randint(1, len(p2) - 1)
            newp = p1[:cut1] + p2[cut2:]
        else:
            newp = deepcopy(random.choice([p1, p2]))

        exp_len = sum(len(PATTERNS[q]) for q in newp)
        while newp and exp_len > NUM_DAYS:
            newp.pop()
            exp_len = sum(len(PATTERNS[q]) for q in newp)
        choices = [p for p in WORKING_PATTERNS if len(PATTERNS[p]) <= NUM_DAYS - exp_len]
        while exp_len < NUM_DAYS and choices:
            pick    = random.choice(choices)
            newp.append(pick)
            exp_len = sum(len(PATTERNS[q]) for q in newp)
            choices = [p for p in WORKING_PATTERNS if len(PATTERNS[p]) <= NUM_DAYS - exp_len]

        child.append(newp)

    return repair_individual(child)


# ===================== GA MAIN LOOP =====================

def run_ga(progress_callback=None) -> tuple:
    """
    Run the genetic algorithm.  Reads configuration from module-level globals.
    Returns (best_individual, best_penalty_score).
    """
    pop    = [create_individual() for _ in range(POP_SIZE)]
    scores = [evaluate_cached(ind) for ind in pop]

    best_idx         = min(range(len(scores)), key=lambda i: scores[i])
    best             = deepcopy(pop[best_idx])
    best_score       = scores[best_idx]
    last_improve_gen = 0
    mutation_rate    = BASE_MUTATION_RATE
    cr               = CROSSOVER_RATE

    print(f"Init best penalty: {best_score:.2f}")
    if AL_NURSES:
        al_labels = ", ".join(f"N{n+1}({NURSE_RANKS[n]})" for n in sorted(AL_NURSES))
        print(f"AL nurses (locked): {al_labels}")

    for gen in range(GENERATIONS):
        gens_since = gen - last_improve_gen

        mutation_rate = (
            min(MAX_MUTATION_RATE, BASE_MUTATION_RATE * (1 + gens_since / PLATEAU_GENS))
            if gens_since >= PLATEAU_GENS
            else BASE_MUTATION_RATE
        )

        rank_idx = sorted(range(len(pop)), key=lambda i: scores[i])
        new_pop  = []

        # Elitism
        for e in range(ELITISM):
            elite = deepcopy(pop[rank_idx[e]])
            if random.random() < 0.3:
                elite = repair_shift_balance(elite)
            elite = repair_rank_coverage(elite)
            elite = repair_night_coverage(elite)
            if random.random() < 0.4:
                elite = repair_shift_variance(elite)
            elite = repair_individual(elite)
            if gen > 70 and gen % 5 == 0:
                elite = local_search(elite)
            new_pop.append(elite)

        # Build rest of population
        while len(new_pop) < POP_SIZE:
            p1    = tournament(pop)
            p2    = tournament(pop)
            child = crossover(p1, p2, cr)
            child = mutate(child, mutation_rate)

            swap_prob = PATTERN_SWAP_PROB + (
                (PATTERN_SWAP_MAX - PATTERN_SWAP_PROB)
                / (1 + np.exp(-0.2 * (gen - 100)))
            )
            if random.random() < swap_prob:
                child = pattern_swap_mutation(child)

            child = repair_individual(child)

            if random.random() < 0.2:
                child = off_to_am_targeted_mutation(child)
            child = repair_individual(child)

            if random.random() < REBALANCE_PROB:
                child = rebalance_night_blocks(child)
            if random.random() < 0.3:
                child = repair_shift_balance(child)

            child = repair_rank_coverage(child)
            child = repair_night_coverage(child)
            child = repair_coverage(child)

            if random.random() < 0.5:
                child = repair_shift_variance(child)

            child = repair_individual(child)
            new_pop.append(child)

        pop    = new_pop
        scores = [evaluate_cached(ind) for ind in pop]

        # Immigration: inject fresh individuals when stagnant
        if gens_since > 50 and gen % 50 == 0:
            n_immigrants = max(1, POP_SIZE // 10)
            for i in range(n_immigrants):
                immigrant = create_individual()
                immigrant = repair_rank_coverage(immigrant)
                immigrant = repair_night_coverage(immigrant)
                immigrant = repair_coverage(immigrant)
                immigrant = repair_individual(immigrant)
                pop[rank_idx[-(i + 1)]]    = immigrant
                scores[rank_idx[-(i + 1)]] = evaluate_cached(immigrant)

        gen_best_idx   = min(range(len(scores)), key=lambda i: scores[i])
        gen_best_score = scores[gen_best_idx]

        if gen % 100 == 0:
            _fitness_cache.clear()

        if gen_best_score < best_score:
            if (best_score - gen_best_score) > 1:
                last_improve_gen = gen
            best_score = gen_best_score
            best       = deepcopy(pop[gen_best_idx])

        if gen % 25 == 0 or gen == GENERATIONS - 1:
            print(
                f"Gen {gen:4d}  "
                f"gen_best={gen_best_score:.2f}  "
                f"best_so_far={best_score:.2f}  "
                f"mut={mutation_rate:.2f}"
            )
            if progress_callback:
                progress_callback(gen, GENERATIONS, best_score)

    # Aggressive post-processing (V2 schedule)
    best = optimize_shift_variance(best, steps=500)
    best = local_search(best, steps=300)
    best = optimize_shift_variance(best, steps=400)
    best_score = evaluate_cached(best)

    return best, best_score


# ===================== I/O PIPELINE (system interface) =====================

def _detect_al_nurses(nurse_requests_parsed: list, num_days: int) -> frozenset:
    """
    Identify nurses whose request list covers every day with an AL request.
    These nurses are locked to ["AL-FULL"] for the entire run.
    """
    al_set = set()
    for n, req_list in enumerate(nurse_requests_parsed):
        al_days = {d for (d, s) in req_list if s == AL}
        if len(al_days) >= num_days:
            al_set.add(n)
    return frozenset(al_set)


def parse_inputs(
    nurses: list,
    shifts: list,
    hard_requests=None,
    soft_requests=None,
    prev_last_shift=None,
    num_days: int = 14,
) -> dict:
    """
    Parse standardised web-app inputs into GA-internal format.

    Parameters
    ----------
    nurses : list[dict]
        Nurse dicts with keys id, name, rank.
    shifts : list[dict]
        num_days-element list of per-day shift requirements.
    hard_requests : dict, optional
        Approved requests keyed by nurse_id:
        {nurse_id: [(day_0based, shift_name), ...]}
        A nurse whose approved requests cover EVERY day with "AL" is
        auto-detected as on Annual Leave and locked to the AL-FULL pattern.
        All other approved non-AL entries are promoted to NURSE_REQUESTS
        (soft penalty) so the GA favours honouring them.
    soft_requests : dict, optional
        Pending / preference requests keyed by nurse_id:
        {nurse_id: [(day_0based, shift_name), ...]}
        Added to NURSE_REQUESTS for days not already covered by an approved
        hard request.  Ignored for AL nurses.
    prev_last_shift : dict, optional
        {nurse_id: shift_name} — the shift each nurse worked on the very last
        day of the previous roster period.
        Rule: if a nurse's last shift was NIGHT they must have day 0 as OFF
        in the new period (rest day after night duty), unless they are on AL.
        This is enforced via HARD_REQUESTS with penalty HARD_PEN_NDO.
    num_days : int
        Roster length in days (default 14).
    """
    hard_requests   = hard_requests   or {}
    soft_requests   = soft_requests   or {}
    prev_last_shift = prev_last_shift or {}

    nurses_sorted = sorted(nurses, key=lambda x: x["id"])
    nurse_names   = [n["name"] for n in nurses_sorted]
    nurse_ranks   = [n["rank"] for n in nurses_sorted]
    num_nurses    = len(nurses_sorted)

    if len(shifts) != num_days:
        raise ValueError(f"Expected {num_days} days of shift data, got {len(shifts)}")

    # ── Build DEMAND ──────────────────────────────────────────────────────────
    demand = []
    for day_idx in range(num_days):
        day_entry: dict = {}
        for shift_name, reqs in shifts[day_idx].items():
            code = SHIFT_NAME_TO_CODE.get(shift_name.upper())
            if code is not None and code != AL:   # AL carries no staffing demand
                day_entry[code] = {
                    "A": int(reqs.get("A", 0)),
                    "B": int(reqs.get("B", 0)),
                    "C": int(reqs.get("C", 0)),
                }
        demand.append(day_entry)

    nurse_id_to_index = {n["id"]: idx for idx, n in enumerate(nurses_sorted)}

    # ── Step 1: parse hard_requests to detect AL nurses ───────────────────────
    # hard_requests are approved requests from the scheduler, which may include
    # full-period AL coverage (already expanded to num_days entries by
    # algo_scheduler._expand_al_requests before reaching here).
    hard_parsed = [[] for _ in range(num_nurses)]
    for nurse_id, req_list in hard_requests.items():
        if nurse_id not in nurse_id_to_index:
            continue
        idx = nurse_id_to_index[nurse_id]
        for day_idx, shift_name in req_list:
            code = SHIFT_NAME_TO_CODE.get(str(shift_name).upper())
            if code is not None and 0 <= day_idx < num_days:
                hard_parsed[idx].append((day_idx, code))

    al_nurses_set = _detect_al_nurses(hard_parsed, num_days)

    # ── Step 2: build NURSE_REQUESTS (soft penalty targets) ───────────────────
    # Priority order: approved non-AL hard requests > pending soft requests.
    # AL nurses get no soft preferences — their schedule is structurally fixed.
    nurse_requests = [[] for _ in range(num_nurses)]

    for n in range(num_nurses):
        if n in al_nurses_set:
            continue
        # Approved non-AL entries become primary soft targets
        for (day_idx, code) in hard_parsed[n]:
            if code != AL:
                nurse_requests[n].append((day_idx, code))

    # Soft (pending) requests fill days not already covered by an approval
    for nurse_id, req_list in soft_requests.items():
        if nurse_id not in nurse_id_to_index:
            continue
        idx = nurse_id_to_index[nurse_id]
        if idx in al_nurses_set:
            continue
        covered_days = {d for (d, _) in nurse_requests[idx]}
        for day_idx, shift_name in req_list:
            code = SHIFT_NAME_TO_CODE.get(str(shift_name).upper())
            if code is not None and code != AL and 0 <= day_idx < num_days:
                if day_idx not in covered_days:
                    nurse_requests[idx].append((day_idx, code))
                    covered_days.add(day_idx)

    # ── Step 3: build HARD_REQUESTS (carry-over DO from previous roster) ──────
    # A nurse who ended the previous period on a NIGHT shift must have day 0
    # as OFF in this period (mandatory rest day).  AL nurses are exempt because
    # their entire schedule is already locked to AL-FULL.
    do_requests = [[] for _ in range(num_nurses)]
    for nurse_id, last_shift in prev_last_shift.items():
        if nurse_id not in nurse_id_to_index:
            continue
        if str(last_shift).strip().upper() != "NIGHT":
            continue
        idx = nurse_id_to_index[nurse_id]
        if idx in al_nurses_set:
            continue   # AL schedule already guarantees no working shift on day 0
        do_requests[idx].append((0, OFF))

    return {
        "nurse_names":    nurse_names,
        "nurse_ranks":    nurse_ranks,
        "demand":         demand,
        "nurse_requests": nurse_requests,
        "hard_requests":  do_requests,
        "al_nurses":      al_nurses_set,
        "num_days":       num_days,
        "num_nurses":     num_nurses,
    }


def format_output(
    nurses: list,
    individual: list,
    nurse_names: list,
    nurse_ranks: list,
    num_days: int,
    penalty: float,
) -> dict:
    """
    Convert a GA individual to the standardised roster JSON expected by
    algo_scheduler.py.  AL nurses receive "AL" as the shift label every day.
    """
    schedule_codes = expand_individual(individual)
    name_to_nurse  = {n["name"]: n for n in nurses}
    output_nurses  = []

    for idx, name in enumerate(nurse_names):
        if name not in name_to_nurse:
            continue

        nurse_info  = name_to_nurse[name]
        codes       = schedule_codes[idx] if idx < len(schedule_codes) else [OFF] * num_days
        shift_names = [SHIFT_CODE_TO_NAME.get(c, "OFF") for c in codes]

        stats = {
            "total_shifts": sum(1 for s in shift_names if s not in ("OFF", "AL")),
            "am_shifts":    shift_names.count("AM"),
            "pm_shifts":    shift_names.count("PM"),
            "night_shifts": shift_names.count("NIGHT"),
            "days_off":     shift_names.count("OFF"),
            "al_days":      shift_names.count("AL"),
        }

        output_nurses.append({
            "id":       nurse_info["id"],
            "name":     nurse_info["name"],
            "rank":     nurse_info["rank"],
            "schedule": shift_names,
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


def run_ga_pipeline(
    nurses,
    shifts,
    hard_requests=None,
    soft_requests=None,
    prev_last_shift=None,
    non_working_shift_codes=None,
    progress_callback=None,
    shift_hours=None,
) -> dict:
    """
    Main entry point — called by algo_scheduler.py.

    Parameters
    ----------
    nurses : list[dict]
        [{"id": int|str, "name": str, "rank": "A"|"B"|"C"}, ...]
    shifts : list[dict]
        14-element list; each element maps shift names to rank requirements:
        {"AM": {"A": int, "B": int, "C": int},
         "PM": {"A": int, "B": int, "C": int},
         "NIGHT": {"A": int, "B": int, "C": int}}
    hard_requests : dict, optional
        Approved requests keyed by nurse_id.
        {nurse_id: [(day_0based, shift_name), ...]}
        Nurses whose approved requests cover all days with "AL" are locked
        to the AL-FULL pattern for the entire run.
    soft_requests : dict, optional
        Pending / preference requests keyed by nurse_id.
        {nurse_id: [(day_0based, shift_name), ...]}
    prev_last_shift : dict, optional
        {nurse_id: shift_name} — last shift of the previous roster period.
        Any nurse whose last shift was NIGHT receives a mandatory carry-over
        OFF on day 0 of the new roster (enforced via HARD_PEN_NDO).
        AL nurses are exempt — their schedule is already fully fixed.
    non_working_shift_codes : collection[str], optional
        Accepted for interface compatibility; not used internally by the GA.
    progress_callback : callable, optional
        Called as progress_callback(gen, total_gens, best_score) every 25 gens.
    shift_hours : dict, optional
        {"AM": float, "PM": float, "NIGHT": float, "OFF": float}
        Overrides the module-level SHIFT_HOURS so the GA uses DB-driven shift
        durations for hours-constraint evaluation.

    Returns
    -------
    Standardised roster dict matching the schema in algo_scheduler.py.
    """
    global NUM_DAYS, NUM_NURSES, NURSE_RANKS, WEEKEND_DAYS
    global DEMAND, NURSE_REQUESTS, HARD_REQUESTS
    global AL_NURSES, WORKING_NURSES
    global _fitness_cache

    # Apply DB-driven shift hours before parsing so hours constraints use
    # the correct durations from the database rather than hardcoded defaults.
    if shift_hours:
        for shift_name, hours in shift_hours.items():
            code = SHIFT_NAME_TO_CODE.get(str(shift_name).upper())
            if code is not None:
                SHIFT_HOURS[code] = float(hours)

    parsed = parse_inputs(
        nurses,
        shifts,
        hard_requests=hard_requests,
        soft_requests=soft_requests,
        prev_last_shift=prev_last_shift,
        num_days=len(shifts),
    )

    NUM_DAYS       = parsed["num_days"]
    NUM_NURSES     = parsed["num_nurses"]
    NURSE_RANKS    = parsed["nurse_ranks"]
    DEMAND         = parsed["demand"]
    NURSE_REQUESTS = parsed["nurse_requests"]
    HARD_REQUESTS  = parsed["hard_requests"]
    AL_NURSES      = parsed["al_nurses"]
    WORKING_NURSES = [n for n in range(NUM_NURSES) if n not in AL_NURSES]
    WEEKEND_DAYS   = [5, 6, 12, 13] if NUM_DAYS == 14 else []

    _fitness_cache = {}
    _build_runtime_state()

    import logging
    _ga_logger = logging.getLogger(__name__)

    _ga_logger.warning(
        "[GA DEMAND] ward inputs → parsed demand (day 0 shown; all 14 days identical):\n"
        "  AM    → A=%d  B=%d  C=%d  (total=%d)\n"
        "  PM    → A=%d  B=%d  C=%d  (total=%d)\n"
        "  NIGHT → A=%d  B=%d  C=%d  (total=%d)\n"
        "  shift_hours used: AM=%.1f  PM=%.1f  NIGHT=%.1f  OFF=%.1f",
        DEMAND[0][AM]['A'],    DEMAND[0][AM]['B'],    DEMAND[0][AM]['C'],
        sum(DEMAND[0][AM].values()),
        DEMAND[0][PM]['A'],    DEMAND[0][PM]['B'],    DEMAND[0][PM]['C'],
        sum(DEMAND[0][PM].values()),
        DEMAND[0][NIGHT]['A'], DEMAND[0][NIGHT]['B'], DEMAND[0][NIGHT]['C'],
        sum(DEMAND[0][NIGHT].values()),
        SHIFT_HOURS[AM], SHIFT_HOURS[PM], SHIFT_HOURS[NIGHT], SHIFT_HOURS[OFF],
    )
    _ga_logger.warning(
        "[GA DEMAND] working nurses=%d  AL nurses=%s  HARD_REQUESTS with carry-over=%d",
        len(WORKING_NURSES),
        sorted(AL_NURSES) if AL_NURSES else "none",
        sum(1 for reqs in HARD_REQUESTS if reqs),
    )

    best_ind, best_score = run_ga(progress_callback=progress_callback)

    return format_output(
        nurses,
        best_ind,
        parsed["nurse_names"],
        parsed["nurse_ranks"],
        NUM_DAYS,
        best_score,
    )