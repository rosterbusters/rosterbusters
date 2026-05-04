import moment from "moment"

import type {
  RosterRow,
  ShiftRequestOverlay,
} from "@/components/NurseManager/RosterTable"

export type RequestReviewRow = {
  nurseId: number
  date: string
  requested: string
  assigned: string | null
  requestType: "hard" | "soft"
  matched: boolean
}

export type RequestReviewResult = {
  matchedCount: number
  unmatchedCount: number
  rows: RequestReviewRow[]
}

type BuildRequestReviewInput = {
  periodStartDate: string | null
  rosterData: RosterRow[]
  hardRequests?: Record<string, Array<[number, string]>>
  softRequests?: Record<string, Array<[number, string]>>
}

const OFF_CODES = new Set(["OFF", "DO", "RD"])

const toReviewLabel = (shiftCode: string) => {
  const normalized = shiftCode.toUpperCase()
  if (normalized === "A") return "AM"
  if (normalized === "P") return "PM"
  if (normalized === "N") return "NIGHT"
  if (normalized === "AM" || normalized === "PM" || normalized === "NIGHT")
    return normalized
  if (normalized === "LEAVE") return "AL"
  if (OFF_CODES.has(normalized)) return "OFF"
  return normalized
}

export function buildRequestReview({
  periodStartDate,
  rosterData,
  hardRequests,
  softRequests,
}: BuildRequestReviewInput): RequestReviewResult | null {
  if (!periodStartDate || rosterData.length === 0) {
    return null
  }

  const rosterLookup = new Map<number, Map<string, string>>()
  for (const row of rosterData) {
    const dateMap = new Map<string, string>()
    for (const [dateKey, shift] of Object.entries(row.shifts)) {
      if (!shift) continue
      dateMap.set(dateKey, toReviewLabel(shift.shiftCode))
    }
    rosterLookup.set(row.nurseId, dateMap)
  }

  const allRequests: RequestReviewRow[] = []
  const start = moment(periodStartDate)

  const addRequests = (
    requestType: "hard" | "soft",
    data: Record<string, Array<[number, string]>> | undefined,
  ) => {
    if (!data) return
    for (const [nurseIdStr, reqs] of Object.entries(data)) {
      const nurseId = Number(nurseIdStr)
      for (const [dayIdx, requested] of reqs) {
        const dateKey = start.clone().add(dayIdx, "days").format("YYYY-MM-DD")
        const assigned = rosterLookup.get(nurseId)?.get(dateKey) ?? null
        const matched = assigned != null && assigned === requested
        allRequests.push({
          nurseId,
          date: dateKey,
          requested,
          assigned,
          requestType,
          matched,
        })
      }
    }
  }

  addRequests("hard", hardRequests)
  addRequests("soft", softRequests)

  const matched = allRequests.filter((r) => r.matched)
  const unmatched = allRequests.filter((r) => !r.matched)

  return {
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    rows: allRequests,
  }
}

export function buildShiftRequestOverlays(
  review: RequestReviewResult | null,
): Record<string, Record<string, ShiftRequestOverlay>> {
  if (!review) return {}

  const overlays: Record<string, Record<string, ShiftRequestOverlay>> = {}
  for (const row of review.rows) {
    const status: ShiftRequestOverlay["status"] = row.matched
      ? "Approved"
      : "Rejected"
    const requestLabel = row.requestType === "hard" ? "Hard" : "Soft"
    const assigned = row.assigned ?? "—"
    const reason = row.matched
      ? `${requestLabel} request met (${row.requested})`
      : `${requestLabel} request not met (assigned ${assigned})`

    if (!overlays[String(row.nurseId)]) {
      overlays[String(row.nurseId)] = {}
    }
    overlays[String(row.nurseId)][row.date] = {
      status,
      category: "Algorithm",
      reason,
    }
  }

  return overlays
}
