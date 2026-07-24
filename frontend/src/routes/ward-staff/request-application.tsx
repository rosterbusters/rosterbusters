import {
  Badge,
  Box,
  Button,
  createListCollection,
  Flex,
  Grid,
  GridItem,
  HStack,
  Portal,
  Select,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import moment from "moment"
import { useEffect, useMemo, useState } from "react"
import { ShiftRequestsService } from "@/client"
import LeaveRequestCalendar from "@/components/WardStaff/Requests/LeaveRequests/LeaveRequestCalendar"
import { NewLeaveRequest } from "@/components/WardStaff/Requests/LeaveRequests/NewLeaveRequest"
import { AssignableStatus } from "@/components/WardStaff/Requests/ShiftRequests/AssignableStatus"
import { NewShiftRequest } from "@/components/WardStaff/Requests/ShiftRequests/NewShiftRequest"
import RequestCalendar from "@/components/WardStaff/Requests/ShiftRequests/RequestCalendar"
import { useApplicationLockStatus } from "@/hooks/useApplicationLockStatus"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/ward-staff/request-application")({
  component: RouteComponent,
})

type ActiveTab = "shift" | "leave"
type PeriodStatus = "Past" | "Current" | "Upcoming" | "Future"

function getPeriodStatus(period: {
  startdate: string
  enddate: string
}): PeriodStatus {
  const today = moment().startOf("day")
  const start = moment(period.startdate).startOf("day")
  const end = moment(period.enddate).startOf("day")

  if (today.isBefore(start)) return "Future"
  if (today.isAfter(end)) return "Past"
  return "Current"
}

function getStatusBadgeProps(status: PeriodStatus) {
  switch (status) {
    case "Current":
      return { colorPalette: "blue" }
    case "Upcoming":
      return { colorPalette: "green" }
    case "Future":
      return { colorPalette: "purple" }
    case "Past":
      return { colorPalette: "gray" }
  }
}

function RouteComponent() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("shift")
  const [isShiftRequestOpen, setIsShiftRequestOpen] = useState(false)
  const [isLeaveRequestOpen, setIsLeaveRequestOpen] = useState(false)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const { user } = useAuth()
  const {
    isLocked,
    nextWindowStart,
    nextWindowEnd,
    selectedPeriod,
    isLoading: isPeriodWindowLoading,
  } = useApplicationLockStatus()
  const { data: periods = [] } = useQuery({
    queryKey: ["roster", "periods"],
    queryFn: () => ShiftRequestsService.getRosterPeriods(),
    staleTime: 10 * 60 * 1000,
  })

  const sortedPeriods = useMemo(
    () => [...periods].sort((a, b) => a.startdate.localeCompare(b.startdate)),
    [periods],
  )

  useEffect(() => {
    if (selectedPeriodId != null || isPeriodWindowLoading) {
      return
    }

    const defaultPeriod =
      sortedPeriods.find(
        (period) => period.periodid === selectedPeriod?.periodid,
      ) ?? sortedPeriods[0]

    if (defaultPeriod) {
      setSelectedPeriodId(defaultPeriod.periodid)
    }
  }, [
    isPeriodWindowLoading,
    selectedPeriod?.periodid,
    selectedPeriodId,
    sortedPeriods,
  ])

  const selectedRequestPeriod = useMemo(
    () =>
      sortedPeriods.find((period) => period.periodid === selectedPeriodId) ??
      selectedPeriod ??
      sortedPeriods[0],
    [selectedPeriod, selectedPeriodId, sortedPeriods],
  )
  const isViewingUpcomingPeriod =
    !!selectedRequestPeriod &&
    !!selectedPeriod &&
    selectedRequestPeriod.periodid === selectedPeriod.periodid
  const selectedPeriodStatus = selectedRequestPeriod
    ? isViewingUpcomingPeriod
      ? "Upcoming"
      : getPeriodStatus(selectedRequestPeriod)
    : undefined
  const isShiftLocked =
    activeTab === "shift" &&
    (selectedPeriodStatus === "Past" ||
      selectedPeriodStatus === "Current" ||
      (selectedPeriodStatus === "Upcoming" && isLocked))

  const periodCollection = useMemo(
    () =>
      createListCollection({
        items: sortedPeriods,
        itemToString: (period) =>
          `${period.name} (${moment(period.startdate).format("D MMM")} - ${moment(period.enddate).format("D MMM YYYY")})`,
        itemToValue: (period) => String(period.periodid),
      }),
    [sortedPeriods],
  )

  const handleDisplayedPeriodChange = (
    period: (typeof sortedPeriods)[number] | null,
  ) => {
    if (!period || period.periodid === selectedRequestPeriod?.periodid) return
    setSelectedPeriodId(period.periodid)
  }

  return (
    <Flex
      minH="100vh"
      w="100vw"
      height={"100%"}
      direction={{ base: "column" }}
      bgColor={"background2"}
      p={5}
    >
      <VStack
        gap={4}
        justifyItems="center"
        w={"full"}
        height={"100%"}
        bgColor={"white"}
        rounded={"lg"}
        p={{ base: 4, md: 7 }}
        textAlign={"center"}
      >
        <Text color="primary" fontWeight="semibold" fontSize={"lg"}>
          Leave and Shift Request Application
        </Text>
        <Grid
          templateColumns={{ base: "1fr", md: "1fr auto 1fr" }}
          w="full"
          alignItems="center"
          gap={{ base: 3, md: 0 }}
        >
          <GridItem
            justifySelf={{ base: "stretch", md: "start" }}
            w={{ base: "full", md: "auto" }}
          >
            {activeTab === "shift" && selectedRequestPeriod && (
              <Stack
                direction={{ base: "column", sm: "row" }}
                gap={2}
                align={{ base: "stretch", sm: "center" }}
                w={{ base: "full", sm: "auto" }}
              >
                <Text fontSize="sm" color="#6B7280" fontWeight="medium">
                  Period:
                </Text>
                <Select.Root
                  collection={periodCollection}
                  size="sm"
                  width={{ base: "100%", sm: "260px" }}
                  color="foreground"
                  value={[String(selectedRequestPeriod.periodid)]}
                  onValueChange={(details) => {
                    const period = sortedPeriods.find(
                      (p) => String(p.periodid) === details.value[0],
                    )
                    if (period) setSelectedPeriodId(period.periodid)
                  }}
                >
                  <Select.HiddenSelect />
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText placeholder="Select Period" />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.Indicator />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Portal>
                    <Select.Positioner zIndex={1500}>
                      <Select.Content>
                        {periodCollection.items.map((period) => (
                          <Select.Item key={period.periodid} item={period}>
                            <Stack gap={0}>
                              <HStack gap={2}>
                                <Text>{period.name}</Text>
                                {(() => {
                                  const status =
                                    period.periodid === selectedPeriod?.periodid
                                      ? "Upcoming"
                                      : getPeriodStatus(period)
                                  return (
                                    <Badge
                                      size="sm"
                                      variant="subtle"
                                      {...getStatusBadgeProps(status)}
                                    >
                                      {status}
                                    </Badge>
                                  )
                                })()}
                              </HStack>
                              <Text fontSize="xs" color="#6B7280">
                                {moment(period.startdate).format("D MMM")} -{" "}
                                {moment(period.enddate).format("D MMM YYYY")}
                              </Text>
                            </Stack>
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Portal>
                </Select.Root>
              </Stack>
            )}
          </GridItem>
          <HStack gap={0} justifySelf="center" w={{ base: "full", md: "auto" }}>
            <Button
              variant={activeTab === "shift" ? "solid" : "outline"}
              onClick={() => setActiveTab("shift")}
              roundedTopLeft="full"
              roundedBottomLeft="full"
              flex={{ base: 1, md: "initial" }}
            >
              Shift Requests
            </Button>
            <Button
              variant={activeTab === "leave" ? "solid" : "outline"}
              onClick={() => setActiveTab("leave")}
              roundedBottomRight="full"
              roundedTopRight="full"
              flex={{ base: 1, md: "initial" }}
            >
              Leave Requests
            </Button>
          </HStack>
          {activeTab === "shift" ? (
            <Button
              variant={"outline"}
              justifySelf="end"
              size="sm"
              w={{ base: "full", sm: "auto" }}
              disabled={isShiftLocked}
              onClick={() => setIsShiftRequestOpen(true)}
            >
              <Plus />
              Add Shift Request
            </Button>
          ) : (
            <Button
              variant={"outline"}
              justifySelf="end"
              size="sm"
              w={{ base: "full", sm: "auto" }}
              onClick={() => setIsLeaveRequestOpen(true)}
            >
              <Plus />
              Add Leave Request
            </Button>
          )}
        </Grid>
        <Grid
          templateColumns={{ base: "1fr", md: "1fr auto 1fr" }}
          w="full"
          gap={{ base: 2, md: 0 }}
        >
          <GridItem />
          <Text color="foreground" fontWeight="light" justifySelf="center">
            {activeTab === "shift"
              ? "Click on a date to create/edit shift request."
              : "Click on a date to create/edit leave request."}
          </Text>
          {activeTab === "shift" && !isShiftLocked && (
            <HStack justifySelf="end">
              <AssignableStatus />
            </HStack>
          )}
        </Grid>
        <Box h="100%" w="100%">
          {activeTab === "shift" ? (
            <RequestCalendar
              wardId={user?.wardid}
              activePeriod={selectedRequestPeriod}
              periods={sortedPeriods}
              upcomingPeriodId={selectedPeriod?.periodid}
              onDisplayedPeriodChange={handleDisplayedPeriodChange}
              isLocked={isShiftLocked}
              nextWindowStart={nextWindowStart}
              nextWindowEnd={nextWindowEnd}
            />
          ) : (
            <LeaveRequestCalendar wardId={user?.wardid} isLocked={false} />
          )}
        </Box>
      </VStack>

      {activeTab === "shift" && !isShiftLocked && (
        <NewShiftRequest
          isOpen={isShiftRequestOpen}
          onClose={() => setIsShiftRequestOpen(false)}
          wardId={user?.wardid}
          activePeriod={selectedRequestPeriod}
        />
      )}
      {activeTab === "leave" && (
        <NewLeaveRequest
          isOpen={isLeaveRequestOpen}
          onClose={() => setIsLeaveRequestOpen(false)}
          wardId={user?.wardid}
        />
      )}
    </Flex>
  )
}
