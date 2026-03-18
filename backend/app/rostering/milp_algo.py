# MILP nurse rostering algorithm.
# Mirrors the logic in the original MILP.ipynb notebook while remaining
# compatible with the algo_scheduler.py pipeline interface.
#
# Expected call from algo_scheduler:
#   run_milp_pipeline(nurses, shifts, requests, ward_name="DEFAULT")
#
# Input formats (as produced by algo_scheduler / validate_inputs):
#   nurses   : [{"id": int|str, "name": str, "rank": "A"|"B"|"C"}, ...]
#   shifts   : 14-element list of {"AM": {"A":int,"B":int,"C":int}, "PM":..., "NIGHT":...}
#   requests : {nurse_id: [(day_idx_0based, "AM"|"PM"|"NIGHT"|"OFF"|"AL"), ...], ...}
#              OR None
#   ward_name: str key into WARD_CONFIG (defaults to "DEFAULT")

import random
import pandas as pd
from pyomo.environ import (
    ConcreteModel, Set, RangeSet, Var, Binary, NonNegativeReals,
    ConstraintList, Objective, minimize, SolverFactory, TerminationCondition,
)

from app.rostering.ward_config import WARD_CONFIG


# ---------------------------------------------------------------------------
# Public exception
# ---------------------------------------------------------------------------
class MILPError(Exception):
    """Raised when the MILP solver fails or finds no feasible solution."""
    pass


# ---------------------------------------------------------------------------
# Day-code classifier  (mirrors notebook classify_day_code)
# ---------------------------------------------------------------------------
_WORK_SHIFTS     = {"A", "P", "N"}
_OFF_CODES       = {"DO", "OFF"}
_EQUIV_LEAVE     = {"AL"}

def _classify(raw):
    """
    Returns (kind, val).
    kind in {"NONE", "WORK_SHIFT", "OFF", "EQUIV_LEAVE", "OTHER_NONWORK"}
    """
    if raw is None:
        return ("NONE", "")
    s = str(raw).strip().upper()
    if s in ("", "NAN"):
        return ("NONE", "")
    if s in _WORK_SHIFTS:
        return ("WORK_SHIFT", s)
    if s in _OFF_CODES:
        return ("OFF", s)
    if s in _EQUIV_LEAVE:
        return ("EQUIV_LEAVE", s)
    return ("OTHER_NONWORK", s)   # INHT / BL / …


# ---------------------------------------------------------------------------
# Prev-week carry-over helpers  (mirrors notebook _normalize_last2 / _carry_state)
# ---------------------------------------------------------------------------
def _normalize_last2(entry):
    """
    Accepts None, list/tuple of 2 codes, or dict with key 'last2'.
    Returns (code_day13, code_day14) as uppercase strings.
    """
    if entry is None:
        return ("", "")
    if isinstance(entry, dict):
        vals = entry.get("last2", ["", ""])
        if len(vals) < 2:
            vals = list(vals) + [""] * (2 - len(vals))
        return (str(vals[0]).strip().upper(), str(vals[1]).strip().upper())
    if isinstance(entry, (list, tuple)):
        vals = list(entry)
        if len(vals) < 2:
            vals = vals + [""] * (2 - len(vals))
        return (str(vals[0]).strip().upper(), str(vals[1]).strip().upper())
    return ("", "")


def _carry_state_from_last2(entry):
    """
    Returns one of:
      'NONE'      – no carry-in obligation
      'NEED_DO'   – previous horizon ended N,N → day 1 must be DO
      'NEED_N_DO' – previous horizon ended ?,N → day 1 must be N and day 2 must be DO
    """
    d13, d14 = _normalize_last2(entry)
    if d13 == "N" and d14 == "N":
        return "NEED_DO"
    if d14 == "N":
        return "NEED_N_DO"
    return "NONE"


# ---------------------------------------------------------------------------
# Input parser
# ---------------------------------------------------------------------------
def _parse_inputs(nurses, shifts, requests):
    """
    Convert algo_scheduler-style inputs into notebook-style dicts.

    Returns
    -------
    dict with keys:
        rn_list, en_list, hca_list          - name lists
        hard_requests_rn/en/hca             - {name: {"Day X": code}}
        soft_requests_rn/en/hca             - always {} (scheduler has no soft channel yet)
        annual_leave_rn/en/hca              - always {} (AL folded into hard_requests)
        prev_week_roster_rn/en/hca          - always {} (not yet surfaced by scheduler)
        num_days                            - int
    """
    requests = requests or {}
    num_days = len(shifts)

    # Rank → class
    _rank_class = {"A": "RN", "B": "EN", "C": "HCA"}

    rn_list, en_list, hca_list = [], [], []
    id_to_nurse = {}

    for n in nurses:
        id_to_nurse[n["id"]] = n
        cls = _rank_class.get(n["rank"])
        if cls == "RN":
            rn_list.append(n["name"])
        elif cls == "EN":
            en_list.append(n["name"])
        elif cls == "HCA":
            hca_list.append(n["name"])

    # Shift-name translation: scheduler uses AM/PM/NIGHT/OFF/AL
    # notebook model uses A/P/N/DO/AL
    _sched_to_milp = {
        "AM":    "A",
        "PM":    "P",
        "NIGHT": "N",
        "OFF":   "DO",
        "AL":    "AL",
    }

    hard_rn, hard_en, hard_hca = {}, {}, {}

    for nurse_id, req_list in requests.items():
        if nurse_id not in id_to_nurse:
            continue
        nurse = id_to_nurse[nurse_id]
        name  = nurse["name"]
        cls   = _rank_class.get(nurse["rank"])

        target = {"RN": hard_rn, "EN": hard_en, "HCA": hard_hca}.get(cls)
        if target is None:
            continue

        target.setdefault(name, {})
        for day_idx, shift_name in req_list:
            if 0 <= day_idx < num_days:
                milp_code = _sched_to_milp.get(str(shift_name).upper(), "")
                if milp_code:
                    target[name][f"Day {day_idx + 1}"] = milp_code

    return {
        "rn_list":  rn_list,
        "en_list":  en_list,
        "hca_list": hca_list,
        "hard_requests_rn":  hard_rn,
        "hard_requests_en":  hard_en,
        "hard_requests_hca": hard_hca,
        "soft_requests_rn":  {},
        "soft_requests_en":  {},
        "soft_requests_hca": {},
        "annual_leave_rn":   {},
        "annual_leave_en":   {},
        "annual_leave_hca":  {},
        # prev_week_last2: {nurse_name: [code_day13, code_day14]} or {}
        # not yet surfaced by algo_scheduler, so always empty here
        "prev_week_last2_rn":  {},
        "prev_week_last2_en":  {},
        "prev_week_last2_hca": {},
        "num_days": num_days,
    }


# ---------------------------------------------------------------------------
# Output formatter
# ---------------------------------------------------------------------------
def _format_output(nurses, roster_rn, roster_en, roster_hca, num_days):
    """Convert DataFrames → standardised JSON matching GA output shape."""
    _milp_to_sched = {
        "A":    "AM",
        "P":    "PM",
        "N":    "NIGHT",
        "DO":   "OFF",
        "AL":   "LEAVE",
        "INHT": "TRAINING",
        "BL":   "STUDY",
    }

    name_to_nurse = {n["name"]: n for n in nurses}
    output_nurses = []

    for rank_label, roster_df in (("A", roster_rn), ("B", roster_en), ("C", roster_hca)):
        if roster_df is None or roster_df.empty:
            continue
        for nurse_name in roster_df.index:
            if nurse_name not in name_to_nurse:
                continue
            nurse_info = name_to_nurse[nurse_name]
            schedule = []
            for day in range(1, num_days + 1):
                code = str(roster_df.loc[nurse_name, f"Day {day}"])
                schedule.append(_milp_to_sched.get(code, code))

            stats = {
                "total_shifts": sum(1 for s in schedule if s in ("AM", "PM", "NIGHT")),
                "am_shifts":    schedule.count("AM"),
                "pm_shifts":    schedule.count("PM"),
                "night_shifts": schedule.count("NIGHT"),
                "days_off":     schedule.count("OFF"),
            }
            output_nurses.append({
                "id":       nurse_info["id"],
                "name":     nurse_info["name"],
                "rank":     nurse_info["rank"],
                "schedule": schedule,
                "stats":    stats,
            })

    output_nurses.sort(key=lambda x: x["id"])
    return {
        "nurses": output_nurses,
        "metadata": {
            "num_days":    num_days,
            "num_nurses":  len(output_nurses),
            "algorithm":   "MILP",
            "solver_status": "optimal",
        },
    }


# ---------------------------------------------------------------------------
# Core Pyomo solver  (mirrors the notebook's generate_multi_roster_pyomo)
# ---------------------------------------------------------------------------
def _solve(
    rn_list, en_list, hca_list,
    dept_name="DEFAULT",
    hard_requests_rn=None,  soft_requests_rn=None,
    annual_leave_rn=None,   prev_week_last2_rn=None,
    hard_requests_en=None,  soft_requests_en=None,
    annual_leave_en=None,   prev_week_last2_en=None,
    hard_requests_hca=None, soft_requests_hca=None,
    annual_leave_hca=None,  prev_week_last2_hca=None,
    solver_name="gurobi",
    weights=None,
):
    if dept_name not in WARD_CONFIG:
        dept_name = "DEFAULT"

    cfg      = WARD_CONFIG[dept_name]
    LOW_DAYS = set(cfg.get("LOW_DAYS", set()))
    rn_cfg   = cfg["RN"]
    en_cfg   = cfg["EN"]
    hca_cfg  = cfg["HCA"]
    tot_cfg  = cfg.get("TOTAL_MIN")

    DAYS         = list(range(1, 15))
    SHIFTS       = ["A", "P", "N"]
    WEEK1        = list(range(1, 8))
    WEEK2        = list(range(8, 15))
    WEEKEND_DAYS = [6, 7, 13, 14]

    hard_requests_rn     = hard_requests_rn     or {}
    soft_requests_rn     = soft_requests_rn     or {}
    annual_leave_rn      = annual_leave_rn      or {}
    prev_week_last2_rn   = prev_week_last2_rn   or {}

    hard_requests_en     = hard_requests_en     or {}
    soft_requests_en     = soft_requests_en     or {}
    annual_leave_en      = annual_leave_en      or {}
    prev_week_last2_en   = prev_week_last2_en   or {}

    hard_requests_hca    = hard_requests_hca    or {}
    soft_requests_hca    = soft_requests_hca    or {}
    annual_leave_hca     = annual_leave_hca     or {}
    prev_week_last2_hca  = prev_week_last2_hca  or {}

    rn_nurses  = list(rn_list);  random.shuffle(rn_nurses)
    en_nurses  = list(en_list);  random.shuffle(en_nurses)
    hca_nurses = list(hca_list); random.shuffle(hca_nurses)

    _default_w = {
        "dev_shift": 1.0, "dev_day": 0.5, "AP": 3.0,
        "pref": 100.0, "weekend": 3.0, "rest": 25.0,
    }
    if weights is None:
        weights = _default_w
    else:
        tmp = _default_w.copy(); tmp.update(weights); weights = tmp

    # ---- Build model ----
    m = ConcreteModel()
    m.D   = RangeSet(1, 14)
    m.S   = Set(initialize=SHIFTS)
    m.N_RN  = Set(initialize=rn_nurses)
    m.N_EN  = Set(initialize=en_nurses)
    m.N_HCA = Set(initialize=hca_nurses)

    m.x_rn  = Var(m.N_RN,  m.D, m.S, within=Binary)
    m.x_en  = Var(m.N_EN,  m.D, m.S, within=Binary)
    m.x_hca = Var(m.N_HCA, m.D, m.S, within=Binary)

    m.off_rn  = Var(m.N_RN,  m.D, within=Binary)
    m.off_en  = Var(m.N_EN,  m.D, within=Binary)
    m.off_hca = Var(m.N_HCA, m.D, within=Binary)

    # night-block start variables (N-N-DO block enforcement)
    m.startN_rn  = Var(m.N_RN,  m.D, within=Binary)
    m.startN_en  = Var(m.N_EN,  m.D, within=Binary)
    m.startN_hca = Var(m.N_HCA, m.D, within=Binary)

    # Deviation variables for soft objectives
    for grp, nurses in (("rn", rn_nurses), ("en", en_nurses), ("hca", hca_nurses)):
        N = Set(initialize=nurses)
        for attr in ("dev_A", "dev_P", "dev_N"):
            setattr(m, f"{attr}_{grp}", Var(getattr(m, f"N_{grp.upper()}"), within=NonNegativeReals))
        setattr(m, f"dev_day_{grp}",   Var(m.D, m.S, within=NonNegativeReals))
        setattr(m, f"dev_AP_{grp}",    Var(m.D,      within=NonNegativeReals))
        setattr(m, f"weekend_dev_{grp}", Var(getattr(m, f"N_{grp.upper()}"), within=NonNegativeReals))
        setattr(m, f"rest_violation_{grp}", Var(getattr(m, f"N_{grp.upper()}"), within=Binary))
        setattr(m, f"pref_violate_{grp}",   Var(getattr(m, f"N_{grp.upper()}"), m.D, within=Binary))

    m.cons = ConstraintList()

    # ---- Nurse rules (mirrors notebook generate_multi_roster_pyomo) ----
    def add_nurse_rules(class_nurses, x_var, off_var, startN_var,
                        al_dict, hard_dict, prev_week_last2_dict):
        for n in class_nurses:
            al_days           = set(al_dict.get(n, []))
            other_nonwork_days = set()
            carry_state = _carry_state_from_last2(prev_week_last2_dict.get(n))

            # scan hard requests to collect AL / INHT/BL days
            for d in DAYS:
                raw = hard_dict.get(n, {}).get(f"Day {d}", "")
                kind, _ = _classify(raw)
                if kind == "EQUIV_LEAVE":
                    al_days.add(d)
                elif kind == "OTHER_NONWORK":
                    other_nonwork_days.add(d)

            # carry-in obligations from previous horizon
            if carry_state == "NEED_DO":
                # previous horizon ended N,N → day 1 must be DO
                m.cons.add(off_var[n, 1] == 1)
                for s in SHIFTS:
                    m.cons.add(x_var[n, 1, s] == 0)

            elif carry_state == "NEED_N_DO":
                # previous horizon ended ?,N → day 1 = N, day 2 = DO
                m.cons.add(off_var[n, 1] == 0)
                m.cons.add(x_var[n, 1, "N"] == 1)
                m.cons.add(x_var[n, 1, "A"] == 0)
                m.cons.add(x_var[n, 1, "P"] == 0)
                m.cons.add(off_var[n, 2] == 1)
                for s in SHIFTS:
                    m.cons.add(x_var[n, 2, s] == 0)

            # daily linking
            for d in DAYS:
                # skip days already forced by carry-in
                if carry_state == "NEED_DO" and d == 1:
                    continue
                if carry_state == "NEED_N_DO" and d in {1, 2}:
                    continue

                raw = hard_dict.get(n, {}).get(f"Day {d}", "")
                kind, val = _classify(raw)

                if kind == "WORK_SHIFT":
                    m.cons.add(off_var[n, d] == 0)
                    for s in SHIFTS:
                        m.cons.add(x_var[n, d, s] == (1 if s == val else 0))

                elif kind == "OFF":
                    m.cons.add(off_var[n, d] == 1)
                    for s in SHIFTS:
                        m.cons.add(x_var[n, d, s] == 0)

                elif kind in ("EQUIV_LEAVE", "OTHER_NONWORK") or d in al_days or d in other_nonwork_days:
                    # AL / INHT / BL / … : non-working, NOT DO
                    m.cons.add(off_var[n, d] == 0)
                    for s in SHIFTS:
                        m.cons.add(x_var[n, d, s] == 0)

                else:
                    # free day: exactly one of work-shifts or DO
                    m.cons.add(sum(x_var[n, d, s] for s in SHIFTS) + off_var[n, d] == 1)

            # 10 equivalent shifts = actual shifts + AL days + OTHER_NONWORK days
            m.cons.add(
                sum(x_var[n, d, s] for d in DAYS for s in SHIFTS)
                + len(al_days) + len(other_nonwork_days)
                == 10
            )

            # Weekly caps on actual shifts
            m.cons.add(sum(x_var[n, d, "N"] for d in WEEK1) <= 2)
            m.cons.add(sum(x_var[n, d, "N"] for d in WEEK2) <= 2)
            m.cons.add(sum(x_var[n, d, s] for d in WEEK1 for s in SHIFTS) <= 5)
            m.cons.add(sum(x_var[n, d, s] for d in WEEK2 for s in SHIFTS) <= 5)

            # INHT/BL in a week → still need ≥2 DO in that week
            if any(d in WEEK1 for d in other_nonwork_days):
                m.cons.add(sum(off_var[n, d] for d in WEEK1) >= 2)
            if any(d in WEEK2 for d in other_nonwork_days):
                m.cons.add(sum(off_var[n, d] for d in WEEK2) >= 2)

            # ---- N-N-DO block rules ----
            # no two block starts on consecutive days
            for d in range(1, 14):
                m.cons.add(startN_var[n, d] + startN_var[n, d + 1] <= 1)

            # if a block starts on day d → d and d+1 are N, d+2 is DO
            for d in range(1, 13):
                m.cons.add(x_var[n, d,     "N"] >= startN_var[n, d])
                m.cons.add(x_var[n, d + 1, "N"] >= startN_var[n, d])
                m.cons.add(off_var[n, d + 2]    >= startN_var[n, d])

            # block starting on day 13 → days 13,14 are N (next horizon handles the DO)
            m.cons.add(x_var[n, 13, "N"] >= startN_var[n, 13])
            m.cons.add(x_var[n, 14, "N"] >= startN_var[n, 13])

            # block starting on day 14 → day 14 is N (next horizon handles N,DO)
            m.cons.add(x_var[n, 14, "N"] >= startN_var[n, 14])

            # every N must belong to exactly one valid block
            if carry_state == "NEED_N_DO":
                # day 1 is the second N from the previous horizon's block
                m.cons.add(x_var[n, 1, "N"] == 1)
                m.cons.add(startN_var[n, 1] == 0)
            else:
                m.cons.add(x_var[n, 1, "N"] == startN_var[n, 1])

            for d in range(2, 15):
                m.cons.add(x_var[n, d, "N"] == startN_var[n, d] + startN_var[n, d - 1])

    add_nurse_rules(rn_nurses,  m.x_rn,  m.off_rn,  m.startN_rn,
                    annual_leave_rn,  hard_requests_rn,  prev_week_last2_rn)
    add_nurse_rules(en_nurses,  m.x_en,  m.off_en,  m.startN_en,
                    annual_leave_en,  hard_requests_en,  prev_week_last2_en)
    add_nurse_rules(hca_nurses, m.x_hca, m.off_hca, m.startN_hca,
                    annual_leave_hca, hard_requests_hca, prev_week_last2_hca)

    # ---- Coverage constraints ----
    def add_coverage(class_nurses, x_var, class_cfg):
        normal_min = class_cfg.get("normal_min", {"A": 0, "P": 0, "N": 0})
        low_exact  = class_cfg.get("low_exact")
        for d in DAYS:
            if low_exact is not None and d in LOW_DAYS:
                for s, key in (("A","A"), ("P","P"), ("N","N")):
                    m.cons.add(sum(x_var[n, d, s] for n in class_nurses) == low_exact[key])
            else:
                for s, key in (("A","A"), ("P","P"), ("N","N")):
                    m.cons.add(sum(x_var[n, d, s] for n in class_nurses) >= normal_min[key])

    add_coverage(rn_nurses,  m.x_rn,  rn_cfg)
    add_coverage(en_nurses,  m.x_en,  en_cfg)
    add_coverage(hca_nurses, m.x_hca, hca_cfg)

    if tot_cfg:
        for d in DAYS:
            for s, key in (("A","A"), ("P","P"), ("N","N")):
                total = (
                    sum(m.x_rn[n,  d, s] for n in rn_nurses)
                  + sum(m.x_en[n,  d, s] for n in en_nurses)
                  + sum(m.x_hca[n, d, s] for n in hca_nurses)
                )
                m.cons.add(total >= tot_cfg[key])

    # ---- Shift-balance deviations (soft) ----
    def add_shift_balance(class_nurses, x_var, dev_A, dev_P, dev_N, class_cfg):
        st = class_cfg.get("shift_target", {"A": 5, "P": 3, "N": 2})
        tA, tP, tN = st["A"], st["P"], st["N"]
        for n in class_nurses:
            tA_ = sum(x_var[n, d, "A"] for d in DAYS)
            tP_ = sum(x_var[n, d, "P"] for d in DAYS)
            tN_ = sum(x_var[n, d, "N"] for d in DAYS)
            m.cons.add(tA_ - tA <= dev_A[n]); m.cons.add(-(tA_ - tA) <= dev_A[n])
            m.cons.add(tP_ - tP <= dev_P[n]); m.cons.add(-(tP_ - tP) <= dev_P[n])
            m.cons.add(tN_ - tN <= dev_N[n]); m.cons.add(-(tN_ - tN) <= dev_N[n])

    add_shift_balance(rn_nurses,  m.x_rn,  m.dev_A_rn,  m.dev_P_rn,  m.dev_N_rn,  rn_cfg)
    add_shift_balance(en_nurses,  m.x_en,  m.dev_A_en,  m.dev_P_en,  m.dev_N_en,  en_cfg)
    add_shift_balance(hca_nurses, m.x_hca, m.dev_A_hca, m.dev_P_hca, m.dev_N_hca, hca_cfg)

    # ---- Daily smoothing + A–P balance (soft) ----
    dt_rn  = rn_cfg.get("day_target",  {"A": 4, "P": 3, "N": 2})
    dt_en  = en_cfg.get("day_target",  {"A": 4, "P": 3, "N": 2})
    dt_hca = hca_cfg.get("day_target", {"A": 1, "P": 1, "N": 1})

    for d in DAYS:
        # RN smoothing (skip LOW_DAYS when low_exact active)
        if not (rn_cfg.get("low_exact") is not None and d in LOW_DAYS):
            for s in SHIFTS:
                y = sum(m.x_rn[n, d, s] for n in rn_nurses)
                t = dt_rn[s]
                m.cons.add(y - t <= m.dev_day_rn[d, s])
                m.cons.add(-(y - t) <= m.dev_day_rn[d, s])

        for s in SHIFTS:
            y = sum(m.x_en[n, d, s] for n in en_nurses); t = dt_en[s]
            m.cons.add(y - t <= m.dev_day_en[d, s])
            m.cons.add(-(y - t) <= m.dev_day_en[d, s])

        for s in SHIFTS:
            y = sum(m.x_hca[n, d, s] for n in hca_nurses); t = dt_hca[s]
            m.cons.add(y - t <= m.dev_day_hca[d, s])
            m.cons.add(-(y - t) <= m.dev_day_hca[d, s])

        # A–P balance
        for x_var, dev_AP in (
            (m.x_rn,  m.dev_AP_rn),
            (m.x_en,  m.dev_AP_en),
            (m.x_hca, m.dev_AP_hca),
        ):
            nurses_grp = {"x_rn": rn_nurses, "x_en": en_nurses, "x_hca": hca_nurses}
            # resolve which nurse list belongs to this x_var
            pass  # handled inline below

        A_rn = sum(m.x_rn[n, d, "A"] for n in rn_nurses)
        P_rn = sum(m.x_rn[n, d, "P"] for n in rn_nurses)
        m.cons.add(A_rn - P_rn <= m.dev_AP_rn[d]); m.cons.add(-(A_rn - P_rn) <= m.dev_AP_rn[d])

        A_en = sum(m.x_en[n, d, "A"] for n in en_nurses)
        P_en = sum(m.x_en[n, d, "P"] for n in en_nurses)
        m.cons.add(A_en - P_en <= m.dev_AP_en[d]); m.cons.add(-(A_en - P_en) <= m.dev_AP_en[d])

        A_h = sum(m.x_hca[n, d, "A"] for n in hca_nurses)
        P_h = sum(m.x_hca[n, d, "P"] for n in hca_nurses)
        m.cons.add(A_h - P_h <= m.dev_AP_hca[d]); m.cons.add(-(A_h - P_h) <= m.dev_AP_hca[d])

    # ---- Soft preferences ----
    def add_soft_prefs(class_nurses, x_var, hard_dict, soft_dict, pref_viol):
        for n in class_nurses:
            for d in DAYS:
                hard_raw = hard_dict.get(n, {}).get(f"Day {d}", "")
                if _classify(hard_raw)[0] != "NONE":
                    continue  # hard request already pinned this day
                soft_raw = soft_dict.get(n, {}).get(f"Day {d}", "")
                kind, val = _classify(soft_raw)
                if kind == "WORK_SHIFT":
                    m.cons.add(x_var[n, d, val] >= 1 - pref_viol[n, d])
                elif kind in ("OFF", "EQUIV_LEAVE", "OTHER_NONWORK"):
                    m.cons.add(sum(x_var[n, d, s] for s in SHIFTS) <= pref_viol[n, d])

    add_soft_prefs(rn_nurses,  m.x_rn,  hard_requests_rn,  soft_requests_rn,  m.pref_violate_rn)
    add_soft_prefs(en_nurses,  m.x_en,  hard_requests_en,  soft_requests_en,  m.pref_violate_en)
    add_soft_prefs(hca_nurses, m.x_hca, hard_requests_hca, soft_requests_hca, m.pref_violate_hca)

    # ---- Weekend fairness ----
    def add_weekend_fair(class_nurses, x_var, wdev):
        for n in class_nurses:
            wn = sum(x_var[n, d, "N"] for d in WEEKEND_DAYS)
            m.cons.add(wn - 0.5 <= wdev[n])
            m.cons.add(-(wn - 0.5) <= wdev[n])

    add_weekend_fair(rn_nurses,  m.x_rn,  m.weekend_dev_rn)
    add_weekend_fair(en_nurses,  m.x_en,  m.weekend_dev_en)
    add_weekend_fair(hca_nurses, m.x_hca, m.weekend_dev_hca)

    # ---- Previous-week rest (uses last-2-days carry-over) ----
    def add_prev_week_constraints(class_nurses, x_var, prev_week_last2_dict, rest_viol):
        for n in class_nurses:
            _, prev_last = _normalize_last2(prev_week_last2_dict.get(n))
            if prev_last == "N":
                # previous horizon's last day was N → rest violation if day 1 is worked
                worked_day1 = sum(x_var[n, 1, s] for s in SHIFTS)
                m.cons.add(rest_viol[n] >= worked_day1)
            else:
                m.cons.add(rest_viol[n] >= 0)

    add_prev_week_constraints(rn_nurses,  m.x_rn,  prev_week_last2_rn,  m.rest_violation_rn)
    add_prev_week_constraints(en_nurses,  m.x_en,  prev_week_last2_en,  m.rest_violation_en)
    add_prev_week_constraints(hca_nurses, m.x_hca, prev_week_last2_hca, m.rest_violation_hca)

    # ---- Objective ----
    lw = weights
    m.obj = Objective(
        expr=(
            lw["dev_shift"] * sum(m.dev_A_rn[n] + m.dev_P_rn[n] + 2*m.dev_N_rn[n] for n in rn_nurses)
          + lw["dev_day"]   * sum(m.dev_day_rn[d, s] for d in DAYS for s in SHIFTS)
          + lw["AP"]        * sum(m.dev_AP_rn[d] for d in DAYS)
          + lw["pref"]      * sum(m.pref_violate_rn[n, d] for n in rn_nurses for d in DAYS)
          + lw["weekend"]   * sum(m.weekend_dev_rn[n] for n in rn_nurses)
          + lw["rest"]      * sum(m.rest_violation_rn[n] for n in rn_nurses)

          + lw["dev_shift"] * sum(m.dev_A_en[n] + m.dev_P_en[n] + 2*m.dev_N_en[n] for n in en_nurses)
          + lw["dev_day"]   * sum(m.dev_day_en[d, s] for d in DAYS for s in SHIFTS)
          + lw["AP"]        * sum(m.dev_AP_en[d] for d in DAYS)
          + lw["pref"]      * sum(m.pref_violate_en[n, d] for n in en_nurses for d in DAYS)
          + lw["weekend"]   * sum(m.weekend_dev_en[n] for n in en_nurses)
          + lw["rest"]      * sum(m.rest_violation_en[n] for n in en_nurses)

          + lw["dev_shift"] * sum(m.dev_A_hca[n] + m.dev_P_hca[n] + 2*m.dev_N_hca[n] for n in hca_nurses)
          + lw["dev_day"]   * sum(m.dev_day_hca[d, s] for d in DAYS for s in SHIFTS)
          + lw["AP"]        * sum(m.dev_AP_hca[d] for d in DAYS)
          + lw["pref"]      * sum(m.pref_violate_hca[n, d] for n in hca_nurses for d in DAYS)
          + lw["weekend"]   * sum(m.weekend_dev_hca[n] for n in hca_nurses)
          + lw["rest"]      * sum(m.rest_violation_hca[n] for n in hca_nurses)
        ),
        sense=minimize,
    )

    # ---- Solve ----
    solver = SolverFactory(solver_name)
    res = solver.solve(m, tee=False)

    if res.solver.termination_condition != TerminationCondition.optimal:
        raise RuntimeError(
            f"{dept_name} infeasible or not optimal: {res.solver.termination_condition}"
        )

    # ---- Build output DataFrames ----
    days_cols = [f"Day {d}" for d in DAYS]
    roster_rn  = pd.DataFrame(index=rn_nurses,  columns=days_cols)
    roster_en  = pd.DataFrame(index=en_nurses,  columns=days_cols)
    roster_hca = pd.DataFrame(index=hca_nurses, columns=days_cols)

    def fill_roster(df, class_nurses, x_var, off_var, hard_dict):
        for n in class_nurses:
            for d in DAYS:
                key = f"Day {d}"
                raw = hard_dict.get(n, {}).get(key, "")
                kind, val = _classify(raw)
                if kind in ("OFF", "EQUIV_LEAVE", "OTHER_NONWORK"):
                    df.loc[n, key] = val
                else:
                    if off_var[n, d]() == 1:
                        df.loc[n, key] = "DO"
                    else:
                        assigned = next(
                            (s for s in SHIFTS if x_var[n, d, s]() == 1),
                            None
                        )
                        df.loc[n, key] = assigned if assigned else "DO"
        return df.reindex(sorted(df.index)).copy()

    roster_rn  = fill_roster(roster_rn,  rn_nurses,  m.x_rn,  m.off_rn,  hard_requests_rn)
    roster_en  = fill_roster(roster_en,  en_nurses,  m.x_en,  m.off_en,  hard_requests_en)
    roster_hca = fill_roster(roster_hca, hca_nurses, m.x_hca, m.off_hca, hard_requests_hca)

    # Build carryover for next horizon
    def build_carryover(roster_df):
        out = {}
        for n in roster_df.index:
            d13 = str(roster_df.loc[n, "Day 13"]).strip().upper()
            d14 = str(roster_df.loc[n, "Day 14"]).strip().upper()
            if d13 == "N" and d14 == "N":
                state = "NEED_DO"
            elif d14 == "N":
                state = "NEED_N_DO"
            else:
                state = "NONE"
            out[n] = {"state": state, "last2": [d13, d14]}
        return out

    carryover_next_week = {
        "RN":  build_carryover(roster_rn),
        "EN":  build_carryover(roster_en),
        "HCA": build_carryover(roster_hca),
    }

    print(f"{dept_name} roster built: RN={len(rn_nurses)}, EN={len(en_nurses)}, HCA={len(hca_nurses)}")
    return roster_rn, roster_en, roster_hca, carryover_next_week


# ---------------------------------------------------------------------------
# Public entry point (called by algo_scheduler.py)
# ---------------------------------------------------------------------------
def run_milp_pipeline(nurses, shifts, requests=None, ward_name="DEFAULT"):
    """
    Main entry point for MILP nurse rostering.

    Parameters
    ----------
    nurses    : list of {"id", "name", "rank"} dicts  (rank A/B/C)
    shifts    : 14-element list of per-day shift-requirement dicts
    requests  : optional {nurse_id: [(day_0based, shift_str), ...]}
    ward_name : key into WARD_CONFIG; falls back to "DEFAULT" if unknown

    Returns
    -------
    Standardised roster dict (same shape as GA output)
    """
    parsed = _parse_inputs(nurses, shifts, requests)

    try:
        roster_rn, roster_en, roster_hca, _carryover = _solve(
            rn_list=parsed["rn_list"],
            en_list=parsed["en_list"],
            hca_list=parsed["hca_list"],
            dept_name=ward_name,
            hard_requests_rn=parsed["hard_requests_rn"],
            soft_requests_rn=parsed["soft_requests_rn"],
            annual_leave_rn=parsed["annual_leave_rn"],
            prev_week_last2_rn=parsed["prev_week_last2_rn"],
            hard_requests_en=parsed["hard_requests_en"],
            soft_requests_en=parsed["soft_requests_en"],
            annual_leave_en=parsed["annual_leave_en"],
            prev_week_last2_en=parsed["prev_week_last2_en"],
            hard_requests_hca=parsed["hard_requests_hca"],
            soft_requests_hca=parsed["soft_requests_hca"],
            annual_leave_hca=parsed["annual_leave_hca"],
            prev_week_last2_hca=parsed["prev_week_last2_hca"],
        )
    except RuntimeError as e:
        raise MILPError(f"MILP solver failed: {e}") from e

    return _format_output(
        nurses, roster_rn, roster_en, roster_hca, parsed["num_days"]
    )