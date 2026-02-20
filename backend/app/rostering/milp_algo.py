# MILP Algorithm with Standardized Input/Output
import pandas as pd
import random
from pyomo.environ import (
    ConcreteModel, Set, RangeSet, Var, Binary, NonNegativeReals,
    ConstraintList, Objective, minimize, SolverFactory, TerminationCondition
)


class MILPError(Exception):
    """Raised when MILP solver fails or finds no feasible solution"""
    pass


# ============================
# WARD CONFIGURATION
# ============================
WARD_CONFIG = {
    "DEFAULT": {
        "LOW_DAYS": set(),
        
        "RN": {
            "normal_min": {"A": 2, "P": 2, "N": 1},
            "low_exact": None,
            "day_target": {"A": 4, "P": 3, "N": 2},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        
        "EN": {
            "normal_min": {"A": 4, "P": 2, "N": 1},
            "low_exact": None,
            "day_target": {"A": 4, "P": 3, "N": 2},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        
        "HCA": {
            "normal_min": {"A": 1, "P": 0, "N": 0},
            "low_exact": None,
            "day_target": {"A": 1, "P": 1, "N": 1},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        
        "TOTAL_MIN": {"A": 7, "P": 7, "N": 4},
    },
}


def run_milp_pipeline(nurses, shifts, requests=None):
    """
    Main entry point for MILP nurse rostering algorithm.
    
    Args:
        nurses: List of nurse dicts with keys: id, name, rank
        shifts: List of shift requirement dicts (one per day)
        requests: Dict mapping nurse_id to list of (day_idx, shift_name) tuples
    
    Returns:
        Standardized roster dict with keys: nurses, metadata
    """
    # Parse inputs
    parsed_data = parse_inputs(nurses, shifts, requests)
    
    # Build WARD_CONFIG from parsed shift requirements
    update_ward_config_from_shifts(parsed_data['shifts_data'])
    
    # Run MILP solver
    try:
        roster_rn, roster_en, roster_hca = generate_multi_roster_pyomo(
            rn_list=parsed_data['rn_list'],
            en_list=parsed_data['en_list'],
            hca_list=parsed_data['hca_list'],
            hard_requests_rn=parsed_data['hard_requests_rn'],
            hard_requests_en=parsed_data['hard_requests_en'],
            hard_requests_hca=parsed_data['hard_requests_hca'],
            dept_name="DEFAULT"
        )
    except (RuntimeError, ValueError) as e:
        raise MILPError(f"MILP solver failed: {str(e)}")
    
    # Convert to standardized output
    output = format_output(
        nurses, 
        roster_rn, 
        roster_en, 
        roster_hca,
        parsed_data['num_days']
    )
    
    return output


def update_ward_config_from_shifts(shifts_data):
    """Update WARD_CONFIG with shift requirements from input data."""
    # Calculate maximum requirements across all days
    rn_min = {"A": 0, "P": 0, "N": 0}
    en_min = {"A": 0, "P": 0, "N": 0}
    hca_min = {"A": 0, "P": 0, "N": 0}
    
    shift_map = {"AM": "A", "PM": "P", "NIGHT": "N"}
    
    for day in shifts_data:
        for shift_name, ranks in day.items():
            code = shift_map.get(shift_name)
            if code:
                rn_min[code] = max(rn_min[code], ranks.get("A", 0))
                en_min[code] = max(en_min[code], ranks.get("B", 0))
                hca_min[code] = max(hca_min[code], ranks.get("C", 0))
    
    # Update config
    WARD_CONFIG["DEFAULT"]["RN"]["normal_min"] = rn_min
    WARD_CONFIG["DEFAULT"]["EN"]["normal_min"] = en_min
    WARD_CONFIG["DEFAULT"]["HCA"]["normal_min"] = hca_min
    
    # Update total minimums
    WARD_CONFIG["DEFAULT"]["TOTAL_MIN"] = {
        "A": rn_min["A"] + en_min["A"] + hca_min["A"],
        "P": rn_min["P"] + en_min["P"] + hca_min["P"],
        "N": rn_min["N"] + en_min["N"] + hca_min["N"],
    }


def parse_inputs(nurses, shifts, requests=None):
    """
    Parse JSON inputs into MILP-compatible format.
    
    Returns dict with:
        - rn_list, en_list, hca_list: Lists of nurse names by class
        - hard_requests_rn/en/hca: Dicts mapping name -> {Day X: shift_code}
        - num_days: Number of days in schedule
        - shifts_data: Original shifts data
    """
    requests = requests or {}
    num_days = len(shifts)
    
    # Map rank to nurse class
    rank_to_class = {
        "A": "RN",
        "B": "EN",
        "C": "HCA"
    }
    
    # Split nurses by class
    rn_list, en_list, hca_list = [], [], []
    
    for nurse in nurses:
        nurse_class = rank_to_class.get(nurse["rank"])
        if nurse_class == "RN":
            rn_list.append(nurse["name"])
        elif nurse_class == "EN":
            en_list.append(nurse["name"])
        elif nurse_class == "HCA":
            hca_list.append(nurse["name"])
    
    # Map shift names to MILP codes
    shift_map = {
        "AM": "A",
        "PM": "P",
        "NIGHT": "N"
    }
    
    # Create nurse ID to name mapping
    id_to_name = {n["id"]: n["name"] for n in nurses}
    
    # Parse hard requests
    hard_requests_rn = {}
    hard_requests_en = {}
    hard_requests_hca = {}
    
    for nurse_id, req_list in requests.items():
        if nurse_id not in id_to_name:
            continue
        
        name = id_to_name[nurse_id]
        rank = next(n["rank"] for n in nurses if n["id"] == nurse_id)
        nurse_class = rank_to_class[rank]
        
        # Select appropriate dict
        if nurse_class == "RN":
            target = hard_requests_rn
        elif nurse_class == "EN":
            target = hard_requests_en
        else:
            target = hard_requests_hca
        
        target[name] = {}
        
        # Convert requests to MILP format
        for day_idx, shift_name in req_list:
            if 0 <= day_idx < num_days and shift_name in shift_map:
                day_key = f"Day {day_idx + 1}"
                target[name][day_key] = shift_map[shift_name]
    
    return {
        'rn_list': rn_list,
        'en_list': en_list,
        'hca_list': hca_list,
        'hard_requests_rn': hard_requests_rn,
        'hard_requests_en': hard_requests_en,
        'hard_requests_hca': hard_requests_hca,
        'num_days': num_days,
        'shifts_data': shifts
    }


def classify_day_code(raw):
    """
    Classify a day code into its type.
    
    Returns (kind, val) where kind is:
    - NONE: Empty/no code
    - WORK_SHIFT: A/P/N shift
    - OFF: Day off (DO/OFF)
    - EQUIV_LEAVE: Annual leave (AL)
    - OTHER_NONWORK: Other non-working codes (INHT/BL/etc)
    """
    if raw is None:
        return ("NONE", "")
    s = str(raw).strip().upper()
    if s == "" or s == "NAN":
        return ("NONE", "")
    if s in {"A", "P", "N"}:
        return ("WORK_SHIFT", s)
    if s == "AL":
        return ("EQUIV_LEAVE", "AL")
    if s in {"DO", "OFF"}:
        return ("OFF", s)
    return ("OTHER_NONWORK", s)


def generate_multi_roster_pyomo(
    rn_list,
    en_list,
    hca_list,
    dept_name="DEFAULT",
    hard_requests_rn=None,
    soft_requests_rn=None,
    annual_leave_rn=None,
    prev_week_roster_rn=None,
    hard_requests_en=None,
    soft_requests_en=None,
    annual_leave_en=None,
    prev_week_roster_en=None,
    hard_requests_hca=None,
    soft_requests_hca=None,
    annual_leave_hca=None,
    prev_week_roster_hca=None,
    solver_name="cbc",
    weights=None
):
    """
    Generate multi-class roster using Pyomo/MILP.
    
    Returns: (roster_rn, roster_en, roster_hca) as pandas DataFrames
    """
    if dept_name not in WARD_CONFIG:
        raise ValueError(f"Unknown dept_name '{dept_name}' in WARD_CONFIG")

    cfg = WARD_CONFIG[dept_name]
    LOW_DAYS = set(cfg.get("LOW_DAYS", set()))
    rn_cfg = cfg["RN"]
    en_cfg = cfg["EN"]
    hca_cfg = cfg["HCA"]
    tot_cfg = cfg.get("TOTAL_MIN", None)

    DAYS = list(range(1, 15))
    SHIFTS = ["A", "P", "N"]
    WEEK1 = list(range(1, 8))
    WEEK2 = list(range(8, 15))
    WEEKEND_DAYS = [6, 7, 13, 14]

    hard_requests_rn = hard_requests_rn or {}
    soft_requests_rn = soft_requests_rn or {}
    annual_leave_rn = annual_leave_rn or {}
    prev_week_roster_rn = prev_week_roster_rn or {}

    hard_requests_en = hard_requests_en or {}
    soft_requests_en = soft_requests_en or {}
    annual_leave_en = annual_leave_en or {}
    prev_week_roster_en = prev_week_roster_en or {}

    hard_requests_hca = hard_requests_hca or {}
    soft_requests_hca = soft_requests_hca or {}
    annual_leave_hca = annual_leave_hca or {}
    prev_week_roster_hca = prev_week_roster_hca or {}

    rn_nurses = list(rn_list)
    en_nurses = list(en_list)
    hca_nurses = list(hca_list)
    random.shuffle(rn_nurses)
    random.shuffle(en_nurses)
    random.shuffle(hca_nurses)

    default_weights = {"dev_shift": 1.0, "dev_day": 0.5, "AP": 3.0, "pref": 100.0, "weekend": 3.0, "rest": 25.0}
    if weights is None:
        weights = default_weights
    else:
        tmp = default_weights.copy()
        tmp.update(weights)
        weights = tmp

    m = ConcreteModel()
    m.D = RangeSet(1, 14)
    m.S = Set(initialize=SHIFTS)

    m.N_RN = Set(initialize=rn_nurses)
    m.N_EN = Set(initialize=en_nurses)
    m.N_HCA = Set(initialize=hca_nurses)

    m.x_rn = Var(m.N_RN, m.D, m.S, within=Binary)
    m.x_en = Var(m.N_EN, m.D, m.S, within=Binary)
    m.x_hca = Var(m.N_HCA, m.D, m.S, within=Binary)

    m.off_rn = Var(m.N_RN, m.D, within=Binary)
    m.off_en = Var(m.N_EN, m.D, within=Binary)
    m.off_hca = Var(m.N_HCA, m.D, within=Binary)

    m.dev_A_rn = Var(m.N_RN, within=NonNegativeReals)
    m.dev_P_rn = Var(m.N_RN, within=NonNegativeReals)
    m.dev_N_rn = Var(m.N_RN, within=NonNegativeReals)

    m.dev_A_en = Var(m.N_EN, within=NonNegativeReals)
    m.dev_P_en = Var(m.N_EN, within=NonNegativeReals)
    m.dev_N_en = Var(m.N_EN, within=NonNegativeReals)

    m.dev_A_hca = Var(m.N_HCA, within=NonNegativeReals)
    m.dev_P_hca = Var(m.N_HCA, within=NonNegativeReals)
    m.dev_N_hca = Var(m.N_HCA, within=NonNegativeReals)

    m.dev_day_rn = Var(m.D, m.S, within=NonNegativeReals)
    m.dev_day_en = Var(m.D, m.S, within=NonNegativeReals)
    m.dev_day_hca = Var(m.D, m.S, within=NonNegativeReals)

    m.dev_AP_rn = Var(m.D, within=NonNegativeReals)
    m.dev_AP_en = Var(m.D, within=NonNegativeReals)
    m.dev_AP_hca = Var(m.D, within=NonNegativeReals)

    m.weekend_dev_rn = Var(m.N_RN, within=NonNegativeReals)
    m.weekend_dev_en = Var(m.N_EN, within=NonNegativeReals)
    m.weekend_dev_hca = Var(m.N_HCA, within=NonNegativeReals)

    m.rest_violation_rn = Var(m.N_RN, within=Binary)
    m.rest_violation_en = Var(m.N_EN, within=Binary)
    m.rest_violation_hca = Var(m.N_HCA, within=Binary)

    m.pref_violate_rn = Var(m.N_RN, m.D, within=Binary)
    m.pref_violate_en = Var(m.N_EN, m.D, within=Binary)
    m.pref_violate_hca = Var(m.N_HCA, m.D, within=Binary)

    m.cons = ConstraintList()

    # ---------------------------------------
    # Nurse rules
    # ---------------------------------------
    def add_nurse_rules(class_nurses, x_var, off_var, annual_leave_dict, hard_requests_dict):
        for n in class_nurses:
            al_days = set(annual_leave_dict.get(n, []))
            other_nonwork_days = set()

            for d in DAYS:
                raw = hard_requests_dict.get(n, {}).get(f"Day {d}", "")
                kind, _ = classify_day_code(raw)
                if kind == "EQUIV_LEAVE":
                    al_days.add(d)
                elif kind == "OTHER_NONWORK":
                    other_nonwork_days.add(d)

            for d in DAYS:
                raw = hard_requests_dict.get(n, {}).get(f"Day {d}", "")
                kind, val = classify_day_code(raw)

                if kind == "WORK_SHIFT":
                    m.cons.add(off_var[n, d] == 0)
                    for s in SHIFTS:
                        m.cons.add(x_var[n, d, s] == (1 if s == val else 0))

                elif kind == "OFF":
                    m.cons.add(off_var[n, d] == 1)
                    for s in SHIFTS:
                        m.cons.add(x_var[n, d, s] == 0)

                elif kind in {"EQUIV_LEAVE", "OTHER_NONWORK"} or d in al_days or d in other_nonwork_days:
                    m.cons.add(off_var[n, d] == 0)
                    for s in SHIFTS:
                        m.cons.add(x_var[n, d, s] == 0)

                else:
                    m.cons.add(sum(x_var[n, d, s] for s in SHIFTS) + off_var[n, d] == 1)

            m.cons.add(
                sum(x_var[n, d, s] for d in DAYS for s in SHIFTS)
                + len(al_days)
                + len(other_nonwork_days)
                == 10
            )

            m.cons.add(sum(x_var[n, d, "N"] for d in WEEK1) <= 2)
            m.cons.add(sum(x_var[n, d, "N"] for d in WEEK2) <= 2)
            m.cons.add(sum(x_var[n, d, s] for d in WEEK1 for s in SHIFTS) <= 5)
            m.cons.add(sum(x_var[n, d, s] for d in WEEK2 for s in SHIFTS) <= 5)

            if any(d in WEEK1 for d in other_nonwork_days):
                m.cons.add(sum(off_var[n, d] for d in WEEK1) >= 2)
            if any(d in WEEK2 for d in other_nonwork_days):
                m.cons.add(sum(off_var[n, d] for d in WEEK2) >= 2)

            for d in range(1, 14):
                m.cons.add(x_var[n, d, "N"] + x_var[n, d+1, "A"] <= 1)
                m.cons.add(x_var[n, d, "N"] + x_var[n, d+1, "P"] <= 1)

    add_nurse_rules(rn_nurses, m.x_rn, m.off_rn, annual_leave_rn, hard_requests_rn)
    add_nurse_rules(en_nurses, m.x_en, m.off_en, annual_leave_en, hard_requests_en)
    add_nurse_rules(hca_nurses, m.x_hca, m.off_hca, annual_leave_hca, hard_requests_hca)

    # ---------------------------------------
    # Coverage
    # ---------------------------------------
    def add_coverage_for_class(class_nurses, x_var, class_cfg):
        normal_min = class_cfg.get("normal_min", {"A": 0, "P": 0, "N": 0})
        low_exact = class_cfg.get("low_exact", None)

        for d in DAYS:
            if low_exact is not None and d in LOW_DAYS:
                m.cons.add(sum(x_var[n, d, "A"] for n in class_nurses) == low_exact["A"])
                m.cons.add(sum(x_var[n, d, "P"] for n in class_nurses) == low_exact["P"])
                m.cons.add(sum(x_var[n, d, "N"] for n in class_nurses) == low_exact["N"])
            else:
                m.cons.add(sum(x_var[n, d, "A"] for n in class_nurses) >= normal_min["A"])
                m.cons.add(sum(x_var[n, d, "P"] for n in class_nurses) >= normal_min["P"])
                m.cons.add(sum(x_var[n, d, "N"] for n in class_nurses) >= normal_min["N"])

    add_coverage_for_class(rn_nurses, m.x_rn, rn_cfg)
    add_coverage_for_class(en_nurses, m.x_en, en_cfg)
    add_coverage_for_class(hca_nurses, m.x_hca, hca_cfg)

    if tot_cfg is not None:
        for d in DAYS:
            total_A = (
                sum(m.x_rn[n, d, "A"] for n in rn_nurses) +
                sum(m.x_en[n, d, "A"] for n in en_nurses) +
                sum(m.x_hca[n, d, "A"] for n in hca_nurses)
            )
            total_P = (
                sum(m.x_rn[n, d, "P"] for n in rn_nurses) +
                sum(m.x_en[n, d, "P"] for n in en_nurses) +
                sum(m.x_hca[n, d, "P"] for n in hca_nurses)
            )
            total_N = (
                sum(m.x_rn[n, d, "N"] for n in rn_nurses) +
                sum(m.x_en[n, d, "N"] for n in en_nurses) +
                sum(m.x_hca[n, d, "N"] for n in hca_nurses)
            )
            m.cons.add(total_A >= tot_cfg["A"])
            m.cons.add(total_P >= tot_cfg["P"])
            m.cons.add(total_N >= tot_cfg["N"])

    # ---------------------------------------
    # Shift balance per nurse (soft)
    # ---------------------------------------
    def add_shift_balance(class_nurses, x_var, dev_A, dev_P, dev_N, class_cfg):
        st = class_cfg.get("shift_target", {"A": 5, "P": 3, "N": 2})
        tA, tP, tN = st["A"], st["P"], st["N"]

        for n in class_nurses:
            total_A = sum(x_var[n, d, "A"] for d in DAYS)
            total_P = sum(x_var[n, d, "P"] for d in DAYS)
            total_N = sum(x_var[n, d, "N"] for d in DAYS)

            m.cons.add(total_A - tA <= dev_A[n]); m.cons.add(-(total_A - tA) <= dev_A[n])
            m.cons.add(total_P - tP <= dev_P[n]); m.cons.add(-(total_P - tP) <= dev_P[n])
            m.cons.add(total_N - tN <= dev_N[n]); m.cons.add(-(total_N - tN) <= dev_N[n])

    add_shift_balance(rn_nurses, m.x_rn, m.dev_A_rn, m.dev_P_rn, m.dev_N_rn, rn_cfg)
    add_shift_balance(en_nurses, m.x_en, m.dev_A_en, m.dev_P_en, m.dev_N_en, en_cfg)
    add_shift_balance(hca_nurses, m.x_hca, m.dev_A_hca, m.dev_P_hca, m.dev_N_hca, hca_cfg)

    # ---------------------------------------
    # Daily smoothing + A–P balance (soft)
    # ---------------------------------------
    day_target_rn = rn_cfg.get("day_target", {"A": 4, "P": 3, "N": 2})
    day_target_en = en_cfg.get("day_target", {"A": 4, "P": 3, "N": 2})
    day_target_hca = hca_cfg.get("day_target", {"A": 1, "P": 1, "N": 1})

    for d in DAYS:
        if not (rn_cfg.get("low_exact") is not None and d in LOW_DAYS):
            for s in SHIFTS:
                y = sum(m.x_rn[n, d, s] for n in rn_nurses)
                t = day_target_rn[s]
                m.cons.add(y - t <= m.dev_day_rn[d, s])
                m.cons.add(-(y - t) <= m.dev_day_rn[d, s])

        for s in SHIFTS:
            y = sum(m.x_en[n, d, s] for n in en_nurses); t = day_target_en[s]
            m.cons.add(y - t <= m.dev_day_en[d, s])
            m.cons.add(-(y - t) <= m.dev_day_en[d, s])

        for s in SHIFTS:
            y = sum(m.x_hca[n, d, s] for n in hca_nurses); t = day_target_hca[s]
            m.cons.add(y - t <= m.dev_day_hca[d, s])
            m.cons.add(-(y - t) <= m.dev_day_hca[d, s])

        A_rn = sum(m.x_rn[n, d, "A"] for n in rn_nurses)
        P_rn = sum(m.x_rn[n, d, "P"] for n in rn_nurses)
        m.cons.add(A_rn - P_rn <= m.dev_AP_rn[d]); m.cons.add(-(A_rn - P_rn) <= m.dev_AP_rn[d])

        A_en = sum(m.x_en[n, d, "A"] for n in en_nurses)
        P_en = sum(m.x_en[n, d, "P"] for n in en_nurses)
        m.cons.add(A_en - P_en <= m.dev_AP_en[d]); m.cons.add(-(A_en - P_en) <= m.dev_AP_en[d])

        A_h = sum(m.x_hca[n, d, "A"] for n in hca_nurses)
        P_h = sum(m.x_hca[n, d, "P"] for n in hca_nurses)
        m.cons.add(A_h - P_h <= m.dev_AP_hca[d]); m.cons.add(-(A_h - P_h) <= m.dev_AP_hca[d])

    # ---------------------------------------
    # Soft preferences
    # ---------------------------------------
    def add_soft_prefs(class_nurses, x_var, hard_requests_dict, soft_requests_dict, pref_violate):
        for n in class_nurses:
            for d in DAYS:
                hard_raw = hard_requests_dict.get(n, {}).get(f"Day {d}", "")
                hard_kind, _ = classify_day_code(hard_raw)
                if hard_kind != "NONE":
                    continue

                soft_raw = soft_requests_dict.get(n, {}).get(f"Day {d}", "")
                soft_kind, soft_val = classify_day_code(soft_raw)

                if soft_kind == "WORK_SHIFT":
                    m.cons.add(x_var[n, d, soft_val] >= 1 - pref_violate[n, d])
                elif soft_kind in {"OFF", "EQUIV_LEAVE", "OTHER_NONWORK"}:
                    m.cons.add(sum(x_var[n, d, s] for s in SHIFTS) <= pref_violate[n, d])

    add_soft_prefs(rn_nurses, m.x_rn, hard_requests_rn, soft_requests_rn, m.pref_violate_rn)
    add_soft_prefs(en_nurses, m.x_en, hard_requests_en, soft_requests_en, m.pref_violate_en)
    add_soft_prefs(hca_nurses, m.x_hca, hard_requests_hca, soft_requests_hca, m.pref_violate_hca)

    # Weekend fairness
    def add_weekend_fairness(class_nurses, x_var, weekend_dev):
        for n in class_nurses:
            weekend_n = sum(x_var[n, d, "N"] for d in WEEKEND_DAYS)
            m.cons.add(weekend_n - 0.5 <= weekend_dev[n])
            m.cons.add(-(weekend_n - 0.5) <= weekend_dev[n])

    add_weekend_fairness(rn_nurses, m.x_rn, m.weekend_dev_rn)
    add_weekend_fairness(en_nurses, m.x_en, m.weekend_dev_en)
    add_weekend_fairness(hca_nurses, m.x_hca, m.weekend_dev_hca)

    # Prev week rest
    def add_prev_week_constraints(class_nurses, x_var, prev_week_roster_dict, rest_violation):
        for n in class_nurses:
            if str(prev_week_roster_dict.get(n, "")).strip().upper() == "N":
                worked_day1 = sum(x_var[n, 1, s] for s in SHIFTS)
                m.cons.add(rest_violation[n] >= worked_day1)
            else:
                m.cons.add(rest_violation[n] >= 0)

    add_prev_week_constraints(rn_nurses, m.x_rn, prev_week_roster_rn, m.rest_violation_rn)
    add_prev_week_constraints(en_nurses, m.x_en, prev_week_roster_en, m.rest_violation_en)
    add_prev_week_constraints(hca_nurses, m.x_hca, prev_week_roster_hca, m.rest_violation_hca)

    # Objective
    λ_dev_shift = weights["dev_shift"]
    λ_dev_day = weights["dev_day"]
    λ_AP = weights["AP"]
    λ_pref = weights["pref"]
    λ_weekend = weights["weekend"]
    λ_rest = weights["rest"]

    m.obj = Objective(
        expr=
            λ_dev_shift * sum(m.dev_A_rn[n] + m.dev_P_rn[n] + 2*m.dev_N_rn[n] for n in rn_nurses)
            + λ_dev_day * sum(m.dev_day_rn[d, s] for d in DAYS for s in SHIFTS)
            + λ_AP * sum(m.dev_AP_rn[d] for d in DAYS)
            + λ_pref * sum(m.pref_violate_rn[n, d] for n in rn_nurses for d in DAYS)
            + λ_weekend * sum(m.weekend_dev_rn[n] for n in rn_nurses)
            + λ_rest * sum(m.rest_violation_rn[n] for n in rn_nurses)
            + λ_dev_shift * sum(m.dev_A_en[n] + m.dev_P_en[n] + 2*m.dev_N_en[n] for n in en_nurses)
            + λ_dev_day * sum(m.dev_day_en[d, s] for d in DAYS for s in SHIFTS)
            + λ_AP * sum(m.dev_AP_en[d] for d in DAYS)
            + λ_pref * sum(m.pref_violate_en[n, d] for n in en_nurses for d in DAYS)
            + λ_weekend * sum(m.weekend_dev_en[n] for n in en_nurses)
            + λ_rest * sum(m.rest_violation_en[n] for n in en_nurses)
            + λ_dev_shift * sum(m.dev_A_hca[n] + m.dev_P_hca[n] + 2*m.dev_N_hca[n] for n in hca_nurses)
            + λ_dev_day * sum(m.dev_day_hca[d, s] for d in DAYS for s in SHIFTS)
            + λ_AP * sum(m.dev_AP_hca[d] for d in DAYS)
            + λ_pref * sum(m.pref_violate_hca[n, d] for n in hca_nurses for d in DAYS)
            + λ_weekend * sum(m.weekend_dev_hca[n] for n in hca_nurses)
            + λ_rest * sum(m.rest_violation_hca[n] for n in hca_nurses),
        sense=minimize
    )

    # Solve
    solver = SolverFactory(solver_name)
    res = solver.solve(m, tee=False)

    if res.solver.termination_condition != TerminationCondition.optimal:
        raise RuntimeError(
            f"{dept_name} infeasible or not optimal: {res.solver.termination_condition}"
        )

    # Build rosters
    days_cols = [f"Day {d}" for d in DAYS]
    roster_rn = pd.DataFrame(index=rn_nurses, columns=days_cols)
    roster_en = pd.DataFrame(index=en_nurses, columns=days_cols)
    roster_hca = pd.DataFrame(index=hca_nurses, columns=days_cols)

    def fill_roster(roster_df, class_nurses, x_var, off_var, hard_requests_dict):
        for n in class_nurses:
            for d in DAYS:
                day_key = f"Day {d}"
                raw = hard_requests_dict.get(n, {}).get(day_key, "")
                kind, val = classify_day_code(raw)

                if kind in {"OFF", "EQUIV_LEAVE", "OTHER_NONWORK"}:
                    roster_df.loc[n, day_key] = val
                else:
                    if off_var[n, d]() == 1:
                        roster_df.loc[n, day_key] = "DO"
                    else:
                        assigned = None
                        for s in SHIFTS:
                            if x_var[n, d, s]() == 1:
                                assigned = s
                                break
                        roster_df.loc[n, day_key] = assigned if assigned else "DO"

        return roster_df.reindex(sorted(roster_df.index)).copy()

    roster_rn = fill_roster(roster_rn, rn_nurses, m.x_rn, m.off_rn, hard_requests_rn)
    roster_en = fill_roster(roster_en, en_nurses, m.x_en, m.off_en, hard_requests_en)
    roster_hca = fill_roster(roster_hca, hca_nurses, m.x_hca, m.off_hca, hard_requests_hca)

    print(f"{dept_name} multi-class roster built: RN={len(rn_nurses)}, EN={len(en_nurses)}, HCA={len(hca_nurses)}")
    return roster_rn, roster_en, roster_hca


def format_output(nurses, roster_rn, roster_en, roster_hca, num_days):
    """
    Convert MILP DataFrames to standardized JSON output.
    
    Returns:
        Standardized dict with structure matching GA output
    """
    # Combine all rosters
    all_rosters = []
    
    if not roster_rn.empty:
        all_rosters.append(('RN', 'A', roster_rn))
    if not roster_en.empty:
        all_rosters.append(('EN', 'B', roster_en))
    if not roster_hca.empty:
        all_rosters.append(('HCA', 'C', roster_hca))
    
    # Create name to nurse mapping
    name_to_nurse = {n["name"]: n for n in nurses}
    
    # MILP shift code to standard shift name mapping
    shift_code_map = {
        "A": "AM",
        "P": "PM",
        "N": "NIGHT",
        "DO": "OFF",
        "AL": "LEAVE",
        "INHT": "TRAINING",
        "BL": "STUDY"
    }
    
    output_nurses = []
    
    for nurse_class, rank, roster_df in all_rosters:
        for nurse_name in roster_df.index:
            if nurse_name not in name_to_nurse:
                continue
            
            nurse_info = name_to_nurse[nurse_name]
            schedule = []
            
            # Extract schedule for each day
            for day in range(1, num_days + 1):
                day_key = f"Day {day}"
                shift_code = str(roster_df.loc[nurse_name, day_key])
                
                # Convert MILP code to standard shift name
                shift_name = shift_code_map.get(shift_code, shift_code)
                schedule.append(shift_name)
            
            # Calculate statistics
            stats = {
                "total_shifts": sum(1 for s in schedule if s in ["AM", "PM", "NIGHT"]),
                "am_shifts": schedule.count("AM"),
                "pm_shifts": schedule.count("PM"),
                "night_shifts": schedule.count("NIGHT"),
                "days_off": schedule.count("OFF")
            }
            
            output_nurses.append({
                "id": nurse_info["id"],
                "name": nurse_info["name"],
                "rank": nurse_info["rank"],
                "schedule": schedule,
                "stats": stats
            })
    
    # Sort by nurse ID
    output_nurses.sort(key=lambda x: x["id"])
    
    return {
        "nurses": output_nurses,
        "metadata": {
            "num_days": num_days,
            "num_nurses": len(output_nurses),
            "algorithm": "MILP",
            "solver_status": "optimal"
        }
    }