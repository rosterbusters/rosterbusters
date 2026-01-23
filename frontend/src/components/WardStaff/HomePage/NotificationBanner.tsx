import {
  ButtonGroup,
  Heading,
  IconButton,
  Pagination,
  Stack,
  Table,
  Badge,
} from "@chakra-ui/react"
import { LuChevronLeft, LuChevronRight } from "react-icons/lu"

// sample data for notifications
type NotificationType = "roster" | "shiftRequest"

interface NotificationItem {
  notificationid: number
  notificationtype: NotificationType
  description: string
  date: string
}

const notificationTypeLabels: Record<NotificationType, string> = {
  roster: "Roster",
  shiftRequest: "Shift Request",
}

const Notifications: NotificationItem[] = [
  { notificationid: 1, notificationtype: "roster", description: "18–20 Dec Roster released.", date: "1/11/2001" },
  { notificationid: 2, notificationtype: "roster", description: "31 Dec Shift Request was approved.", date: "1/11/2001" },
  { notificationid: 3, notificationtype: "shiftRequest", description: "Shift Request Period is Now Open", date: "1/11/2001" },
  { notificationid: 4, notificationtype: "shiftRequest", description: "Shift Request Period is Now Open", date: "1/11/2001" },
  { notificationid: 5, notificationtype: "roster", description: "18–20 Dec Roster released.", date: "1/11/2001" },
]


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
          {Notifications.map((item) => (
            <Table.Row lineHeight={"36px"} key={item.notificationid}>
              <Table.Cell lineHeight={"36px"}><Badge variant={item.notificationtype}>{notificationTypeLabels[item.notificationtype]}</Badge></Table.Cell>
              <Table.Cell color="foreground">{item.description}</Table.Cell>
              <Table.Cell color="foreground" fontWeight={"semibold"}>{item.date}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>

    </Stack>
  )
}
