import { Badge, Stack, Table } from "@chakra-ui/react"
import { useNavigate } from "@tanstack/react-router"
import type { NotificationResponse } from "@/client/NotificationsService"
import {
  getNotificationRoute,
  notificationTypeBadgeStyles,
  notificationTypeLabels,
} from "@/types/notifications"

// Format date as D/M/YYYY
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  const day = date.getDate()
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

const rolePrefix: Record<string, string> = {
  manager: "/nurse-manager",
  nurse: "/ward-staff",
}

interface NotificationBannerProps {
  items: NotificationResponse[]
  role: "nurse" | "manager"
}

export default function NotificationBanner({
  items,
  role,
}: NotificationBannerProps) {
  const navigate = useNavigate()
  const prefix = rolePrefix[role] ?? ""

  const getBadgeStyle = (type: string) =>
    notificationTypeBadgeStyles[type] ?? {
      background: "#6B7280",
      text: "#FFFFFF",
    }

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
            {items.map((item) => {
              const badgeStyle = getBadgeStyle(item.notificationtype)

              return (
                <Table.Row
                  lineHeight="36px"
                  key={item.notificationid}
                  cursor="pointer"
                  onClick={() =>
                    navigate({
                      to: `${prefix}${getNotificationRoute(item.notificationtype)}`,
                    })
                  }
                >
                  <Table.Cell lineHeight="36px">
                    <Badge
                      width="fit-content"
                      variant="subtle"
                      bg={badgeStyle.background}
                      color={badgeStyle.text}
                      borderColor={badgeStyle.border}
                    >
                      {notificationTypeLabels[item.notificationtype] ??
                        item.notificationtype}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell color="foreground">{item.messagebody}</Table.Cell>
                  <Table.Cell color="foreground" fontWeight="semibold">
                    {formatDate(item.createdat)}
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>
    </Stack>
  )
}
