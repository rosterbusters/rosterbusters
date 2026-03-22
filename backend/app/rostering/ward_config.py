# ward_config.py
# Hand-tuned ward configurations matching the original MILP notebook.
# Each ward entry defines:
#   LOW_DAYS      – day numbers (1-based, 1–14) that use low/weekend coverage rules
#   RN/EN/HCA     – per-class coverage and smoothing targets
#   TOTAL_MIN     – ward-wide combined floor per shift type

WARD_CONFIG = {
    # ------------------------------------------------------------------
    # WARD 04
    # ------------------------------------------------------------------
    "WARD 04": {
        "LOW_DAYS": {6, 7, 13, 14},

        "RN": {
            "normal_min":   {"A": 3, "P": 2, "N": 1},
            "low_exact":    {"A": 2, "P": 2, "N": 1},
            "day_target":   {"A": 4, "P": 3, "N": 2},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "EN": {
            "normal_min":   {"A": 4, "P": 2, "N": 1},
            "low_exact":    None,
            "day_target":   {"A": 4, "P": 3, "N": 2},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "HCA": {
            "normal_min":   {"A": 1, "P": 0, "N": 0},
            "low_exact":    None,
            "day_target":   {"A": 1, "P": 1, "N": 1},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "TOTAL_MIN": {"A": 7, "P": 7, "N": 4},
    },

    # ------------------------------------------------------------------
    # WARD 05
    # ------------------------------------------------------------------
    "WARD 05": {
        "LOW_DAYS": {6, 7, 13, 14},

        "RN": {
            "normal_min":   {"A": 2, "P": 2, "N": 2},
            "low_exact":    {"A": 2, "P": 2, "N": 2},
            "day_target":   {"A": 4, "P": 3, "N": 2},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "EN": {
            "normal_min":   {"A": 4, "P": 2, "N": 1},
            "low_exact":    None,
            "day_target":   {"A": 4, "P": 3, "N": 2},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "HCA": {
            "normal_min":   {"A": 1, "P": 0, "N": 0},
            "low_exact":    None,
            "day_target":   {"A": 1, "P": 1, "N": 1},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "TOTAL_MIN": {"A": 7, "P": 7, "N": 4},
    },

    # ------------------------------------------------------------------
    # WARD 08
    # ------------------------------------------------------------------
    "WARD 08": {
        "LOW_DAYS": set(),  # WARD 08 has no low-coverage days (notebook v10)

        "RN": {
            "normal_min":   {"A": 3, "P": 3, "N": 2},
            "low_exact":    {"A": 3, "P": 3, "N": 2},
            "day_target":   {"A": 4, "P": 3, "N": 2},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "EN": {
            "normal_min":   {"A": 3, "P": 2, "N": 1},
            "low_exact":    None,
            "day_target":   {"A": 4, "P": 3, "N": 2},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "HCA": {
            "normal_min":   {"A": 1, "P": 0, "N": 0},
            "low_exact":    None,
            "day_target":   {"A": 1, "P": 1, "N": 1},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "TOTAL_MIN": {"A": 8, "P": 7, "N": 5},
    },

    # ------------------------------------------------------------------
    # WARD 11
    # ------------------------------------------------------------------
    "WARD 11": {
        "LOW_DAYS": set(),

        "RN": {
            "normal_min":   {"A": 3, "P": 3, "N": 2},
            "low_exact":    {"A": 3, "P": 3, "N": 2},
            "day_target":   {"A": 4, "P": 3, "N": 2},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "EN": {
            "normal_min":   {"A": 3, "P": 2, "N": 1},
            "low_exact":    None,
            "day_target":   {"A": 4, "P": 3, "N": 2},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "HCA": {
            "normal_min":   {"A": 1, "P": 0, "N": 0},
            "low_exact":    None,
            "day_target":   {"A": 1, "P": 1, "N": 1},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "TOTAL_MIN": {"A": 8, "P": 7, "N": 4},
    },

    # ------------------------------------------------------------------
    # DEFAULT – used when no ward name is provided or ward is unknown.
    # Conservative values; tune per deployment.
    # ------------------------------------------------------------------
    "DEFAULT": {
        "LOW_DAYS": set(),

        "RN": {
            "normal_min":   {"A": 2, "P": 2, "N": 1},
            "low_exact":    None,
            "day_target":   {"A": 4, "P": 3, "N": 2},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "EN": {
            "normal_min":   {"A": 3, "P": 2, "N": 1},
            "low_exact":    None,
            "day_target":   {"A": 4, "P": 3, "N": 2},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "HCA": {
            "normal_min":   {"A": 1, "P": 0, "N": 0},
            "low_exact":    None,
            "day_target":   {"A": 1, "P": 1, "N": 1},
            "shift_target": {"A": 5, "P": 3, "N": 2},
        },
        "TOTAL_MIN": {"A": 6, "P": 6, "N": 3},
    },
}

# Wards that share the same config as WARD 05
for _w in ("WARD 06", "WARD 07"):
    WARD_CONFIG[_w] = WARD_CONFIG["WARD 05"]

# Wards that share the same config as WARD 08
WARD_CONFIG["WARD 09"] = WARD_CONFIG["WARD 08"]
