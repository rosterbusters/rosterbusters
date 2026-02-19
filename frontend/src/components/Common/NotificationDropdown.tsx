import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, ChevronUp, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  notifications,
  notificationTypeLabels,
  getNotificationRoute,
  type NotificationItem,
  type NotificationType,
} from "@/types/notifications";

// Format date as D/MM/YYYY
function formatNotificationDate(dateString: string): string {
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Badge colors matching Ward Staff NotificationBanner
const badgeColors: Record<NotificationType, string> = {
  roster: "bg-[#06B6D4]",        // cyan.500
  shift: "bg-[#0891B2]",         // cyan.600 (shiftRequest)
  leave: "bg-[#0891B2]",         // cyan.600
  system: "bg-[#6B7280]",        // gray.500
  probation: "bg-[#D97706]",     // amber.600
};

// Badge component matching Ward Staff style
function NotificationBadge({ type }: { type: NotificationType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-medium text-white whitespace-nowrap w-fit",
        badgeColors[type] || "bg-[#0891B2]"
      )}
    >
      {notificationTypeLabels[type]}
    </span>
  );
}

// Number of visible rows at a time
const VISIBLE_ROWS = 4;
const ROW_HEIGHT = 44; // px per row

function NotificationDropdown() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [scrollIndex, setScrollIndex] = useState(0);

  // Sort notifications by date (most recent first)
  const sortedNotifications = [...notifications].reverse();
  
  // Calculate max scroll index
  const maxScrollIndex = Math.max(0, sortedNotifications.length - VISIBLE_ROWS);
  
  // Get visible notifications based on scroll position
  const visibleNotifications = sortedNotifications.slice(
    scrollIndex,
    scrollIndex + VISIBLE_ROWS
  );

  const handleNotificationClick = (notification: NotificationItem) => {
    const route = getNotificationRoute(notification.notificationtype);
    navigate({ to: route });
    setOpen(false);
  };

  const handleScrollUp = () => {
    setScrollIndex((prev) => Math.max(0, prev - 1));
  };

  const handleScrollDown = () => {
    setScrollIndex((prev) => Math.min(maxScrollIndex, prev + 1));
  };

  const canScrollUp = scrollIndex > 0;
  const canScrollDown = scrollIndex < maxScrollIndex;

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
        className="w-[520px] rounded-lg border border-[#E6E6E6] bg-white p-0 shadow-lg"
        sideOffset={8}
      >
        {/* Table Container */}
        <div className="flex">
          {/* Table */}
          <div className="flex-1">
            {/* Table Header */}
            <div className="grid grid-cols-[100px_1fr_100px] border-b border-[#E6E6E6] bg-white">
              <div className="px-4 py-2 text-sm font-semibold text-[#4A4A4A]">
                Type
              </div>
              <div className="px-4 py-2 text-sm font-semibold text-[#4A4A4A]">
                Notification
              </div>
              <div className="px-4 py-2 text-sm font-semibold text-[#4A4A4A]">
                Date
              </div>
            </div>

            {/* Table Body */}
            <div style={{ height: `${VISIBLE_ROWS * ROW_HEIGHT}px` }}>
              {visibleNotifications.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-[#737373]">
                  No notifications
                </div>
              ) : (
                visibleNotifications.map((notification) => (
                  <div
                    key={notification.notificationid}
                    className="grid grid-cols-[100px_1fr_100px] items-center border-b border-[#E6E6E6] last:border-b-0 hover:bg-[#F5F5F5] cursor-pointer transition-colors"
                    style={{ height: `${ROW_HEIGHT}px` }}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="px-4">
                      <NotificationBadge type={notification.notificationtype} />
                    </div>
                    <div className="px-4 text-sm text-[#4A4A4A] truncate">
                      {notification.description}
                    </div>
                    <div className="px-4 text-sm font-semibold text-[#4A4A4A]">
                      {formatNotificationDate(notification.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Scroll Buttons */}
          <div className="flex flex-col justify-center border-l border-[#E6E6E6] px-1">
            <button
              onClick={handleScrollUp}
              disabled={!canScrollUp}
              className={cn(
                "p-1 rounded transition-colors",
                canScrollUp
                  ? "text-[#4B8798] hover:bg-[#DDE8EA]/50"
                  : "text-[#D1D5DB] cursor-not-allowed"
              )}
              aria-label="Scroll up"
            >
              <ChevronUp className="h-5 w-5" />
            </button>
            <button
              onClick={handleScrollDown}
              disabled={!canScrollDown}
              className={cn(
                "p-1 rounded transition-colors",
                canScrollDown
                  ? "text-[#4B8798] hover:bg-[#DDE8EA]/50"
                  : "text-[#D1D5DB] cursor-not-allowed"
              )}
              aria-label="Scroll down"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NotificationDropdown;
