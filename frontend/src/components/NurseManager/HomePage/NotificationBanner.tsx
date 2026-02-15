import { Stack, Spinner, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { NotificationsService } from "@/client/NotificationsService";
import NotificationBanner from "@/components/Common/NotificationBanner";

export default function NurseManagerNotificationBanner() {
  const { data: notificationsData, isLoading, error } = useQuery({
    queryKey: ["managerNotifications"],
    queryFn: () => NotificationsService.getManagerNotifications({ limit: 20, offset: 0 }),
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Stack align="center" justify="center" py={8}>
        <Spinner size="lg" />
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack align="center" justify="center" py={8}>
        <Text color="red.500">Failed to load notifications</Text>
      </Stack>
    );
  }

  const notifications = notificationsData?.notifications || [];

  return <NotificationBanner items={notifications} />;
}
