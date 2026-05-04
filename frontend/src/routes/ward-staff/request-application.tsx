import {
  Box,
  Button,
  Flex,
  Grid,
  GridItem,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useState } from "react"
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

function RouteComponent() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("shift")
  const [isShiftRequestOpen, setIsShiftRequestOpen] = useState(false)
  const [isLeaveRequestOpen, setIsLeaveRequestOpen] = useState(false)
  const { user } = useAuth()
  const { isLocked, nextWindowStart, nextWindowEnd } =
    useApplicationLockStatus()
  const isShiftLocked = activeTab === "shift" && isLocked

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
        p={7}
        textAlign={"center"}
      >
        <Text color="primary" fontWeight="semibold" fontSize={"lg"}>
          Leave and Shift Request Application
        </Text>
        <Grid templateColumns="1fr auto 1fr" w="full" alignItems="center">
          <GridItem />
          <HStack gap={0} justifySelf="center">
            <Button
              variant={activeTab === "shift" ? "solid" : "outline"}
              onClick={() => setActiveTab("shift")}
              roundedTopLeft="full"
              roundedBottomLeft="full"
            >
              Shift Requests
            </Button>
            <Button
              variant={activeTab === "leave" ? "solid" : "outline"}
              onClick={() => setActiveTab("leave")}
              roundedBottomRight="full"
              roundedTopRight="full"
            >
              Leave Requests
            </Button>
          </HStack>
          {activeTab === "shift" ? (
            isLocked ? (
              <GridItem />
            ) : (
              <Button
                variant={"outline"}
                justifySelf="end"
                size="sm"
                onClick={() => setIsShiftRequestOpen(true)}
              >
                <Plus />
                Add Shift Request
              </Button>
            )
          ) : (
            <Button
              variant={"outline"}
              justifySelf="end"
              size="sm"
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
          {activeTab === "shift" && !isLocked && (
            <HStack justifySelf="end">
              <AssignableStatus />
            </HStack>
          )}
        </Grid>
        <Box h="100%" w="100%">
          {activeTab === "shift" ? (
            <RequestCalendar
              wardId={user?.wardid}
              isLocked={isShiftLocked}
              nextWindowStart={nextWindowStart}
              nextWindowEnd={nextWindowEnd}
            />
          ) : (
            <LeaveRequestCalendar wardId={user?.wardid} isLocked={false} />
          )}
        </Box>
      </VStack>

      {activeTab === "shift" && !isLocked && (
        <NewShiftRequest
          isOpen={isShiftRequestOpen}
          onClose={() => setIsShiftRequestOpen(false)}
          wardId={user?.wardid}
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
