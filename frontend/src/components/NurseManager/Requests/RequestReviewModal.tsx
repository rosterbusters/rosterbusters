// Shared types used across the requests overview table and review dialogs.

export type RequestStatus = "Pending" | "Approved" | "Rejected" | "Cancelled"
export type RequestType = "ShiftRequest" | "LeaveRequest"

export interface UnifiedRequest {
  id: number
  type: RequestType
  periodId?: number | null
  requestTypeName: string
  shiftCode?: string | null
  requestedDates: string
  rawPreferredDate?: string | null
  rawStartDate?: string | null
  rawEndDate?: string | null
  rawApplicationDate?: string | null
  status: RequestStatus
  applicationDate: string
  comments: string | null
  nurseName?: string | null
}
