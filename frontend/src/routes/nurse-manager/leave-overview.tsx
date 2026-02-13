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

import { AssignableStatus } from "@/components/NurseManager/Requests/AssignableStatus";
import RequestCalendar from "@/components/NurseManager/Requests/RequestCalendar";

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
          <GridItem />
        </Grid>
        <Grid templateColumns={{base:'1fr', md:"1fr auto 1fr"}} w="full" gap={{base:2, md:0}}>
          <GridItem />
          <Text color="foreground" fontWeight="light" justifySelf="center">
            Click on a date to view shift request details.
          </Text>
          <HStack justifySelf="end">
            <AssignableStatus/>
          </HStack>
        </Grid>
        <Box h="100%" w="100%">
        <RequestCalendar/>
        </Box>
      </VStack>
    </Flex>
  );
}

export default LeaveOverviewPage;
