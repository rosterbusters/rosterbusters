import type { DailyStaffingGuideline } from "../RosterTable/types";

/**
 * Per-ward staffing guidelines derived from WARDS_DATA in seed_data.py.
 * Keys match the wardName field returned by the API.
 *
 * RN  → minimum = exact required count (min = max)
 * EN  → covers EN + NA designations (en_na_min / en_na_max)
 * HCA → covers HCA designations (hca_min / hca_max)
 *
 * Shift type mapping: A = AM shift, P = PM shift, N = Night (ND) shift
 */
const WARD_GUIDELINES: Record<string, DailyStaffingGuideline> = {
  // ── SACH Simei ───────────────────────────────────────────────────────────

  "Ward 4": { // Dementia
    RN:  { A: { minimum: 2, maximum: 2 }, P: { minimum: 2, maximum: 2 }, N: { minimum: 1, maximum: 1 } },
    EN:  { A: { minimum: 4, maximum: 5 }, P: { minimum: 2, maximum: 5 }, N: { minimum: 1, maximum: 3 } },
    HCA: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
  },

  "Ward 5": { // Rehab
    RN:  { A: { minimum: 2, maximum: 2 }, P: { minimum: 2, maximum: 2 }, N: { minimum: 2, maximum: 2 } },
    EN:  { A: { minimum: 4, maximum: 5 }, P: { minimum: 2, maximum: 5 }, N: { minimum: 1, maximum: 2 } },
    HCA: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
  },

  "Ward 6": { // Rehab
    RN:  { A: { minimum: 2, maximum: 2 }, P: { minimum: 2, maximum: 2 }, N: { minimum: 2, maximum: 2 } },
    EN:  { A: { minimum: 4, maximum: 5 }, P: { minimum: 2, maximum: 5 }, N: { minimum: 1, maximum: 2 } },
    HCA: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
  },

  "Ward 7": { // Rehab
    RN:  { A: { minimum: 2, maximum: 2 }, P: { minimum: 2, maximum: 2 }, N: { minimum: 2, maximum: 2 } },
    EN:  { A: { minimum: 4, maximum: 5 }, P: { minimum: 2, maximum: 5 }, N: { minimum: 1, maximum: 2 } },
    HCA: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
  },

  "Ward 8": { // Subacute
    RN:  { A: { minimum: 3, maximum: 3 }, P: { minimum: 3, maximum: 3 }, N: { minimum: 2, maximum: 2 } },
    EN:  { A: { minimum: 3, maximum: 5 }, P: { minimum: 2, maximum: 4 }, N: { minimum: 1, maximum: 3 } },
    HCA: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
  },

  "Ward 9": { // Subacute
    RN:  { A: { minimum: 3, maximum: 3 }, P: { minimum: 3, maximum: 3 }, N: { minimum: 2, maximum: 2 } },
    EN:  { A: { minimum: 3, maximum: 5 }, P: { minimum: 2, maximum: 4 }, N: { minimum: 1, maximum: 3 } },
    HCA: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
  },

  "Ward 10": { // Paying Class
    RN:  { A: { minimum: 2, maximum: 2 }, P: { minimum: 2, maximum: 2 }, N: { minimum: 2, maximum: 2 } },
    EN:  { A: { minimum: 4, maximum: 4 }, P: { minimum: 2, maximum: 4 }, N: { minimum: 2, maximum: 2 } },
    HCA: { A: { minimum: 1, maximum: 1 }, P: { minimum: 0, maximum: 1 }, N: { minimum: 0, maximum: 0 } },
  },

  "Ward 11": { // Palliative
    RN:  { A: { minimum: 3, maximum: 3 }, P: { minimum: 3, maximum: 3 }, N: { minimum: 2, maximum: 2 } },
    EN:  { A: { minimum: 3, maximum: 5 }, P: { minimum: 2, maximum: 4 }, N: { minimum: 1, maximum: 2 } },
    HCA: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
  },

  // ── SACH Bedok ───────────────────────────────────────────────────────────

  "CH": { // Community Hospital
    RN:  { A: { minimum: 2, maximum: 2 }, P: { minimum: 2, maximum: 2 }, N: { minimum: 2, maximum: 2 } },
    EN:  { A: { minimum: 1, maximum: 3 }, P: { minimum: 1, maximum: 3 }, N: { minimum: 1, maximum: 2 } },
    HCA: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
  },

  "TCF": { // Transitional Care — 12hr shifts, no PM
    RN:  { A: { minimum: 2, maximum: 2 }, P: { minimum: 0, maximum: 0 }, N: { minimum: 2, maximum: 2 } },
    EN:  { A: { minimum: 2, maximum: 5 }, P: { minimum: 0, maximum: 0 }, N: { minimum: 1, maximum: 5 } },
    HCA: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 0 }, N: { minimum: 0, maximum: 2 } },
  },
};

const DEFAULT_GUIDELINE: DailyStaffingGuideline = {
  RN:  { A: { minimum: 2 }, P: { minimum: 2 }, N: { minimum: 2 } },
  EN:  { A: { minimum: 2 }, P: { minimum: 2 }, N: { minimum: 2 } },
  HCA: { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
};

/** Returns the staffing guideline for the given ward name, falling back to a default. */
export function getWardGuidelines(wardName: string | undefined): DailyStaffingGuideline {
  if (!wardName) return DEFAULT_GUIDELINE;
  return WARD_GUIDELINES[wardName] ?? DEFAULT_GUIDELINE;
}
