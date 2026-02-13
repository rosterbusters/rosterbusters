import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Stack, Table, Badge } from "@chakra-ui/react";
import {
  notificationTypeLabels,
  getNotificationRoute,
  type NotificationItem,
} from "@/types/notifications";

interface NotificationBannerProps {
  items: NotificationItem[];
}

export default function NotificationBanner({
  items,
}: NotificationBannerProps) {
  const navigate = useNavigate();
  return (
    <Stack width="full" gap="5">
      <Table.ScrollArea maxHeight="216px">
        <Table.Root size="sm" interactive stickyHeader>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Type</Table.ColumnHeader>
              <Table.ColumnHeader>Notification</Table.ColumnHeader>
              <Table.ColumnHeader>Date</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {items.map((item) => (
              <Table.Row lineHeight="36px" key={item.notificationid}>
                <Table.Cell lineHeight="36px">
                  <Badge width="fit-content" variant={item.notificationtype as any}>
                    {notificationTypeLabels[item.notificationtype]}
                  </Badge>
                </Table.Cell>
                <Table.Cell color="foreground">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    {item.description}
                    <button
                      onClick={() => navigate({ to: getNotificationRoute(item.notificationtype) })}
                      aria-label={`Navigate to ${notificationTypeLabels[item.notificationtype]}`}
                      style={{ display: "inline-flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      <ArrowUpRight size={16} color="#4B8798" />
                    </button>
                  </span>
                </Table.Cell>
                <Table.Cell color="foreground" fontWeight="semibold">
                  {item.date}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>
    </Stack>
  );
}
