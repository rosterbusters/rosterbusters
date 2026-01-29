import {
  Stack,
  Table,
  Badge,
} from "@chakra-ui/react";

// Notification types for Nurse Manager
type NotificationType = "roster" | "probation" | "shiftRequest";

interface NotificationItem {
  notificationId: number;
  notificationType: NotificationType;
  description: string;
  date: string;
}

const notificationTypeLabels: Record<NotificationType, string> = {
  roster: "Roster",
  probation: "Probation",
  shiftRequest: "Shift Request",
};

// // Sample data for NurseManager notifications
// const Notifications: NotificationItem[] = [
//   { notificationId: 1, notificationType: "roster", description: "Start Planning 10 Nov - 21 Nov Roster", date: "1/11/2001" },
//   { notificationId: 2, notificationType: "probation", description: "Mary Lamb: Probation ending in 2 days", date: "1/11/2001" },
// ];

const Notifications: NotificationItem[] = [
    { notificationId: 1, notificationType: "roster", description: "18–20 Dec Roster released.", date: "1/11/2001" },
    { notificationId: 2, notificationType: "roster", description: "31 Dec Shift Request was approved.", date: "1/11/2001" },
    { notificationId: 3, notificationType: "shiftRequest", description: "Shift Request Period is Now Open", date: "1/11/2001" },
    { notificationId: 4, notificationType: "shiftRequest", description: "Shift Request Period is Now Open", date: "1/11/2001" },
    { notificationId: 5, notificationType: "roster", description: "18–20 Dec Roster released.", date: "1/11/2001" },
  ]

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
            {Notifications.map((item) => (
              <Table.Row lineHeight={"36px"} key={item.notificationId}>
                <Table.Cell lineHeight={"36px"}>
                  <Badge width="fit-content" variant={item.notificationType as any}>
                    {notificationTypeLabels[item.notificationType]}
                  </Badge>
                </Table.Cell>
                <Table.Cell color="foreground">{item.description}</Table.Cell>
                <Table.Cell color="foreground" fontWeight={"semibold"}>{item.date}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>
    </Stack>
  );
}

