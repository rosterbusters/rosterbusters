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
    A: { minimum: 4 },
    P: { minimum: 3 },
    N: { minimum: 3 },
  },
  EN: {
    A: { minimum: 2 },
    P: { minimum: 2 },
    N: { minimum: 2 },
  },
  NA: {
    A: { minimum: 1 },
    P: { minimum: 1 },
    N: { minimum: 1 },
  },
  HCA12: {
    A: { minimum: 2 },
    P: { minimum: 2 },
    N: { minimum: 2 },
  },
  HCA3: {
    A: { minimum: 1 },
    P: { minimum: 1 },
    N: { minimum: 1 },
  },
};

/**
 * Maps nurse designation strings to summary role categories.
 * Add more designation mappings as needed.
 */
export function mapDesignationToRole(designation: string): 'RN' | 'EN' | 'NA' | 'HCA12' | 'HCA3' | null {
  const d = designation.toLowerCase().trim();

  // Short codes
  if (d === 'rn') return 'RN';
  if (d === 'en') return 'EN';
  if (d === 'na') return 'NA';
  if (d === 'ssn') return 'RN'; // Senior Staff Nurse → RN equivalent

  // HCA grade splits
  if (d === 'hca1' || d === 'hca 1' || d === 'hca-1' || d.includes('hca grade 1')) return 'HCA12';
  if (d === 'hca2' || d === 'hca 2' || d === 'hca-2' || d.includes('hca grade 2')) return 'HCA12';
  if (d === 'hca3' || d === 'hca 3' || d === 'hca-3' || d.includes('hca grade 3')) return 'HCA3';
  if (d === 'hca') return 'HCA12'; // generic HCA defaults to HCA1&2

  // Full designation strings
  if (d.includes('registered nurse') || d.includes('staff nurse')) return 'RN';
  if (d.includes('enrolled nurse')) return 'EN';
  if (d.includes('nursing aide')) return 'NA';
  if (d.includes('healthcare assistant')) return 'HCA12';

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





