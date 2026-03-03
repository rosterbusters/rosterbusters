import { useNavigate } from "@tanstack/react-router";
import { Stack, Table, Badge } from "@chakra-ui/react";
import type { NotificationResponse } from "@/client/NotificationsService";

// Badge variant mapping based on notification types
const getBadgeVariant = (notificationType: string): string => {
  const variantMap: Record<string, string> = {
    "Roster": "roster",
    "RosterRelease": "roster",
    "ShiftUpdate": "roster",
    "ShiftRequest": "shiftRequest",
    "LeaveRequest": "leaveRequest",
    "LeaveApproval": "leaveRequest",
    "LeaveReminder": "leaveRequest",
    "HRISReminder": "subtle",
    "System": "subtle"
  };

  return variantMap[notificationType] || "subtle";
};

// Label mapping for notification types
const notificationTypeLabels: Record<string, string> = {
  "Roster": "Roster",
  "RosterRelease": "Roster Release",
  "ShiftUpdate": "Roster",
  "ShiftRequest": "Shift Request",
  "LeaveRequest": "Leave Request",
  "LeaveApproval": "Leave Approval",
  "LeaveReminder": "Leave Reminder",
  "HRISReminder": "HRIS Reminder",
  "System": "System"
};

// Format date as D/M/YYYY
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

interface NotificationBannerProps {
  items: NotificationResponse[];
}

export default function NotificationBanner({ items }: NotificationBannerProps) {
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
                  <Badge 
                    width="fit-content" 
                    variant={getBadgeVariant(item.notificationtype) as any}
                  >
                    {notificationTypeLabels[item.notificationtype] || item.notificationtype}
                  </Badge>
                </Table.Cell>
                <Table.Cell color="foreground">
                  {item.messagebody}
                </Table.Cell>
                <Table.Cell color="foreground" fontWeight="semibold">
                  {formatDate(item.createdat)}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>
    </Stack>
  );
}