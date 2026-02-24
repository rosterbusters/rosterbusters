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
} from "@chakra-ui/react";
import { Plus } from "lucide-react";
import { useState } from "react";

import { AssignableStatus } from "@/components/NurseManager/Requests/AssignableStatus";
import RequestCalendar from "@/components/NurseManager/Requests/RequestCalendar";
import { NewShiftRequest } from "@/components/WardStaff/Requests/NewShiftRequest";
import useAuth from "@/hooks/useAuth";

export const Route = createFileRoute("/nurse-manager/leave-overview")({
  component: LeaveOverviewPage,
});

function handleShiftClicked() {
  alert("Shift Requests Clicked");
}
function handleLeaveClicked() {
  alert("Leave Requests Clicked");
}

function LeaveOverviewPage() {
  const [isShiftRequestOpen, setIsShiftRequestOpen] = useState(false);
  const { user } = useAuth();

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
        <Text color="primary" fontWeight="semibold" fontSize={"lg"}>Leave and Shift Overview</Text>
        <Grid templateColumns="1fr auto 1fr" w="full" alignItems="center">
          <GridItem />
          <HStack gap={0} justifySelf="center">
            <Button disabled variant={"outline"} onClick={handleShiftClicked} roundedTopLeft="full" roundedBottomLeft="full">
              Shift Requests
            </Button>
            <Button variant={"outline"} onClick={handleLeaveClicked} roundedBottomRight="full" roundedTopRight="full">
              Leave Requests
            </Button>
          </HStack>
          <Button variant={"outline"} justifySelf="end" size="sm" onClick={() => setIsShiftRequestOpen(true)}>
            <Plus />Add Shift Request
          </Button>
        </Grid>
        <Grid templateColumns={{ base: '1fr', md: '1fr auto 1fr' }} w='full' gap={{ base: 2, md: 0 }}>
          <GridItem />
          <Text color="foreground" fontWeight="light" justifySelf="center">
            Click on a date to create/edit shift request.
          </Text>
          <HStack justifySelf="end">
            <AssignableStatus />
          </HStack>
        </Grid>
        <Box h="100%" w="100%">
          <RequestCalendar wardId={(user as any)?.wardid} />
        </Box>
      </VStack>
      <NewShiftRequest
        isOpen={isShiftRequestOpen}
        onClose={() => setIsShiftRequestOpen(false)}
        wardId={(user as any)?.wardid}
      />
    </Flex>
  );
}

export default LeaveOverviewPage;
