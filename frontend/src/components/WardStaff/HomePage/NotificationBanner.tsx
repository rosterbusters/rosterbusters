import NotificationBanner from "@/components/Common/NotificationBanner";
import { notifications } from "@/types/notifications";

export default function WardStaffNotificationBanner() {
  return <NotificationBanner items={notifications} />;
}
