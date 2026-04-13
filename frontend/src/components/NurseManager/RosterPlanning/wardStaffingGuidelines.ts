import type { DailyStaffingGuideline } from "../RosterTable/types";

type WardStaffingSource = {
  wardName?: string | null;
  wardname?: string | null;
  staffingJson?: string | null;
  staffing_json?: string | null;
  am_rn?: number | null;
  am_en_na_min?: number | null;
  am_en_na_max?: number | null;
  am_hca_min?: number | null;
  am_hca_max?: number | null;
  pm_rn?: number | null;
  pm_en_na_min?: number | null;
  pm_en_na_max?: number | null;
  pm_hca_min?: number | null;
  pm_hca_max?: number | null;
  nd_rn?: number | null;
  nd_en_na_min?: number | null;
  nd_en_na_max?: number | null;
  nd_hca_min?: number | null;
  nd_hca_max?: number | null;
};

/**
 * Per-ward staffing guidelines derived from WARDS_DATA in seed_data.py.
 * Keys match the wardName field returned by the API.
 *
 * RN   → minimum = exact required count (min = max)
 * EN   → Enrolled Nurses (en_min / en_max)
 * NA   → Nursing Aides (na_min / na_max)
 * HCA12 → Healthcare Assistants grade 1 & 2 (hca12_min / hca12_max)
 * HCA3  → Healthcare Assistants grade 3   (hca3_min  / hca3_max)
 *
 * Shift type mapping: A = AM shift, P = PM shift, N = Night (ND) shift
 */
const WARD_GUIDELINES: Record<string, DailyStaffingGuideline> = {
  // ── SACH Simei ───────────────────────────────────────────────────────────

  "Ward 4": { // Dementia
    RN:   { A: { minimum: 2, maximum: 2 }, P: { minimum: 2, maximum: 2 }, N: { minimum: 1, maximum: 1 } },
    EN:   { A: { minimum: 4, maximum: 5 }, P: { minimum: 2, maximum: 5 }, N: { minimum: 1, maximum: 3 } },
    NA:   { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
    HCA12: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
    HCA3: { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
  },

  "Ward 5": { // Rehab
    RN:   { A: { minimum: 2, maximum: 2 }, P: { minimum: 2, maximum: 2 }, N: { minimum: 2, maximum: 2 } },
    EN:   { A: { minimum: 4, maximum: 5 }, P: { minimum: 2, maximum: 5 }, N: { minimum: 1, maximum: 2 } },
    NA:   { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
    HCA12: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
    HCA3: { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
  },

  "Ward 6": { // Rehab
    RN:   { A: { minimum: 2, maximum: 2 }, P: { minimum: 2, maximum: 2 }, N: { minimum: 2, maximum: 2 } },
    EN:   { A: { minimum: 4, maximum: 5 }, P: { minimum: 2, maximum: 5 }, N: { minimum: 1, maximum: 2 } },
    NA:   { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
    HCA12: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
    HCA3: { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
  },

  "Ward 7": { // Rehab
    RN:   { A: { minimum: 2, maximum: 2 }, P: { minimum: 2, maximum: 2 }, N: { minimum: 2, maximum: 2 } },
    EN:   { A: { minimum: 4, maximum: 5 }, P: { minimum: 2, maximum: 5 }, N: { minimum: 1, maximum: 2 } },
    NA:   { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
    HCA12: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
    HCA3: { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
  },

  "Ward 8": { // Subacute
    RN:   { A: { minimum: 3, maximum: 3 }, P: { minimum: 3, maximum: 3 }, N: { minimum: 2, maximum: 2 } },
    EN:   { A: { minimum: 3, maximum: 5 }, P: { minimum: 2, maximum: 4 }, N: { minimum: 1, maximum: 3 } },
    NA:   { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
    HCA12: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
    HCA3: { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
  },

  "Ward 9": { // Subacute
    RN:   { A: { minimum: 3, maximum: 3 }, P: { minimum: 3, maximum: 3 }, N: { minimum: 2, maximum: 2 } },
    EN:   { A: { minimum: 3, maximum: 5 }, P: { minimum: 2, maximum: 4 }, N: { minimum: 1, maximum: 3 } },
    NA:   { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
    HCA12: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
    HCA3: { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
  },

  "Ward 10": { // Paying Class
    RN:   { A: { minimum: 2, maximum: 2 }, P: { minimum: 2, maximum: 2 }, N: { minimum: 2, maximum: 2 } },
    EN:   { A: { minimum: 4, maximum: 4 }, P: { minimum: 2, maximum: 4 }, N: { minimum: 2, maximum: 2 } },
    NA:   { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
    HCA12: { A: { minimum: 1, maximum: 1 }, P: { minimum: 0, maximum: 1 }, N: { minimum: 0, maximum: 0 } },
    HCA3: { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
  },

  "Ward 11": { // Palliative
    RN:   { A: { minimum: 3, maximum: 3 }, P: { minimum: 3, maximum: 3 }, N: { minimum: 2, maximum: 2 } },
    EN:   { A: { minimum: 3, maximum: 5 }, P: { minimum: 2, maximum: 4 }, N: { minimum: 1, maximum: 2 } },
    NA:   { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
    HCA12: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
    HCA3: { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
  },

  // ── SACH Bedok ───────────────────────────────────────────────────────────

  "CH": { // Community Hospital
    RN:   { A: { minimum: 2, maximum: 2 }, P: { minimum: 2, maximum: 2 }, N: { minimum: 2, maximum: 2 } },
    EN:   { A: { minimum: 1, maximum: 3 }, P: { minimum: 1, maximum: 3 }, N: { minimum: 1, maximum: 2 } },
    NA:   { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
    HCA12: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 2 }, N: { minimum: 0, maximum: 1 } },
    HCA3: { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
  },

  "TCF": { // Transitional Care — 12hr shifts, no PM
    RN:   { A: { minimum: 2, maximum: 2 }, P: { minimum: 0, maximum: 0 }, N: { minimum: 2, maximum: 2 } },
    EN:   { A: { minimum: 2, maximum: 5 }, P: { minimum: 0, maximum: 0 }, N: { minimum: 1, maximum: 5 } },
    NA:   { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
    HCA12: { A: { minimum: 0, maximum: 2 }, P: { minimum: 0, maximum: 0 }, N: { minimum: 0, maximum: 2 } },
    HCA3: { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
  },
};

const DEFAULT_GUIDELINE: DailyStaffingGuideline = {
  RN:   { A: { minimum: 2 }, P: { minimum: 2 }, N: { minimum: 2 } },
  EN:   { A: { minimum: 2 }, P: { minimum: 2 }, N: { minimum: 2 } },
  NA:   { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
  HCA12: { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
  HCA3: { A: { minimum: 0 }, P: { minimum: 0 }, N: { minimum: 0 } },
};

function parseStoredGuidelines(
  staffingJson: string | null | undefined,
): DailyStaffingGuideline | null {
  if (!staffingJson) return null;
  try {
    const parsed = JSON.parse(staffingJson) as DailyStaffingGuideline;
    if (parsed?.RN?.A?.minimum === undefined) return null;
    return parsed;
  } catch {
    return null;
  }
}

function requirement(
  minimum: number | null | undefined,
  maximum: number | null | undefined,
) {
  return {
    minimum: minimum ?? 0,
    maximum: maximum ?? undefined,
  };
}

function exactRequirement(value: number | null | undefined) {
  return requirement(value, value);
}

function getWardName(input: string | WardStaffingSource | null | undefined) {
  if (typeof input === "string") return input;
  return input?.wardName ?? input?.wardname ?? undefined;
}

function getStoredStaffingJson(input: string | WardStaffingSource | null | undefined) {
  if (typeof input === "string") return undefined;
  return input?.staffingJson ?? input?.staffing_json ?? undefined;
}

function getBackendColumnGuidelines(
  ward: WardStaffingSource,
): DailyStaffingGuideline | null {
  if (
    ward.am_rn == null &&
    ward.am_en_na_min == null &&
    ward.am_hca_min == null &&
    ward.pm_rn == null &&
    ward.pm_en_na_min == null &&
    ward.pm_hca_min == null &&
    ward.nd_rn == null &&
    ward.nd_en_na_min == null &&
    ward.nd_hca_min == null
  ) {
    return null;
  }

  return {
    RN: {
      A: exactRequirement(ward.am_rn),
      P: exactRequirement(ward.pm_rn),
      N: exactRequirement(ward.nd_rn),
    },
    EN: {
      A: requirement(ward.am_en_na_min, ward.am_en_na_max),
      P: requirement(ward.pm_en_na_min, ward.pm_en_na_max),
      N: requirement(ward.nd_en_na_min, ward.nd_en_na_max),
    },
    NA: {
      A: { minimum: 0 },
      P: { minimum: 0 },
      N: { minimum: 0 },
    },
    HCA12: {
      A: requirement(ward.am_hca_min, ward.am_hca_max),
      P: requirement(ward.pm_hca_min, ward.pm_hca_max),
      N: requirement(ward.nd_hca_min, ward.nd_hca_max),
    },
    HCA3: {
      A: { minimum: 0 },
      P: { minimum: 0 },
      N: { minimum: 0 },
    },
  };
}

/** Returns staffing guidelines from saved JSON, backend ward columns, or ward-name defaults. */
export function getWardGuidelines(
  input: string | WardStaffingSource | null | undefined,
): DailyStaffingGuideline {
  const storedGuidelines = parseStoredGuidelines(getStoredStaffingJson(input));
  if (storedGuidelines) return storedGuidelines;

  if (input && typeof input !== "string") {
    const backendColumnGuidelines = getBackendColumnGuidelines(input);
    if (backendColumnGuidelines) return backendColumnGuidelines;
  }

  const wardName = getWardName(input);
  if (!wardName) return DEFAULT_GUIDELINE;
  return WARD_GUIDELINES[wardName] ?? DEFAULT_GUIDELINE;
}
