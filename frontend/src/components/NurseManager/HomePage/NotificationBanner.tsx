import NotificationBanner from "@/components/Common/NotificationBanner";
import { nurseManagerNotifications } from "@/types/notifications";

export default function NurseManagerNotificationBanner() {
  return <NotificationBanner items={nurseManagerNotifications} />;
}
