import {
  Stack,
  Table,
  Badge,
} from "@chakra-ui/react";
import {
  notifications,
  notificationTypeLabels,
} from "@/types/notifications";

export default function NotificationBanner() {
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
            {notifications.map((item) => (
              <Table.Row lineHeight={"36px"} key={item.notificationid}>
                <Table.Cell lineHeight={"36px"}>
                  <Badge width="fit-content" variant={item.notificationtype as any}>
                    {notificationTypeLabels[item.notificationtype]}
                  </Badge>
                </Table.Cell>
                <Table.Cell color="foreground">{item.description}</Table.Cell>
                <Table.Cell color="foreground" fontWeight={"semibold"}>{item.createdAt}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>
    </Stack>
  );
}
