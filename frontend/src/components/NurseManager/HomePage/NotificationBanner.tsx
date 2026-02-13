import NotificationBanner from "@/components/Common/NotificationBanner";
import { notifications } from "@/types/notifications";

export default function NurseManagerNotificationBanner() {
  return <NotificationBanner items={notifications} />;
}
