import type { DailyStaffingGuideline, RosterRow, StaffRole } from "./types"

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
}

export type RosterRank = "A" | "B" | "C"
export type RoleGroupKey = "SSN/SN" | "EN/NA/HCA1/HCA2" | "HCA3" | "Other"

const DESIGNATION_ALIASES: Record<string, string> = {
  RN: "SN",
  REGISTEREDNURSE: "SN",
  STAFFNURSE: "SN",
  STAFFNURSEI: "SN",
  STAFFNURSEII: "SN",
  SNRSTAFFNURSEI: "SSN",
  SNRSTAFFNURSEII: "SSN",
  SENIORSTAFFNURSE: "SSN",
  SENIORSTAFFNURSEI: "SSN",
  SENIORSTAFFNURSEII: "SSN",
  ENROLLEDNURSE: "EN",
  ENROLLEDNURSEI: "EN",
  ENROLLEDNURSEII: "EN",
  SENIORENROLLEDNURSE: "SEN",
  SENIORENROLLEDNURSEI: "SEN",
  SENIORENROLLEDNURSEII: "SEN",
  SNRENROLLEDNURSE: "SEN",
  SNRENROLLEDNURSEI: "SEN",
  SNRENROLLEDNURSEII: "SEN",
  NURSINGAIDE: "NA",
  NURSINGAIDEI: "NA",
  NURSINGAIDEII: "NA",
  SENIORNURSINGAIDEI: "NA",
  SENIORNURSINGAIDEII: "NA",
  // PSA roles are intentionally excluded from the roster UI.
  HCA: "HCA1",
  HCA1: "HCA1",
  HCA2: "HCA2",
  HCA3: "HCA3",
  HEALTHCAREASSISTANT: "HCA1",
  HEALTHCAREASSISTANTI: "HCA1",
  HEALTHCAREASSISTANTII: "HCA2",
  HEALTHCAREASSISTANTIII: "HCA3",
  HEALTHCAREASST: "HCA1",
  HEALTHCAREASSTI: "HCA1",
  HEALTHCAREASSTII: "HCA2",
  HEALTHCAREASSTIII: "HCA3",
  SENIORHEALTHCAREASSISTANTI: "HCA1",
  SENIORHEALTHCAREASSISTANTII: "HCA2",
}

const CANONICAL_DESIGNATIONS: Record<string, StaffRole> = {
  SN: "RN",
  SSN: "RN",
  HCA1: "HCA12",
  HCA2: "HCA12",
  SEN: "EN",
  EN: "EN",
  NA: "NA",
  HCA3: "HCA3",
}

const STAFF_ROLE_TO_RANK: Record<StaffRole, RosterRank> = {
  RN: "A",
  EN: "B",
  NA: "B",
  HCA12: "B",
  HCA3: "C",
}

function normalizeDesignation(designation: string): string {
  return designation
    .replace(/[^A-Za-z0-9]+/g, "")
    .trim()
    .toUpperCase()
}

export function isPsaDesignation(designation: string): boolean {
  const normalized = normalizeDesignation(designation)
  return (
    normalized === "PSA" ||
    normalized.includes("PATIENTSERVICEASST") ||
    normalized.includes("PATIENTSERVICEASSISTANT")
  )
}

/**
 * Maps nurse designation strings to summary role categories.
 * Mirrors the backend designation mapping used for roster grouping.
 */
export function mapDesignationToRole(
  designation: string,
): "RN" | "EN" | "NA" | "HCA12" | "HCA3" | null {
  const normalized = normalizeDesignation(designation)
  if (!normalized) return null
  if (isPsaDesignation(designation)) return null

  const canonical = DESIGNATION_ALIASES[normalized] ?? normalized
  return CANONICAL_DESIGNATIONS[canonical] ?? null
}

export function mapStaffRoleToRosterRank(
  role: StaffRole | null | undefined,
): RosterRank | null {
  if (!role) return null
  return STAFF_ROLE_TO_RANK[role] ?? null
}

export function mapDesignationToRosterRank(
  designation: string,
): RosterRank | null {
  return mapStaffRoleToRosterRank(mapDesignationToRole(designation))
}

export function mapRosterRankToGroup(rank: RosterRank | null): RoleGroupKey {
  if (rank === "A") return "SSN/SN"
  if (rank === "B") return "EN/NA/HCA1/HCA2"
  if (rank === "C") return "HCA3"
  return "Other"
}

export function getRosterGroupKey(
  row: Pick<RosterRow, "designation" | "staffingRole">,
): RoleGroupKey {
  const rank =
    mapStaffRoleToRosterRank(row.staffingRole ?? null) ??
    mapDesignationToRosterRank(row.designation ?? "")
  return mapRosterRankToGroup(rank)
}

/**
 * Maps shift codes to summary shift types (A, P, N).
 * Returns null for non-working shifts.
 */
export function mapShiftCodeToSummaryType(
  shiftCode: string,
): "A" | "P" | "N" | null {
  const normalizedShiftCode = shiftCode.trim().toUpperCase()

  if (
    normalizedShiftCode === "D" ||
    normalizedShiftCode === "A" ||
    normalizedShiftCode.startsWith("A-")
  ) {
    return "A"
  }
  if (normalizedShiftCode === "P") return "P"
  if (normalizedShiftCode === "N" || normalizedShiftCode.startsWith("N-"))
    return "N"
  return null
}
