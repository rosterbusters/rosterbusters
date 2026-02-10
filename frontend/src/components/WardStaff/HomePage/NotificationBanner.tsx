import NotificationBanner from "@/components/Common/NotificationBanner";
import { wardStaffNotifications } from "@/types/notifications";

export default function WardStaffNotificationBanner() {
  return <NotificationBanner items={wardStaffNotifications} />;
}
