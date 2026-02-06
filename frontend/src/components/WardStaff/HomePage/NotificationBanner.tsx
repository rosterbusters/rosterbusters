import {
  Box,
  Table,
  Badge,
  HStack,
  Text,
} from "@chakra-ui/react"
import { useMemo } from "react"
// import { LuChevronLeft, LuChevronRight } from "react-icons/lu" // Removed unused imports

interface NotificationType {
  notificationid: number;
  notificationtype: "shiftRequest" | "roster";
  description: string;
  date: string;
}

const notifications: NotificationType[] = [
  { notificationid: 1, notificationtype: "roster", description: "18–20 Dec Roster released.", date: "1/11/2001" },
  { notificationid: 2, notificationtype: "roster", description: "31 Dec Shift Request was approved.", date: "1/11/2001" },
  { notificationid: 3, notificationtype: "shiftRequest", description: "Shift Request Period is Now Open", date: "1/11/2001" },
  { notificationid: 4, notificationtype: "shiftRequest", description: "Shift Request Period is Now Open", date: "1/11/2001" },
  { notificationid: 5, notificationtype: "roster", description: "18–20 Dec Roster released.", date: "1/11/2001" },
]

const notificationTypeLabels: Record<string, string> = {
    shiftRequest: "Shift Request",
    roster: "Roster"
}

export const NotificationBanner = () => {
  // Mock pagination for UI demonstration
  const page = 1
  const pageSize = 4
  
  const visibleNotifications = useMemo(() => {
    const start = (page - 1) * pageSize
    return notifications.slice(start, start + pageSize)
  }, [page])

  return (
    <Box borderWidth="1px" borderRadius="lg" overflow="hidden" bg="white" shadow="sm">
      <Box p={4} borderBottomWidth="1px">
        <HStack justify="space-between">
          <Text fontWeight="bold" fontSize="lg">Notifications</Text>
        </HStack>
      </Box>
      
      <Table.Root size="sm" striped>
        <Table.Body>
          {visibleNotifications.map((item) => (
            <Table.Row key={item.notificationid}>
                {/* Fixed: Use specific variant 'solid' instead of dynamic type to satisfy TS */}
                <Table.Cell lineHeight={"36px"}><Badge width="fit-content" variant="solid">{notificationTypeLabels[item.notificationtype]}</Badge></Table.Cell>
                <Table.Cell lineHeight={"36px"}>{item.description}</Table.Cell>
                <Table.Cell lineHeight={"36px"} textAlign="right" color="gray.500">{item.date}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  )
}
