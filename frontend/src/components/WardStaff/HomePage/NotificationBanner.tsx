import { Badge, Stack, Table } from "@chakra-ui/react";
import { notifications, notificationTypeLabels, type NotificationType } from "@/types/notifications";

const badgeVariantMap: Record<NotificationType, string> = {
  roster: "roster",
  leave: "requests",
  shift: "shiftRequest",
  system: "subtle",
  probation: "probation",
};

export default function NotificationBanner() {
  return(
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
              <Table.Cell lineHeight={"36px"}><Badge width="fit-content" variant={badgeVariantMap[item.notificationtype]}>{notificationTypeLabels[item.notificationtype]}</Badge></Table.Cell>
              <Table.Cell color="foreground">{item.description}</Table.Cell>
              <Table.Cell color="foreground" fontWeight={"semibold"}>{item.createdAt}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>

    </Stack>
  )
}
