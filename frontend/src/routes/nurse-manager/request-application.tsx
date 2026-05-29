import {
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
import { useEffect, useMemo, useState } from "react"
import { type Ward, WardsService } from "@/client"
import LeaveRequestCalendar from "@/components/NurseManager/Requests/LeaveRequests/LeaveRequestCalendar"
import { NewLeaveRequest } from "@/components/NurseManager/Requests/LeaveRequests/NewLeaveRequest"
import { NewShiftRequest } from "@/components/NurseManager/Requests/ShiftRequests/NewShiftRequest"
import RequestCalendar from "@/components/NurseManager/Requests/ShiftRequests/RequestCalendar"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/nurse-manager/request-application")({
  component: RouteComponent,
})

type ActiveTab = "shift" | "leave"

function RouteComponent() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("shift")
  const [isShiftRequestOpen, setIsShiftRequestOpen] = useState(false)
  const [isLeaveRequestOpen, setIsLeaveRequestOpen] = useState(false)
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null)
  const { user } = useAuth()

  const { data: wards = [] } = useQuery<Ward[]>({
    queryKey: ["wards"],
    queryFn: WardsService.getWards,
  })

  useEffect(() => {
    if (wards.length > 0 && selectedWard === null) {
      const nmWard = wards.find((w) => w.wardid === user?.wardid) ?? wards[0]
      setSelectedWard(nmWard)
    }
  }, [wards, selectedWard, user?.wardid])

  const wardCollection = useMemo(
    () =>
      createListCollection({
        items: wards,
        itemToString: (ward) => ward.wardname,
        itemToValue: (ward) => String(ward.wardid),
      }),
    [wards],
  )

  return (
    <Flex
      minH="100vh"
      w="full"
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
          <GridItem display={{ base: "none", md: "block" }} />
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
          <HStack
            gap={3}
            justifySelf={{ base: "stretch", md: "end" }}
            justify={{ base: "center", md: "flex-end" }}
            w={{ base: "full", md: "auto" }}
          >
            <Stack
              direction={{ base: "column", sm: "row" }}
              gap={2}
              align={{ base: "stretch", sm: "center" }}
              w={{ base: "full", sm: "auto" }}
            >
              <Text fontSize="sm" color="#6B7280" fontWeight="medium">
                Ward:
              </Text>
              <Select.Root
                collection={wardCollection}
                size="sm"
                width={{ base: "100%", sm: "140px" }}
                color="foreground"
                value={selectedWard ? [String(selectedWard.wardid)] : []}
                onValueChange={(details) => {
                  const ward = wards.find(
                    (w) => String(w.wardid) === details.value[0],
                  )
                  if (ward) setSelectedWard(ward)
                }}
              >
                <Select.HiddenSelect />
                <Select.Control>
                  <Select.Trigger>
                    <Select.ValueText placeholder="Select Ward" />
                  </Select.Trigger>
                  <Select.IndicatorGroup>
                    <Select.Indicator />
                  </Select.IndicatorGroup>
                </Select.Control>
                <Portal>
                  <Select.Positioner zIndex={1500}>
                    <Select.Content>
                      {wardCollection.items.map((ward) => (
                        <Select.Item key={ward.wardid} item={ward}>
                          {ward.wardname}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Portal>
              </Select.Root>
            </Stack>
          </HStack>
        </Grid>
        <Grid
          templateColumns={{ base: "1fr", md: "1fr auto 1fr" }}
          w="full"
          gap={{ base: 3, md: 0 }}
          alignItems="center"
        >
          <GridItem display={{ base: "none", md: "block" }} />
          <Text
            color="foreground"
            fontWeight="light"
            justifySelf="center"
            textAlign="center"
          >
            {activeTab === "shift"
              ? "Click on a date to create/edit shift request."
              : "Click on a date to create/edit leave request."}
          </Text>
          <HStack
            justifySelf={{ base: "stretch", md: "end" }}
            justify={{ base: "center", md: "flex-end" }}
            w={{ base: "full", md: "auto" }}
          >
            <Button
              variant={"outline"}
              size="sm"
              w={{ base: "full", sm: "auto" }}
              onClick={() =>
                activeTab === "shift"
                  ? setIsShiftRequestOpen(true)
                  : setIsLeaveRequestOpen(true)
              }
            >
              <Plus />
              {activeTab === "shift"
                ? "Add Shift Request"
                : "Add Leave Request"}
            </Button>
          </HStack>
        </Grid>
        <Box h="100%" w="100%">
          {activeTab === "shift" ? (
            <RequestCalendar wardId={selectedWard?.wardid ?? null} />
          ) : (
            <LeaveRequestCalendar wardId={selectedWard?.wardid ?? null} />
          )}
        </Box>
      </VStack>

      {activeTab === "shift" && (
        <NewShiftRequest
          isOpen={isShiftRequestOpen}
          onClose={() => setIsShiftRequestOpen(false)}
          wardId={selectedWard?.wardid ?? null}
        />
      )}
      {activeTab === "leave" && (
        <NewLeaveRequest
          isOpen={isLeaveRequestOpen}
          onClose={() => setIsLeaveRequestOpen(false)}
          wardId={selectedWard?.wardid ?? null}
        />
      )}
    </Flex>
  )
}

export default RouteComponent
