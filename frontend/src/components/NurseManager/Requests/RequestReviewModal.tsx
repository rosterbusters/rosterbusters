// Shared types used across the requests overview table and review dialogs.

export type RequestStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";
export type RequestType = "ShiftRequest" | "LeaveRequest";

export interface UnifiedRequest {
  id: number;
  type: RequestType;
  requestTypeName: string;
  shiftCode?: string | null;
  requestedDates: string;
  status: RequestStatus;
  applicationDate: string;
  comments: string | null;
  nurseName?: string | null;
}
