import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  notificationTypeLabels,
  notificationTypeBadgeVariant,
  getNotificationRoute,
  nurseManagerNotifications,
  wardStaffNotifications,
  type NotificationItem,
  type NotificationType,
} from "@/types/notifications";
import { NotificationsService } from "@/client/NotificationsService";

// Format date as D/MM/YYYY
function formatNotificationDate(dateString: string): string {
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Map the generic color names from notificationTypeBadgeVariant → Tailwind bg classes
const colorClassMap: Record<string, string> = {
  blue: "bg-[#164E63]",   // Shift Request
  green: "bg-[#0E7490]",  // Leave
  purple: "bg-[#5993BF]", // Roster
  teal: "bg-[#8CB2C0]",   // Algorithm
  orange: "bg-[#50BEBE]", // Admin
  cyan: "bg-[#06B6D4]",   // (unused, kept as fallback)
  yellow: "bg-[#EAB308]", // (unused, kept as fallback)
  gray: "bg-[#9E9E9E]",   // Slate Grey — System/Probation
  red: "bg-[#EF4444]",    // red-500 — Probation/Urgent
};

// Badge component — colour driven by notificationTypeBadgeVariant from types/notifications
function NotificationBadge({ type }: { type: NotificationType }) {
  const colorVariant = notificationTypeBadgeVariant[type] ?? "gray";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-medium text-white whitespace-nowrap w-fit",
        colorClassMap[colorVariant] ?? "bg-[#6B7280]",
      )}
    >
      {notificationTypeLabels[type] ?? type}
    </span>
  );
}

const ROW_HEIGHT = 44; // px per row
const MAX_VISIBLE_HEIGHT = ROW_HEIGHT * 4; // show ~4 rows, then scroll

function NotificationDropdown({ role }: { role?: "nurse" | "manager" }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["dropdownNotifications", role],
    queryFn: () =>
      role === "manager"
        ? NotificationsService.getManagerNotifications({ limit: 20, offset: 0 })
        : NotificationsService.getNurseNotifications({ limit: 20, offset: 0 }),
    refetchInterval: 60000,
  });

  // Map API response: use subject as the display description
  const isBypassAuth = import.meta.env.VITE_BYPASS_AUTH === "true";
  const notifications: NotificationItem[] = isBypassAuth
    ? role === "manager"
      ? nurseManagerNotifications
      : wardStaffNotifications
    : (data?.notifications ?? []).map((n) => ({
        ...n,
        description: n.messagebody,
      }));

  const sortedNotifications = [...notifications].sort(
    (a, b) =>
      new Date(b.createdat ?? 0).getTime() -
      new Date(a.createdat ?? 0).getTime(),
  );

  const handleNotificationClick = (notification: NotificationItem) => {
    const route = getNotificationRoute(notification.notificationtype);
    navigate({ to: route });
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex h-8 w-10 md:h-9 md:w-9 items-center justify-center rounded-lg md:rounded-full transition-colors hover:bg-[#DDE8EA]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5 shrink-0 text-[#4B8798]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[720px] rounded-lg border border-[#E6E6E6] bg-white p-0 shadow-lg"
        sideOffset={8}
      >
        {/* Scrollable container — header + rows share the same width */}
        <div
          className="overflow-y-auto"
          style={{ maxHeight: `${ROW_HEIGHT * 4 + 37}px` }}
        >
          {/* Sticky Header */}
          <div className="grid grid-cols-[200px_1fr_100px] border-b border-[#E6E6E6] bg-white sticky top-0 z-10">
            <div className="px-4 py-2 text-sm font-semibold text-[#4A4A4A]">Type</div>
            <div className="px-4 py-2 text-sm font-semibold text-[#4A4A4A]">Notification</div>
            <div className="px-4 py-2 text-sm font-semibold text-[#4A4A4A]">Date</div>
          </div>

          {/* Rows */}
          {sortedNotifications.length === 0 ? (
            <div
              className="flex items-center justify-center text-sm text-[#737373]"
              style={{ height: `${ROW_HEIGHT * 2}px` }}
            >
              No notifications
            </div>
          ) : (
            sortedNotifications.map((notification) => (
              <div
                key={notification.notificationid}
                className="grid grid-cols-[200px_1fr_100px] items-start border-b border-[#E6E6E6] last:border-b-0 hover:bg-[#F5F5F5] cursor-pointer transition-colors"
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="px-4 py-3">
                  <NotificationBadge
                    type={notification.notificationtype as NotificationType}
                  />
                </div>
                <div className="px-4 py-3 text-sm text-[#4A4A4A] break-words">
                  {notification.description}
                </div>
                <div className="px-4 py-3 text-sm font-semibold text-[#4A4A4A] whitespace-nowrap">
                  {notification.createdat
                    ? formatNotificationDate(notification.createdat)
                    : "N/A"}
                </div>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NotificationDropdown;
