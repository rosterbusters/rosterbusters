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

export type NotificationType = "Roster" | "ShiftRequest" | "LeaveRequest" | "ShiftUpdate" | "SwapRequest" | "LeaveApproval" | "LeaveReminder" | "RosterRelease" | "HRISReminder" | "System" | "Probation"

export const notificationTypeLabels: Record<string, string> = {
  Roster: "Roster",
  ShiftRequest: "Shift Request",
  LeaveRequest: "Leave Request",
  ShiftUpdate: "Roster",
  SwapRequest: "Shift Swap",
  LeaveApproval: "Leave Status",
  LeaveReminder: "Leave Reminder",
  RosterRelease: "Roster Release",
  HRISReminder: "HRIS Reminder",
  System: "System",
  Probation: "Probation"
}

export const notificationTypeBadgeVariant: Record<string, string> = {
  Roster: "blue",
  ShiftRequest: "yellow",
  LeaveRequest: "green",
  ShiftUpdate: "blue",
  SwapRequest: "purple",
  LeaveApproval: "green",
  LeaveReminder: "orange",
  RosterRelease: "cyan",
  HRISReminder: "orange",
  System: "gray",
  Probation: "red"
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
    LeaveRequest: "/request-application",
    ShiftUpdate: "/staffrosterschedule",
    SwapRequest: "/request-overview",
    LeaveApproval: "/request-application",
    LeaveReminder: "/request-application",
    RosterRelease: "/staffrosterschedule",
    System: "/system",
    Probation: "/probation",
  }
  return routeMap[type] || "/home"
}

// Hardcoded data for dropdown (until migrated to API)
export const nurseManagerNotifications: NotificationItem[] = [
  { notificationid: 1, notificationtype: "Roster", description: "Start Planning Roster for 10 Nov - 21 Nov", date: "1/11/2001" },
  { notificationid: 2, notificationtype: "RosterRelease", description: "Reminder: Publish Roster due 7 Nov 2001", date: "1/11/2001" },
  { notificationid: 3, notificationtype: "HRISReminder", description: "Reminder: Export Roster to HRIS system by 21 Nov 2001", date: "1/11/2001" },
  { notificationid: 4, notificationtype: "LeaveRequest", description: "Tony Quek applied for AL for 31 Dec 2001", date: "1/11/2001" },
  { notificationid: 5, notificationtype: "ShiftRequest", description: "Shift Requests Review for 10 Nov - 21 Nov is open", date: "1/11/2001" },
  { notificationid: 6, notificationtype: "ShiftRequest", description: "Shift Requests Review for 10 Nov - 21 Nov is closed", date: "1/11/2001" },
]

export const wardStaffNotifications: NotificationItem[] = [
  { notificationid: 1, notificationtype: "Roster", description: "31 Dec Shift Request was approved.", date: "1/11/2001" },
  { notificationid: 2, notificationtype: "Roster", description: "18–20 Dec Roster released.", date: "1/11/2001" },
  { notificationid: 3, notificationtype: "ShiftRequest", description: "Shift Request Period is Now Open", date: "1/11/2001" },
]
