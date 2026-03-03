# Genetic Algorithm with Standardized Input/Output
import random
import numpy as np
from copy import deepcopy


def run_ga_pipeline(nurses, shifts, requests=None, hard_requests=None, progress_callback=None):
    """
    Main entry point for Genetic Algorithm nurse rostering.

    Args:
        nurses: List of nurse dicts with keys: id, name, rank
        shifts: List of shift requirement dicts (one per day)
        requests: Dict mapping nurse_id to list of (day_idx, shift_name) tuples
        progress_callback: Optional callable(gen, total_gens, best_score) called every 25 generations

    Returns:
        Standardized roster dict with keys: nurses, metadata
    """
    # Parse inputs
    parsed_data = parse_inputs(nurses, shifts, requests, hard_requests)

    # Run GA solver
    best_individual, best_penalty = run_ga(
        parsed_data['nurse_names'],
        parsed_data['nurse_ranks'],
        parsed_data['demand'],
        parsed_data['nurse_requests'],
        parsed_data['hard_requests'],
        parsed_data['num_days'],
        progress_callback=progress_callback,
    )
    
    # Convert to standardized output
    output = format_output(
        nurses,
        best_individual,
        parsed_data['nurse_names'],
        parsed_data['nurse_ranks'],
        parsed_data['num_days'],
        best_penalty
    )
    
    return output


def parse_inputs(nurses, shifts, requests=None, hard_requests=None, num_days=14):
    """
    Parse JSON inputs into GA-compatible format.
    
    Returns dict with:
        - nurse_names: List of nurse names
        - nurse_ranks: List of nurse ranks (A/B/C)
        - demand: List of daily shift requirements
        - nurse_requests: List of request lists per nurse
        - num_days: Number of days
    """
    requests = requests or {}
    hard_requests = hard_requests or {}
    
    # Shift codes (must match GA internal representation)
    OFF, AM, PM, NIGHT = 0, 1, 2, 3
    SHIFT_CODE = {
        "OFF": OFF,
        "AM": AM,
        "PM": PM,
        "NIGHT": NIGHT
    }
    
    # Sort nurses by ID for consistent ordering
    nurses_sorted = sorted(nurses, key=lambda x: x["id"])
    
    nurse_names = [n["name"] for n in nurses_sorted]
    nurse_ranks = [n["rank"] for n in nurses_sorted]
    num_nurses = len(nurses_sorted)
    
    # Validate shifts data
    if len(shifts) != num_days:
        raise ValueError(f"Expected {num_days} days of shift data, got {len(shifts)}")
    
    # Parse demand (shift requirements per day)
    demand = []
    for day_idx in range(num_days):
        day_entry = {}
        for shift_name, requirements in shifts[day_idx].items():
            if shift_name in SHIFT_CODE:
                shift_code = SHIFT_CODE[shift_name]
                day_entry[shift_code] = {
                    "A": requirements.get("A", 0),
                    "B": requirements.get("B", 0),
                    "C": requirements.get("C", 0),
                }
        demand.append(day_entry)
    
    # Parse nurse requests
    nurse_requests = [[] for _ in range(num_nurses)]
    
    if requests:
        nurse_id_to_index = {
            n["id"]: idx for idx, n in enumerate(nurses_sorted)
        }
        
        for nurse_id, req_list in requests.items():
            if nurse_id not in nurse_id_to_index:
                continue
            
            nurse_idx = nurse_id_to_index[nurse_id]
            
            for day_idx, shift_name in req_list:
                if 0 <= day_idx < num_days and shift_name in SHIFT_CODE:
                    nurse_requests[nurse_idx].append((day_idx, SHIFT_CODE[shift_name]))

    # Parse hard DO requests; these are requests made by the system to ensure DO after a previous N in the last roster
    do_requests = [[] for _ in range(num_nurses)]
    
    if hard_requests:
        nurse_id_to_index = {
            n["id"]: idx for idx, n in enumerate(nurses_sorted)
        }
        
        for nurse_id, req_list in hard_requests.items():
            if nurse_id not in nurse_id_to_index:
                continue
            
            nurse_idx = nurse_id_to_index[nurse_id]
            
            for day_idx, shift_name in req_list:
                if 0 <= day_idx < num_days and shift_name in SHIFT_CODE:
                    do_requests[nurse_idx].append((day_idx, SHIFT_CODE[shift_name]))
    
    return {
        'nurse_names': nurse_names,
        'nurse_ranks': nurse_ranks,
        'demand': demand,
        'nurse_requests': nurse_requests,
        'hard_requests': do_requests,
        'num_days': num_days
    }


def run_ga(nurse_names, nurse_ranks, demand, nurse_requests, hard_requests, num_days=14, progress_callback=None):
    """
    Run the genetic algorithm to generate a roster.
    
    This is a simplified placeholder. The actual implementation should include:
    - Pattern-based chromosome representation
    - Fitness evaluation with hard/soft constraints
    - Genetic operators (selection, crossover, mutation)
    - Population evolution over generations
    
    Returns: (best_individual, best_penalty)
    """
    # ===================== CONFIG =====================
    NUM_DAYS = 15
    NUM_NURSES = len(nurse_names)

    # Shift codes (for printing and hours calc)
    OFF = 0
    AM = 1
    PM = 2
    NIGHT = 3 

    SHIFT_HOURS = {OFF: 0, AM: 8, PM: 8, NIGHT: 10}  # assume night counted as 10h (example)

    # Patterns and their day sequences (list of shift codes)
    PATTERNS = {
        "AM":     [AM],
        "PM":     [PM],
        "OFF":    [OFF],
        "N-OFF":  [NIGHT, OFF],
        "N-N-OFF":[NIGHT, NIGHT, OFF],
        "N-END":  [NIGHT]
    }
    PATTERN_NAMES = list(PATTERNS.keys())

    # random.seed(1) #uncomment this line for testing, if not leave this commented so good luck might be on our side.
    NURSE_RANKS = nurse_ranks

    # Example demand: for each day and shift, required minima for ranks (A,B,C).
    # Format: demand[day][shift] = {'A': minA, 'B': minB, 'C': minC}
    # For demo we set same demand each day; in practice set per-day demands.

    DEMAND = demand

    # Example shift requests: list per nurse of (day, shift_code) tuples (up to 3)
    # Here we sample some random requests for demonstration
    # note: I leave this here so I know the template for requests.
    # def sample_requests(num_nurses, max_reqs=3):
    #     reqs = []
    #     for n in range(num_nurses):
    #         k = random.randint(0, max_reqs)
    #         s = set()
    #         while len(s) < k:
    #             d = random.randrange(0, NUM_DAYS)
    #             shift = random.choice([AM, PM, NIGHT])
    #             s.add((d, shift))
    #         reqs.append(list(s))
    #     return reqs

    NURSE_REQUESTS = nurse_requests
    HARD_REQUESTS = hard_requests

    # Hours constraints (over 14 days)
    MIN_HOURS = 84
    MAX_HOURS = 88

    # Penalty weights (tune as needed)
    HARD_PEN_NDO = 200000 # penalty for not starting with DO if the last week's roster ended with a Night shift.
    HARD_PEN_SHIFT = 150000  # missing required staff
    HARD_PEN_HOUR = 100000   # hours outside min/max
    HARD_PEN_DAYOFF = 160000 # missing required days-off (2 per week)
    HARD_PEN_NIGHTS = 80000 # for too few or too many nights

    SOFT_W_REQUEST = 50
    SOFT_W_NIGHT_FAIR = 5
    SOFT_W_WEEKEND_FAIR = 5
    SOFT_W_WEEKDAY_PREF = 5
    SOFT_W_MORNING_PREF = 3
    SOFT_W_DAILY_BALANCE = 2
    SOFT_W_OVERTIME = 200

    # GA hyperparams
    POP_SIZE = 550
    GENERATIONS = 380
    TOURNAMENT_K = 2
    CROSSOVER_RATE = 0.8
    REBALANCE_PROB = 0.25   # 5–10% is ideal
    PATTERN_SWAP_PROB = 0.3 #need to increase with generations
    PATTERN_SWAP_MAX = 0.5
    BASE_MUTATION_RATE = 0.25
    MAX_MUTATION_RATE  = 0.75
    PLATEAU_GENS = 10 #change back to 20/25
    ELITISM = 3

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

            heavy = [n for n,c in enumerate(night_counts) if c > 2]
            light = [n for n,c in enumerate(night_counts) if c < 1]

            random.shuffle(heavy)
            random.shuffle(light)

            for src in heavy:
                blocks = extract_night_blocks(schedule, src)
                for start, end in blocks:
                    if not (week_start <= start < week_end):
                        continue

                    length = end - start
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

        for week in [(0,7), (7,14)]:
            night_counts = [
                sum(1 for d in range(*week) if schedule[n][d] == NIGHT)
                for n in range(NUM_NURSES)
            ]

            over = [n for n,c in enumerate(night_counts) if c > 2]
            under = [n for n,c in enumerate(night_counts) if c < 1]

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
        If conversion fails for a nurse, fall back to original patterns.
        """
        new_ind = []

        for n in range(NUM_NURSES):
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
                    if i == 13:
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

    def local_search(ind, steps=32):
        best = deepcopy(ind)
        best_score = evaluate(best)

        sched = expand_individual(best)

        for _ in range(steps):
            n = random.randrange(NUM_NURSES)
            d1, d2 = random.sample(range(NUM_DAYS), 2)

            if sched[n][d1] == sched[n][d2]:
                continue

            # try swap
            sched[n][d1], sched[n][d2] = sched[n][d2], sched[n][d1]

            # convert back to patterns
            trial = schedule_to_patterns(sched)
            trial = repair_individual(trial)

            score = evaluate(trial)
            if score < best_score:
                best, best_score = trial, score
            else:
                # undo
                sched[n][d1], sched[n][d2] = sched[n][d2], sched[n][d1]

        return best

    def expand_pattern_list(pattern_list):
        """Given a list of pattern names for one nurse, expand to a list of shift codes (length NUM_DAYS)."""
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
        # Count how many OFF already included via night blocks
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
        """Create an individual: list (for nurses) of pattern lists."""
        return [gen_pattern_sequence_for_nurse() for _ in range(NUM_NURSES)]

    # Representation helpers
    def expand_individual(ind):
        """Expand individual (pattern-lists) to schedule matrix: schedule[nurse][day] -> shift code."""
        schedule = [expand_pattern_list(ind[n]) for n in range(NUM_NURSES)]
        # sanity check lengths
        for seq in schedule:
            if len(seq) != NUM_DAYS:
                raise ValueError("Expanded sequence length mismatch")
        return schedule

    # ===================== FITNESS =====================
    def night_weekly_penalty(schedule):
        """
        Penalize nurses who have <1 or >2 night shifts per week.
        Weeks are [0..6] and [7..13].
        """
        penalty = 0

        for n in range(NUM_NURSES):
            for week in (range(0, 7), range(7, 14)):
                night_count = sum(
                    1 for d in week if schedule[n][d] == NIGHT
                )

                if night_count < 1:
                    penalty += (1 - night_count) * HARD_PEN_NIGHTS * 0.8
                elif night_count > 2:
                    penalty += (night_count - 2) * HARD_PEN_NIGHTS 

        return penalty

    def evaluate(individual):
        """
        Returns a penalty (lower is better). We will minimize penalty.
        Hard constraints produce huge penalties to strongly discourage infeasible schedules.
        """
        schedule = expand_individual(individual)
        penalty = 0

        # 1) Shift coverage minima (hard)
        for d in range(14):
            for shift in [AM, PM, NIGHT]:

                # Count exact ranks only
                available = {'A': 0, 'B': 0, 'C': 0}

                for n in range(NUM_NURSES):
                    if schedule[n][d] == shift:
                        r = NURSE_RANKS[n]
                        available[r] += 1

                req = DEMAND[d][shift]

                # Copy because we will modify
                remaining = available.copy()

                # 1. Satisfy A demand using A only
                used_A_for_A = min(remaining['A'], req['A'])
                remaining['A'] -= used_A_for_A
                missing_A = req['A'] - used_A_for_A

                # 2. Satisfy B demand using B first, then leftover A
                needed_B = req['B']
                used_B_for_B = min(remaining['B'], needed_B)
                remaining['B'] -= used_B_for_B
                needed_B -= used_B_for_B

                used_A_for_B = min(remaining['A'], needed_B)
                remaining['A'] -= used_A_for_B
                needed_B -= used_A_for_B

                missing_B = needed_B

                # 3. Satisfy C demand using C first, then B, then A
                needed_C = req['C']

                used_C_for_C = min(remaining['C'], needed_C)
                remaining['C'] -= used_C_for_C
                needed_C -= used_C_for_C

                used_B_for_C = min(remaining['B'], needed_C)
                remaining['B'] -= used_B_for_C
                needed_C -= used_B_for_C

                used_A_for_C = min(remaining['A'], needed_C)
                remaining['A'] -= used_A_for_C
                needed_C -= used_A_for_C

                missing_C = needed_C

                # Add penalties
                penalty += (missing_A + missing_B + missing_C) * HARD_PEN_SHIFT

        # 2) Hours per nurse (hard)
        hours_per_nurse = []
        for n in range(NUM_NURSES):
            h = sum(SHIFT_HOURS[s] for s in schedule[n][:14])
            hours_per_nurse.append(h)
            if h < MIN_HOURS:
                penalty += (MIN_HOURS - h) * HARD_PEN_HOUR * 1.2
            if h > MAX_HOURS:
                penalty += (h - MAX_HOURS) * HARD_PEN_HOUR * 0.8

        # 3) 2 days off per week (hard): for weeks [0..6] and [7..13]
        for n in range(NUM_NURSES):
            for week in (range(0,7), range(7,14)):
                offs = sum(1 for d in week if schedule[n][d] == OFF)
                if offs < 2:
                    penalty += (2 - offs) * HARD_PEN_DAYOFF
                elif offs > 2:
                    penalty += (offs - 2) * 0.9 * HARD_PEN_DAYOFF

        # 5) Requests (soft)
        for n in range(NUM_NURSES):
            for (d, s) in NURSE_REQUESTS[n]:
                if d < 14 and schedule[n][d] != s: # Safety check for day index
                    penalty += SOFT_W_REQUEST
    
        # 5.5) This is for DO after last week's night shift on the last day.
        for n in range(NUM_NURSES):
            for (d,s) in HARD_REQUESTS[n]:
                if schedule[n][d] != s:
                    penalty += HARD_PEN_NDO

        # 6) Night fairness (soft): variance of night counts
        night_counts = [sum(1 for d in range(14) if schedule[n][d] == NIGHT) for n in range(NUM_NURSES)]
        if len(night_counts) > 1:
            penalty += (max(night_counts) - min(night_counts)) * SOFT_W_NIGHT_FAIR

        # 7) Weekend fairness (soft) - treat days 5,6 and 12,13 as weekends (example)
        weekend_days = [5,6, 12,13]
        weekend_counts = [sum(1 for d in weekend_days if schedule[n][d] != OFF) for n in range(NUM_NURSES)]
        if len(weekend_counts) > 1:
            penalty += (max(weekend_counts) - min(weekend_counts)) * SOFT_W_WEEKEND_FAIR

        # 8) Weekday coverage preference & daily balance (soft)
        weekday_days = [d for d in range(14) if d not in weekend_days and d != 14]
        daily_totals = [sum(1 for n in range(NUM_NURSES) if schedule[n][d] != OFF) for d in range(14)]
        # prefer weekdays to have on-average at least a target coverage (approx from demand)
        # compute a simple target: average of minima sums across shifts
        avg_min = 0
        if weekday_days:
            avg_min = sum((DEMAND[d][s]['A'] + DEMAND[d][s]['B'] + DEMAND[d][s]['C']) for d in weekday_days for s in [AM,PM,NIGHT]) / (len(weekday_days) * 3)
        avg_weekday_coverage = sum(daily_totals[d] for d in weekday_days) / (len(weekday_days)) if weekday_days else 0
        if avg_weekday_coverage < avg_min:
            penalty += (avg_min - avg_weekday_coverage) * SOFT_W_WEEKDAY_PREF * 5

        # daily balance (variance)
        if len(daily_totals) > 1:
            penalty += (max(daily_totals) - min(daily_totals)) * SOFT_W_DAILY_BALANCE

        # 9) Preference for mornings (soft) -> reward AM counts by decreasing penalty
        am_count = sum(1 for n in range(NUM_NURSES) for d in range(14) if schedule[n][d] == AM)
        penalty -= (am_count) * SOFT_W_MORNING_PREF * 0.05

        # 10) Overtime soft (beyond MAX_HOURS)
        for h in hours_per_nurse:
            if h > MAX_HOURS:
                penalty += (h - MAX_HOURS) * SOFT_W_OVERTIME
        
        penalty += night_weekly_penalty(schedule)

        return penalty

    # ===================== REPAIR & VALIDATION =====================

    def repair_individual(ind):
        """
        This GA uses pattern-based individuals so most illegal sequences are avoided.
        Still, as a light repair: ensure each nurse's pattern-list expands exactly to NUM_DAYS.
        If mismatch, regenerate that nurse's pattern-list.
        """
        ind2 = deepcopy(ind)
        for n in range(NUM_NURSES):
            expanded = expand_pattern_list(ind2[n])
            if len(expanded) != NUM_DAYS:
                ind2[n] = gen_pattern_sequence_for_nurse()
        return ind2
    
    def repair_coverage(ind):
        """
        Repair coverage deficits by reassigning OFF nurses
        (or low-impact shifts) to required shifts.

        Strategy:
        - For each day and shift:
            - Compute deficit per rank
            - Try to fill using OFF nurses first
            - Prefer exact rank, then higher rank
        """

        schedule = expand_individual(ind)

        for d in range(14):
            for shift in [AM, PM, NIGHT]:

                # --- Count current coverage ---
                available = {'A': 0, 'B': 0, 'C': 0}
                for n in range(NUM_NURSES):
                    if schedule[n][d] == shift:
                        available[NURSE_RANKS[n]] += 1

                req = DEMAND[d][shift]

                # --- Compute deficits ---
                deficit = {
                    r: max(0, req[r] - available[r])
                    for r in ['A', 'B', 'C']
                }

                # --- Try to fix each rank deficit ---
                for rank in ['A', 'B', 'C']:
                    while deficit[rank] > 0:

                        # Eligible ranks (exact first, then higher)
                        if rank == 'A':
                            candidate_ranks = ['A']
                        elif rank == 'B':
                            candidate_ranks = ['B', 'A']
                        else:  # C
                            candidate_ranks = ['C', 'B', 'A']

                        assigned = False

                        for n in range(NUM_NURSES):

                            if NURSE_RANKS[n] not in candidate_ranks:
                                continue

                            # Prefer OFF nurses
                            if schedule[n][d] == OFF:

                                # Avoid breaking night block continuity
                                if shift != NIGHT:
                                    if d > 0 and schedule[n][d-1] == NIGHT:
                                        continue
                                    if d < 13 and schedule[n][d+1] == NIGHT:
                                        continue

                                schedule[n][d] = shift
                                deficit[rank] -= 1
                                assigned = True
                                break

                        # If no OFF found, try swapping low-impact shifts
                        if not assigned:
                            for n in range(NUM_NURSES):

                                if NURSE_RANKS[n] not in candidate_ranks:
                                    continue

                                if schedule[n][d] in [AM, PM] and shift == NIGHT:
                                    # convert AM/PM -> NIGHT if needed
                                    schedule[n][d] = NIGHT
                                    deficit[rank] -= 1
                                    assigned = True
                                    break

                        # If still not assigned, stop trying
                        if not assigned:
                            break

        # Convert back to patterns safely
        return schedule_to_patterns(schedule, fallback_ind=ind)

    # ===================== OPERATORS =====================
    def nurse_penalty(schedule, nurse_id):
        pen = 0
        for d in range(NUM_DAYS):
            s = schedule[nurse_id][d]
            # soft penalties only (important)
            if (d, s) in NURSE_REQUESTS[nurse_id]:
                pen -= SOFT_W_REQUEST
        return pen

    def tournament(pop, k=TOURNAMENT_K):
        picks = random.sample(pop, k)
        best = min(picks, key=evaluate)  # minimize penalty
        return deepcopy(best)

    def crossover(parent1, parent2):
        """
        Coverage-aware per-nurse crossover.
        Prefer inheriting the nurse schedule that contributes better to coverage.
        """
        child = []

        sched1 = expand_individual(parent1)
        sched2 = expand_individual(parent2)

        for n in range(NUM_NURSES):
            p1 = parent1[n]
            p2 = parent2[n]

            # --- coverage-aware selection ---
            score1 = nurse_penalty(sched1, n)
            score2 = nurse_penalty(sched2, n)

            if random.random() < 0.7:
                # choose better parent most of the time
                base = p1 if score1 <= score2 else p2
                newp = deepcopy(base)

            elif random.random() < CROSSOVER_RATE and len(p1) > 1 and len(p2) > 1:
                # fallback to pattern-boundary crossover
                cut1 = random.randint(1, len(p1) - 1)
                cut2 = random.randint(1, len(p2) - 1)
                newp = p1[:cut1] + p2[cut2:]

            else:
                newp = deepcopy(random.choice([p1, p2]))

            # ---- length correction (unchanged) ----
            exp_len = sum(len(PATTERNS[q]) for q in newp)

            if exp_len > NUM_DAYS:
                while newp and sum(len(PATTERNS[q]) for q in newp) > NUM_DAYS:
                    newp.pop()

            elif exp_len < NUM_DAYS:
                choices = [p for p in PATTERN_NAMES if len(PATTERNS[p]) <= (NUM_DAYS - exp_len)]
                while exp_len < NUM_DAYS and choices:
                    pick = random.choice(choices)
                    newp.append(pick)
                    exp_len = sum(len(PATTERNS[q]) for q in newp)
                    choices = [p for p in PATTERN_NAMES if len(PATTERNS[p]) <= (NUM_DAYS - exp_len)]

            child.append(newp)

        return repair_individual(child)


    def mutate(ind, mutation_rate):
        """Mutation working at pattern-level: replace a random pattern, delete/insert, or regenerate nurse's list."""
        ind2 = deepcopy(ind)
        for n in range(NUM_NURSES):
            if random.random() < mutation_rate:
                # choose mutation type
                t = random.choices(['replace_pattern', 'swap_pattern', 'delete_pattern', 'regenerate'],
                                    weights=[0.55, 0.25, 0.15, 0.05],  # regenerate is rare
                                    )[0]
                pats = ind2[n]
                if t == 'regenerate' or not pats:
                    ind2[n] = gen_pattern_sequence_for_nurse()
                elif t == 'replace_pattern':
                    idx = random.randrange(len(pats))
                    # pick pattern that fits same length or adjust
                    old_len = len(PATTERNS[pats[idx]])
                    # replace with pattern of same length if possible to keep simpler
                    same_len = [p for p in PATTERN_NAMES if len(PATTERNS[p]) == old_len]
                    if same_len:
                        pats[idx] = random.choice(same_len)
                    else:
                        pats[idx] = random.choice(PATTERN_NAMES)
                    ind2[n] = pats
                    # fix length if needed
                    exp_len = sum(len(PATTERNS[q]) for q in pats)
                    while exp_len > NUM_DAYS:
                        pats.pop(random.randrange(len(pats)))
                        exp_len = sum(len(PATTERNS[q]) for q in pats)
                    # Ensure N-END only at final position
                    for idx, p in enumerate(pats):
                        if p == "N-END" and idx != len(pats) - 1:
                            pats[idx] = "OFF"
                    while exp_len < NUM_DAYS:
                        candidates = [p for p in PATTERN_NAMES if len(PATTERNS[p]) <= NUM_DAYS - exp_len]
                        pats.append(random.choice(candidates))
                        exp_len = sum(len(PATTERNS[q]) for q in pats)
                        
                elif t == 'swap_pattern' and len(pats) >= 2:
                    i, j = random.sample(range(len(pats)), 2)
                    pats[i], pats[j] = pats[j], pats[i]
                elif t == 'delete_pattern':
                    if len(pats) > 1:
                        idx = random.randrange(len(pats))
                        pats.pop(idx)
                        # try to fill to exact days
                        exp_len = sum(len(PATTERNS[q]) for q in pats)
                        while exp_len < NUM_DAYS:
                            choices = [p for p in PATTERN_NAMES if len(PATTERNS[p]) <= NUM_DAYS - exp_len]
                            pats.append(random.choice(choices))
                            exp_len = sum(len(PATTERNS[q]) for q in pats)
                        ind2[n] = pats
        ind2 = repair_individual(ind2)
        return ind2

    # ===================== GA MAIN LOOP =====================
    generations = GENERATIONS
    pop_size = POP_SIZE
    # init population
    pop = [create_individual() for _ in range(pop_size)]
    scores = [evaluate(ind) for ind in pop]

    best_idx = min(range(len(scores)), key=lambda i: scores[i])
    best = deepcopy(pop[best_idx])
    best_score = scores[best_idx]
    last_improve_gen = 0

    mutation_rate = BASE_MUTATION_RATE

    print(f"Init best penalty: {best_score:.2f}")

    for gen in range(generations):
        # sort population by score (ascending penalty)
        gens_since_improve = gen - last_improve_gen
        if gens_since_improve >= PLATEAU_GENS:
            mutation_rate = min(MAX_MUTATION_RATE,
                                BASE_MUTATION_RATE * (1 + gens_since_improve / PLATEAU_GENS))
        else:
            mutation_rate = BASE_MUTATION_RATE
        rank_idx = sorted(range(len(pop)), key=lambda i: scores[i])
        new_pop = []

        # Elitism: copy top ELITISM individuals unchanged
        
        for e in range(ELITISM):
            elite = deepcopy(pop[rank_idx[e]])
            if gen > 70 and gen % 5 == 0:
                elite = local_search(elite)
            new_pop.append(elite)
            #new_pop.append(deepcopy(pop[rank_idx[e]]))

        # Build rest
        while len(new_pop) < pop_size:
            p1 = tournament(pop)
            p2 = tournament(pop)
            child = crossover(p1, p2)
            child = mutate(child, mutation_rate)
            if random.random() < PATTERN_SWAP_PROB + ((PATTERN_SWAP_MAX-PATTERN_SWAP_PROB)/(1+np.exp(-0.2 * (gen-149)))):
                child = pattern_swap_mutation(child)
            child = repair_individual(child)
            if random.random() < REBALANCE_PROB:
                child = rebalance_night_blocks(child) #rebalance_nights_weekly(child)
            child = repair_coverage(child)
            child = repair_individual(child)
            new_pop.append(child)

        pop = new_pop
        scores = [evaluate(ind) for ind in pop]
        gen_best_idx = min(range(len(scores)), key=lambda i: scores[i])
        gen_best_score = scores[gen_best_idx]
        if gen_best_score < best_score:
            if (best_score - gen_best_score) > 49:
                last_improve_gen = gen
            best_score = gen_best_score
            best = deepcopy(pop[gen_best_idx])

        if gen % 25 == 0 or gen == generations - 1:
            print(
                f"Gen {gen:4d} "
                f"gen_best_penalty={gen_best_score:.2f} "
                f"best_so_far={best_score:.2f} "
                f"mut_rate={mutation_rate:.2f}"
            )
            if progress_callback:
                progress_callback(gen, generations, best_score)
    return best, best_score

OFF, AM, PM, NIGHT = 0, 1, 2, 3
SHIFT_LABEL = {
    OFF: "DO",
    AM: "A",
    PM: "P",
    NIGHT: "N"
}
PATTERNS_MAP = {
    "AM": [AM],
    "PM": [PM],
    "OFF": [OFF],
    "N-OFF": [NIGHT, OFF],
    "N-N-OFF": [NIGHT, NIGHT, OFF],
}

def expand_individual_simple(individual, num_days=14):
    """
    Properly flattens the pattern-based representation into a daily schedule.
    Input: [["AM", "N-OFF", ...], ["PM", ...]]
    Output: [[1, 3, 0, ...], [2, ...]]
    """
    expanded_schedule = []
    
    for nurse_pattern_list in individual:
        full_shifts = []
        for p_name in nurse_pattern_list:
            # Get the list of shift codes from our map
            shifts = PATTERNS_MAP.get(p_name, [OFF])
            full_shifts.extend(shifts)
        
        # Ensure we don't exceed or fall short of num_days due to pattern logic
        expanded_schedule.append(full_shifts[:num_days])
        
    return expanded_schedule

def format_output(nurses, individual, nurse_names, nurse_ranks, num_days, penalty):
    """
    Convert GA individual to standardized JSON output.
    """
    # Use the now-working expansion function
    schedule_codes = expand_individual_simple(individual, num_days)
    
    name_to_nurse = {n["name"]: n for n in nurses}
    output_nurses = []
    
    for idx, nurse_name in enumerate(nurse_names):
        if nurse_name not in name_to_nurse:
            continue
        
        nurse_info = name_to_nurse[nurse_name]
        
        # Get the flat list of codes for this nurse
        nurse_codes = schedule_codes[idx] if idx < len(schedule_codes) else [OFF] * num_days
        
        # Convert codes [1, 3, 0] -> labels ["AM", "NIGHT", "OFF"]
        schedule_names = [SHIFT_LABEL.get(code, "OFF") for code in nurse_codes]
        
        # Calculate accurate statistics from the flat list
        stats = {
            "total_shifts": sum(1 for s in schedule_names if s != "OFF"),
            "am_shifts": schedule_names.count("AM"),
            "pm_shifts": schedule_names.count("PM"),
            "night_shifts": schedule_names.count("NIGHT"),
            "days_off": schedule_names.count("OFF")
        }
        
        output_nurses.append({
            "id": nurse_info["id"],
            "name": nurse_info["name"],
            "rank": nurse_info["rank"],
            "schedule": schedule_names, # This will now be a list of 14 separate strings
            "stats": stats
        })
    
    output_nurses.sort(key=lambda x: x["id"])
    
    return {
        "nurses": output_nurses,
        "metadata": {
            "num_days": num_days,
            "num_nurses": len(output_nurses),
            "algorithm": "GA",
            "penalty_score": penalty
        }
    }