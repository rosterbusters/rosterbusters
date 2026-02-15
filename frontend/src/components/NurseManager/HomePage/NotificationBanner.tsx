import { 
  Stack, 
  Table, 
  Badge, 
  Text, 
  Spinner, 
  Button,
  HStack,
  IconButton,
  Tabs,
  MenuRoot,
  MenuContent,
  MenuItem
} from "@chakra-ui/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NotificationsService } from "@/client/NotificationsService";
import { 
  notificationTypeLabels, 
  notificationTypeBadgeVariant,
  formatNotificationDate,
  priorityBadgeVariant
} from "@/types/notifications";
import { useState } from "react";
import { LuCircleCheck, LuRefreshCw, LuCircleDot, LuPin } from "react-icons/lu";


type NotificationFilter = "all" | "leave" | "shift" | "roster" | "urgent";

export default function NotificationBanner() {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; notificationId: number } | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { 
    data: notificationsData, 
    isLoading, 
    error,
    refetch 
  } = useQuery({
    queryKey: ["managerNotifications"],
    queryFn: () => NotificationsService.getManagerNotifications({ limit: 100, offset: 0 }),
    refetchInterval: 60000,
  });

  const markReadMutation = useMutation({
    mutationFn: (notificationIds: number[]) => 
      NotificationsService.markNotificationsRead({ notification_ids: notificationIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managerNotifications"] });
    }
  });

  const markUnreadMutation = useMutation({
    mutationFn: (notificationId: number) => 
      NotificationsService.markNotificationsUnread({ notification_ids: [notificationId] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managerNotifications"] });
    }
  });

  const handleContextMenu = (e: React.MouseEvent, notificationId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, notificationId });
  };

  const handlePin = (notificationId: number) => {
    setPinnedIds(prev => {
      const newSet = new Set(prev);
      newSet.has(notificationId) ? newSet.delete(notificationId) : newSet.add(notificationId);
      return newSet;
    });
  };

  const handleMarkAsUnread = (notificationId: number) => {
    markUnreadMutation.mutate(notificationId);
  };

  const handleMarkAllRead = () => {
    if (filteredNotifications.length > 0) {
      const unreadIds = filteredNotifications
        .filter(n => n.status !== "Read")
        .map(n => n.notificationid);
      if (unreadIds.length > 0) {
        markReadMutation.mutate(unreadIds);
      }
    }
  };

  if (isLoading) {
    return (
      <Stack align="center" justify="center" py={8}>
        <Spinner size="lg" colorPalette="blue" />
        <Text color="fg.muted" fontSize="md">Loading notifications...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack gap={4}>
        <Text fontSize="lg" color="red.500" fontWeight="semibold">
          Unable to load notifications. Please try again later.
        </Text>
        <Button onClick={() => refetch()} size="sm" variant="outline">
          Retry
        </Button>
      </Stack>
    );
  }

  const allNotifications = notificationsData?.notifications || [];
  
  const filteredNotifications = allNotifications.filter(notification => {
    if (filter === "all") return true;
    if (filter === "urgent") return notification.priority === "Urgent";
    if (filter === "leave") return notification.notificationtype === "LeaveApproval" || notification.notificationtype === "LeaveReminder";
    if (filter === "shift") return notification.notificationtype === "SwapRequest" || notification.subject?.toLowerCase().includes("shift request");
    if (filter === "roster") return notification.notificationtype === "ShiftUpdate" || notification.subject?.toLowerCase().includes("roster");
    return true;
  });

  const unreadCount = notificationsData?.unread_count || 0;
  const urgentCount = allNotifications.filter(n => n.priority === "Urgent" && n.status !== "Read").length;

  if (allNotifications.length === 0) {
    return (
      <Stack gap={4} align="center" py={8}>
        <Text fontSize="lg" color="fg.muted">
          No notifications yet
        </Text>
      </Stack>
    );
  }

  return (
    <Stack width="full" gap={4}>
      <HStack justify="space-between" width="full">
        <HStack gap={3}>
          <Text fontSize="md" fontWeight="semibold">
            Notifications
          </Text>
          {unreadCount > 0 && (
            <Badge colorPalette="red" variant="solid" size="sm">
              {unreadCount} new
            </Badge>
          )}
          {urgentCount > 0 && (
            <Badge colorPalette="orange" variant="solid" size="sm">
              {urgentCount} urgent
            </Badge>
          )}
        </HStack>
        <HStack gap={2}>
          <IconButton
            aria-label="Refresh notifications"
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            loading={isLoading}
          >
            <LuRefreshCw />
          </IconButton>
          {filteredNotifications.filter(n => n.status !== "Read").length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleMarkAllRead}
              loading={markReadMutation.isPending}
            >
              <LuCircleCheck />
              Mark all read
            </Button>
          )}
        </HStack>
      </HStack>

      <Tabs.Root 
        value={filter} 
        onValueChange={(e) => setFilter(e.value as NotificationFilter)}
        size="sm"
        variant="enclosed"
      >
        <Tabs.List>
          <Tabs.Trigger value="all">
            All ({allNotifications.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="urgent">
            Urgent ({allNotifications.filter(n => n.priority === "Urgent").length})
          </Tabs.Trigger>
          <Tabs.Trigger value="leave">
            Leave Requests
          </Tabs.Trigger>
          <Tabs.Trigger value="shift">
            Shift Requests
          </Tabs.Trigger>
          <Tabs.Trigger value="roster">
            Roster
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>

      <Table.ScrollArea maxH="500px">
        <Table.Root size="sm" variant="line" stickyHeader>
          <Table.Header>
            <Table.Row bg="bg.muted">
              <Table.ColumnHeader width="90px">Type</Table.ColumnHeader>
              <Table.ColumnHeader>Subject & Message</Table.ColumnHeader>
              <Table.ColumnHeader width="70px">Priority</Table.ColumnHeader>
              <Table.ColumnHeader width="80px">Date</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filteredNotifications.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={5}>
                  <Text textAlign="center" color="fg.muted" py={4}>
                    No notifications in this category
                  </Text>
                </Table.Cell>
              </Table.Row>
            ) : (
              filteredNotifications.map((notification) => (
                <Table.Row 
                  key={notification.notificationid}
                  bg={notification.status === "Read" ? "transparent" : "blue.50"}
                  opacity={notification.status === "Read" ? 0.7 : 1}
                  _hover={{ bg: "bg.muted" }}
                  borderLeftWidth={notification.priority === "Urgent" && notification.status !== "Read" ? "3px" : undefined}
                  borderLeftColor="red.500"
                  cursor="context-menu"
                  onContextMenu={(e) => handleContextMenu(e, notification.notificationid)}
                >
                  <Table.Cell>
                    <HStack gap={1}>
                      {pinnedIds.has(notification.notificationid) && <LuPin size={12} />}
                      <Badge 
                        colorPalette={notificationTypeBadgeVariant[notification.notificationtype] || "gray"}
                        variant="subtle"
                        size="xs"
                      >
                        {notificationTypeLabels[notification.notificationtype] || notification.notificationtype}
                      </Badge>
                    </HStack>
                  </Table.Cell>
                  <Table.Cell>
                    <Stack gap={0.5}>
                      <Text 
                        fontWeight={notification.status === "Read" ? "normal" : "semibold"}
                        fontSize="xs"
                      >
                        {notification.subject}
                      </Text>
                      {notification.messagebody && (
                        <Text color="fg.muted" fontSize="2xs" lineClamp={2}>
                          {notification.messagebody}
                        </Text>
                      )}
                      {notification.relatedentitytype && (
                        <Text color="blue.600" fontSize="2xs" fontStyle="italic">
                          {notification.relatedentitytype}
                        </Text>
                      )}
                    </Stack>
                  </Table.Cell>
                  <Table.Cell>
                    {notification.priority && (
                      <Badge
                        colorPalette={priorityBadgeVariant[notification.priority] || "blue"}
                        variant={notification.priority === "Urgent" ? "solid" : "outline"}
                        size="xs"
                      >
                        {notification.priority}
                      </Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Text fontSize="2xs">
                      {formatNotificationDate(notification.createdat)}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>

      <HStack justify="space-between" fontSize="xs" color="fg.muted" px={2}>
        <Text>
          Showing {filteredNotifications.length} of {allNotifications.length} notifications
        </Text>
        <Text>
          {unreadCount} unread
        </Text>
      </HStack>

      {contextMenu && (
        <MenuRoot open={true} onOpenChange={() => setContextMenu(null)}>
          <MenuContent
            style={{
              position: 'fixed',
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
          >
            <MenuItem value="unread" onClick={() => {
              handleMarkAsUnread(contextMenu.notificationId);
              setContextMenu(null);
            }}>
              <LuCircleDot />
              Mark as unread
            </MenuItem>
            <MenuItem value="pin" onClick={() => {
              handlePin(contextMenu.notificationId);
              setContextMenu(null);
            }}>
              <LuPin />
              {pinnedIds.has(contextMenu.notificationId) ? 'Unpin' : 'Pin'} message
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      )}
    </Stack>
  );
}