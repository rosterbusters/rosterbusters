import type { DailyStaffingGuideline } from "./types";

/**
 * Mock staffing guidelines for roster planning.
 * 
 * When the real guidelines file is ready, you can:
 * 1. Add it to: frontend/src/data/staffingGuidelines.json
 * 2. Or update this file to fetch from an API endpoint
 * 
 * These values represent minimum staffing requirements per shift type per role.
 */
export const MOCK_STAFFING_GUIDELINES: DailyStaffingGuideline = {
  RN: {
    A: { minimum: 4 },  // AM shift - minimum 4 Registered Nurses
    P: { minimum: 3 },  // PM shift - minimum 3 Registered Nurses
    N: { minimum: 3 },  // Night shift - minimum 3 Registered Nurses
  },
  EN: {
    A: { minimum: 2 },  // AM shift - minimum 2 Enrolled Nurses
    P: { minimum: 2 },  // PM shift - minimum 2 Enrolled Nurses
    N: { minimum: 2 },  // Night shift - minimum 2 Enrolled Nurses
  },
  HCA: {
    A: { minimum: 2 },  // AM shift - minimum 2 Healthcare Assistants
    P: { minimum: 2 },  // PM shift - minimum 2 Healthcare Assistants
    N: { minimum: 2 },  // Night shift - minimum 2 Healthcare Assistants
  },
};

/**
 * Maps nurse designation strings to summary role categories.
 * Add more designation mappings as needed.
 */
export function mapDesignationToRole(designation: string): 'RN' | 'EN' | 'HCA' | null {
  const d = designation.toLowerCase().trim();

  // Short codes (used by algorithm-generated data and nurse designation field)
  if (d === 'rn') return 'RN';
  if (d === 'en') return 'EN';
  if (d === 'na') return 'EN';  // Nursing Aide counted in EN/NA bucket
  if (d === 'hca') return 'HCA';
  if (d === 'ssn') return 'RN'; // Senior Staff Nurse → RN equivalent

  // Full designation strings
  if (d.includes('registered nurse') || d.includes('staff nurse')) return 'RN';
  if (d.includes('enrolled nurse')) return 'EN';
  if (d.includes('nursing aide')) return 'EN';
  if (d.includes('healthcare assistant') || d.includes('hca')) return 'HCA';

  return null;
}

/**
 * Maps shift codes to summary shift types (A, P, N).
 * Returns null for non-working shifts.
 */
export function mapShiftCodeToSummaryType(shiftCode: string): 'A' | 'P' | 'N' | null {
  switch (shiftCode) {
    case 'A':
    case 'D': // Day shift counts as AM for summary purposes
      return 'A';
    case 'P':
      return 'P';
    case 'N':
    case 'N-12':
      return 'N';
    default:
      // Non-working shifts (DO, AL, MC, URG) return null
      return null;
  }
}


