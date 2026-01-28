// Notification types for the application

export type NotificationType = "roster" | "leave" | "shift" | "system" | "probation";

export interface NotificationItem {
  notificationid: number;
  notificationtype: NotificationType;
  description: string;
  createdAt: string;
  read: boolean;
}

// Labels for notification types (used in badges)
export const notificationTypeLabels: Record<NotificationType, string> = {
  roster: "Roster",
  leave: "Leave",
  shift: "Shift Request",
  system: "System",
  probation: "Probation",
};

// Route mapping for notification types
export function getNotificationRoute(type: NotificationType): string {
  switch (type) {
    case "roster":
      return "/nurse-manager/home";
    case "leave":
      return "/nurse-manager/leave-overview";
    case "shift":
      return "/nurse-manager/shift-overview";
    case "probation":
      return "/nurse-manager/ward-staff-directory";
    case "system":
    default:
      return "/nurse-manager/home";
  }
}

// Mock notifications data - replace with API calls in production
export const notifications: NotificationItem[] = [
  {
    notificationid: 1,
    notificationtype: "roster",
    description: "Start Planning 10 Nov - 21 Nov Roster",
    createdAt: "2026-01-28T10:00:00Z",
    read: false,
  },
  {
    notificationid: 2,
    notificationtype: "probation",
    description: "Mary Lamb: Probation ending in 2 days",
    createdAt: "2026-01-28T09:30:00Z",
    read: false,
  },
  {
    notificationid: 3,
    notificationtype: "roster",
    description: "18–20 Dec Roster released.",
    createdAt: "2026-01-28T08:15:00Z",
    read: true,
  },
  {
    notificationid: 4,
    notificationtype: "roster",
    description: "31 Dec Shift Request was approved.",
    createdAt: "2026-01-27T16:00:00Z",
    read: true,
  },
  {
    notificationid: 5,
    notificationtype: "shift",
    description: "Shift Request Period is Now Open",
    createdAt: "2026-01-27T14:00:00Z",
    read: true,
  },
];

