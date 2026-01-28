import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, ExternalLink } from "lucide-react";
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

// Badge colors matching badge.recipe theme
const badgeColors: Record<NotificationType, string> = {
  roster: "bg-cyan-500",      // cyan.500 from badge.recipe
  shift: "bg-cyan-600",       // cyan.600 (shiftRequest) from badge.recipe
  leave: "bg-cyan-600",       // same as shift
  system: "bg-gray-500",      // system notifications
  probation: "bg-amber-600",  // probation notifications (from screenshot)
};

// Badge component matching badge.recipe styles
function NotificationBadge({
  type,
}: {
  type: NotificationType;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded px-2.5 py-1 text-xs font-medium text-white whitespace-nowrap",
        badgeColors[type] || "bg-cyan-600",
      )}
    >
      {notificationTypeLabels[type]}
    </span>
  );
}

function NotificationDropdown() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Sort notifications by date (most recent first) - in a real app, this would be done by the backend
  const sortedNotifications = [...notifications].reverse();

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
        className="w-[520px] max-h-[250px] rounded-lg border border-[#E6E6E6] bg-white p-0 shadow-lg flex flex-col"
        sideOffset={8}
      >
        {/* Header - Fixed */}
        <div className="border-b border-[#E6E6E6] px-4 py-3 flex-shrink-0">
          <h3 className="text-sm font-semibold text-[#4A4A4A]">
            Notifications
          </h3>
        </div>

        {/* Notification List - Scrollable */}
        <div className="max-h-[240px] overflow-y-auto overflow-x-hidden pr-1 [&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar]:block [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#CBD5E1] [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[#94A3B8] [scrollbar-width:thin] [scrollbar-color:#CBD5E1_transparent]">
          {sortedNotifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[#737373]">
              No notifications
            </div>
          ) : (
            <div className="divide-y divide-[#E6E6E6]">
              {sortedNotifications.map((notification) => (
                <div
                  key={notification.notificationid}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[#DDE8EA]/30 cursor-pointer"
                  onClick={() => handleNotificationClick(notification)}
                >
                  {/* Left: Badge */}
                  <NotificationBadge type={notification.notificationtype} />

                  {/* Middle: Description with CTA icon */}
                  <span className="flex-1 flex items-center gap-1.5 text-sm text-[#4A4A4A]">
                    {notification.description}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#4B8798]" />
                  </span>

                  {/* Right: Date */}
                  <span className="shrink-0 text-sm text-[#737373]">
                    {formatNotificationDate(notification.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NotificationDropdown;
