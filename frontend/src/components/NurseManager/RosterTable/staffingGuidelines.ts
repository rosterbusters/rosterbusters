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
  const normalizedDesignation = designation.toLowerCase();
  
  // Registered Nurse mappings
  if (
    normalizedDesignation.includes('registered nurse') ||
    normalizedDesignation.includes('staff nurse')
  ) {
    return 'RN';
  }
  
  // Enrolled Nurse mappings
  if (normalizedDesignation.includes('enrolled nurse')) {
    return 'EN';
  }
  
  // Healthcare Assistant / Nursing Aide mappings
  if (
    normalizedDesignation.includes('healthcare assistant') ||
    normalizedDesignation.includes('nursing aide') ||
    normalizedDesignation.includes('hca')
  ) {
    return 'HCA';
  }
  
  // Default - unknown designation
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


