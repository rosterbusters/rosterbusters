// Unified notification types - works for both API and hardcoded data

export interface NotificationItem {
  notificationid: number
  notificationtype: string
  subject?: string  // Optional for backward compatibility
  description?: string  // Optional for backward compatibility
  messagebody?: string  // From API
  priority?: string  // From API
  status?: string  // From API
  createdat?: string  // From API
  date?: string  // For hardcoded data
  sentat?: string | null
  readat?: string | null
  relatedentitytype?: string | null
  relatedentityid?: number | null
}

export interface NotificationsListResponse {
  notifications: NotificationItem[]
  total: number
  unread_count: number
}

export interface NotificationStatsResponse {
  total: number
  unread: number
  by_type: Record<string, number>
  recent: NotificationItem[]
}

export type NotificationType = "Roster" | "ShiftRequest" | "LeaveRequest" | "ShiftUpdate" | "SwapRequest" | "LeaveApproval" | "LeaveReminder" | "RosterRelease" | "HRISReminder" | "System" | "Probation" | "AlgorithmGeneration" | "AlgorithmInProgress" | "ShiftRequestPeriodOpen" | "ShiftRequestPeriodClosed" | "ShiftRequestReviewOpen" | "ShiftRequestReviewClosed" | "ShiftRequestApproved" | "ShiftRequestRejected" | "RosterPlanning" | "RosterFinalisation"

export const notificationTypeLabels: Record<string, string> = {
  // Legacy keys (backward-compat with hardcoded data)
  Roster: "Roster",
  ShiftRequest: "Shift Request",
  LeaveUpdate: "Leave Status",
  ShiftUpdate: "Shift Update",
  SwapRequest: "Shift Swap",
  LeaveApproval: "Leave Status",
  LeaveReminder: "Leave Reminder",
  System: "System",
  Probation: "Probation",
  // Shift Request group
  ShiftRequestPeriodOpen: "Shift Request",
  ShiftRequestPeriodClosed: "Shift Request",
  ShiftRequestReviewOpen: "Shift Request",
  ShiftRequestReviewClosed: "Shift Request",
  ShiftRequestApproved: "Shift Request",
  ShiftRequestRejected: "Shift Request",
  ShiftUpdated: "Shift Request",
  // Leave group
  LeaveRequest: "Leave",
  LeaveApproved: "Leave",
  LeaveRejected: "Leave",
  // Roster group
  RosterPlanning: "Roster",
  RosterFinalisation: "Roster",
  RosterRelease: "Roster",
  // Algorithm group
  AlgorithmGeneration: "Algorithm",
  AlgorithmInProgress: "Algorithm",
  // Admin
  HRISReminder: "HRIS Reminder",
}

export interface NotificationBadgeStyle {
  background: string
  text: string
  border?: string
}

export const notificationTypeBadgeStyles: Record<string, NotificationBadgeStyle> = {
  ShiftRequest: { background: "#14B8A6", text: "#FFFFFF" },
  ShiftRequestPeriodOpen: { background: "#14B8A6", text: "#FFFFFF" },
  ShiftRequestReviewOpen: { background: "#0D9488", text: "#FFFFFF" },
  ShiftRequestPeriodClosed: { background: "#0F766E", text: "#FFFFFF" },
  ShiftRequestReviewClosed: { background: "#115E59", text: "#FFFFFF" },
  ShiftRequestApproved: { background: "#0D9488", text: "#FFFFFF" },
  ShiftRequestRejected: { background: "#134E4A", text: "#FFFFFF" },
  LeaveRequest: { background: "#0F766E", text: "#FFFFFF" },
  LeaveApproval: { background: "#115E59", text: "#FFFFFF" },
  LeaveReminder: { background: "#134E4A", text: "#FFFFFF" },
  Roster: { background: "#0891B2", text: "#FFFFFF" },
  RosterPlanning: { background: "#0891B2", text: "#FFFFFF" },
  RosterFinalisation: { background: "#0E7490", text: "#FFFFFF" },
  ShiftUpdate: { background: "#0E7490", text: "#FFFFFF" },
  RosterRelease: { background: "#0F5F78", text: "#FFFFFF" },
  HRISReminder: { background: "#164E63", text: "#FFFFFF" },
  AlgorithmGeneration: { background: "#0D9488", text: "#FFFFFF" },
  AlgorithmInProgress: { background: "#0F766E", text: "#FFFFFF" },
  SwapRequest: { background: "#7C3AED", text: "#FFFFFF" },
  System: { background: "#6B7280", text: "#FFFFFF" },
  Probation: { background: "#B45309", text: "#FFFFFF" },
}

export const notificationTypeBadgeVariant: Record<string, string> = {
  // Legacy keys (backward-compat with hardcoded data)
  Roster: "purple",
  ShiftRequest: "blue",
  LeaveUpdate: "green",
  ShiftUpdate: "blue",
  SwapRequest: "blue",
  LeaveApproval: "green",
  LeaveReminder: "green",
  System: "gray",
  Probation: "red",
  // Shift Request group → blue
  ShiftRequestPeriodOpen: "blue",
  ShiftRequestPeriodClosed: "blue",
  ShiftRequestReviewOpen: "blue",
  ShiftRequestReviewClosed: "blue",
  ShiftRequestApproved: "blue",
  ShiftRequestRejected: "blue",
  ShiftUpdated: "blue",
  // Leave group → green
  LeaveRequest: "green",
  LeaveApproved: "green",
  LeaveRejected: "green",
  // Roster group → purple
  RosterPlanning: "purple",
  RosterFinalisation: "purple",
  RosterRelease: "purple",
  // Algorithm group → teal
  AlgorithmGeneration: "teal",
  AlgorithmInProgress: "teal",
  // Admin → orange
  HRISReminder: "orange",
}

export const priorityBadgeVariant: Record<string, string> = {
  Urgent: "red",
  Normal: "blue",
  Low: "gray"
}

// Helper to format notification date
export function formatNotificationDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
  
  if (diffInHours < 1) {
    const diffInMinutes = Math.floor(diffInHours * 60)
    return diffInMinutes <= 1 ? "Just now" : `${diffInMinutes}m ago`
  } else if (diffInHours < 24) {
    return `${Math.floor(diffInHours)}h ago`
  } else if (diffInHours < 48) {
    return "Yesterday"
  } else {
    return date.toLocaleDateString('en-SG', { 
      day: 'numeric', 
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }
}

// Helper to get route from notification type
export const getNotificationRoute = (type: string): string => {
  const routeMap: Record<string, string> = {
    Roster: "/staffrosterschedule",
    ShiftRequest: "/request-application",
    ShiftRequestPeriodOpen: "/request-application",
    ShiftRequestPeriodClosed: "/request-application",
    ShiftRequestReviewOpen: "/request-application",
    ShiftRequestReviewClosed: "/request-application",
    ShiftRequestApproved: "/request-application",
    ShiftRequestRejected: "/request-application",
    LeaveRequest: "/request-application",
    ShiftUpdate: "/staffrosterschedule",
    SwapRequest: "/request-overview",
    LeaveApproval: "/request-application",
    LeaveReminder: "/request-application",
    RosterRelease: "/staffrosterschedule",
    RosterPlanning: "/roster-planning",
    RosterFinalisation: "/roster-planning",
    AlgorithmGeneration: "/roster-planning",
    AlgorithmInProgress: "/roster-planning",
    System: "/system",
    Probation: "/probation",
  }
  return routeMap[type] || "/home"
}

// Hardcoded data for dropdown (until migrated to API)
export const nurseManagerNotifications: NotificationItem[] = [
  { notificationid: 1, notificationtype: "ShiftRequestPeriodOpen", description: "Shift Request Period (10 Nov - 21 Nov) is Now Open.", date: "1/11/2001" },
  { notificationid: 2, notificationtype: "Roster", description: "Start Planning Roster for 10 Nov - 21 Nov", date: "1/11/2001" },
  { notificationid: 3, notificationtype: "RosterRelease", description: "Reminder: Publish Roster due 7 Nov 2001", date: "1/11/2001" },
  { notificationid: 4, notificationtype: "HRISReminder", description: "Reminder: Export Roster to HRIS system by 21 Nov 2001 hello byebye", date: "1/11/2001" },
  { notificationid: 5, notificationtype: "LeaveRequest", description: "Tony Quek applied for AL for 31 Dec 2001", date: "1/11/2001" },
  { notificationid: 6, notificationtype: "ShiftRequest", description: "Shift Requests Review for 10 Nov - 21 Nov is closed", date: "1/11/2001" },
]

export const wardStaffNotifications: NotificationItem[] = [
  { notificationid: 1, notificationtype: "Roster", description: "31 Dec Shift Request was approved.", date: "1/11/2001" },
  { notificationid: 2, notificationtype: "Roster", description: "18–20 Dec Roster released.", date: "1/11/2001" },
  { notificationid: 3, notificationtype: "ShiftRequest", description: "Shift Request Period is Now Open", date: "1/11/2001" },
]
