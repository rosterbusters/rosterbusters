// Shared notification types and data source
export type NotificationType = "roster" | "shiftRequest"

export interface NotificationItem {
  notificationid: number
  notificationtype: NotificationType
  description: string
  date: string
}

export const notificationTypeLabels: Record<NotificationType, string> = {
  roster: "Roster",
  shiftRequest: "Shift Request",
}

// Sample notification data - should be replaced with actual backend data
export const notifications: NotificationItem[] = [
  { notificationid: 1, notificationtype: "roster", description: "18–20 Dec Roster released.", date: "1/11/2001" },
  { notificationid: 2, notificationtype: "roster", description: "31 Dec Shift Request was approved.", date: "1/11/2001" },
  { notificationid: 3, notificationtype: "shiftRequest", description: "Shift Request Period is Now Open", date: "1/11/2001" },
  { notificationid: 4, notificationtype: "shiftRequest", description: "Shift Request Period is Now Open", date: "1/11/2001" },
  { notificationid: 5, notificationtype: "roster", description: "18–20 Dec Roster released.", date: "1/11/2001" },
]

// Map notification types to routes
export const getNotificationRoute = (type: NotificationType): string => {
  const routeMap: Record<NotificationType, string> = {
    roster: "/staffrosterschedule",
    shiftRequest: "/shift-request",
  }
  return routeMap[type]
}

