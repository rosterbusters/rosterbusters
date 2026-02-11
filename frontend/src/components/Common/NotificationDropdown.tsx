import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Bell } from "lucide-react";
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
} from "@/types/notifications";

// Badge component matching badge.recipe styles
function NotificationBadge({
  type,
}: {
  type: NotificationItem["notificationtype"];
}) {
  const bgColor = type === "roster" ? "bg-cyan-500" : "bg-cyan-600";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-medium text-white",
        bgColor,
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
          className="cursor-pointer inline-flex h-8 w-10 md:h-9 md:w-9 items-center justify-center rounded-lg md:rounded-full transition-colors hover:bg-[#DDE8EA]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5 shrink-0 text-[#4B8798]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="md:auto w-[360px] max-h-[250px] rounded-lg border border-[#E6E6E6] bg-white p-0 shadow-lg flex flex-col"
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
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#DDE8EA]/30 cursor-pointer"
                  onClick={() => handleNotificationClick(notification)}
                >
                  {/* Left: Badge and Message */}
                  <div className="flex flex-1 items-center gap-2 min-w-0">
                    <NotificationBadge type={notification.notificationtype} />
                    <span className="flex-1 truncate text-sm text-[#4A4A4A]">
                      {notification.description}
                    </span>
                  </div>

                  {/* Right: CTA Icon */}
                  <button
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-[#DDE8EA]/50"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNotificationClick(notification);
                    }}
                    aria-label={`Navigate to ${notificationTypeLabels[notification.notificationtype]}`}
                  >
                    <ArrowUpRight className="h-4 w-4 text-[#4B8798]" />
                  </button>
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
