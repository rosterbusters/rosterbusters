import { createFileRoute } from "@tanstack/react-router";
import {
  HStack,
  VStack,
  Box,
  Flex,
  Text,
  GridItem,
  Grid,
  Button,
  Select,
  Portal,
  createListCollection,
} from "@chakra-ui/react";
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import RequestCalendar from "@/components/NurseManager/Requests/ShiftRequests/RequestCalendar";
import LeaveRequestCalendar from "@/components/NurseManager/Requests/LeaveRequests/LeaveRequestCalendar";
import { WardsService, type Ward } from "@/client";
import useAuth from "@/hooks/useAuth";

export const Route = createFileRoute("/nurse-manager/request-application")({
  component: RouteComponent,
});

type ActiveTab = "shift" | "leave";

function RouteComponent() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("shift");
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null);
  const { user } = useAuth();

  const { data: wards = [] } = useQuery<Ward[]>({
    queryKey: ["wards"],
    queryFn: WardsService.getWards,
  });

  useEffect(() => {
    if (wards.length > 0 && selectedWard === null) {
      const nmWard = wards.find((w) => w.wardid === user?.wardid) ?? wards[0];
      setSelectedWard(nmWard);
    }
  }, [wards, selectedWard, user?.wardid]);

  const wardCollection = useMemo(
    () =>
      createListCollection({
        items: wards,
        itemToString: (ward) => ward.wardname,
        itemToValue: (ward) => String(ward.wardid),
      }),
    [wards],
  );

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
          <HStack gap={2} justifySelf="end">
            <Text fontSize="sm" color="#6B7280" fontWeight="medium">
              Ward:
            </Text>
            <Select.Root
              collection={wardCollection}
              size="sm"
              width="140px"
              color="foreground"
              value={selectedWard ? [String(selectedWard.wardid)] : []}
              onValueChange={(details) => {
                const ward = wards.find(
                  (w) => String(w.wardid) === details.value[0],
                );
                if (ward) setSelectedWard(ward);
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
          </HStack>
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
          <HStack justifySelf="end" />
        </Grid>
        <Box h="100%" w="100%">
          {activeTab === "shift" ? (
            <RequestCalendar wardId={selectedWard?.wardid ?? null} />
          ) : (
            <LeaveRequestCalendar wardId={selectedWard?.wardid ?? null} />
          )}
        </Box>
      </VStack>
    </Flex>
  );
}

export default RouteComponent;
