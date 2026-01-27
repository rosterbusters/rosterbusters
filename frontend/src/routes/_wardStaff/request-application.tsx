import { createFileRoute } from "@tanstack/react-router";
import {
  HStack,
  Heading,
  VStack,
  Stack,
  Box,
  Flex,
  Text,
  ButtonGroup,
  Button,
} from "@chakra-ui/react";
import { Calendar } from "@/components/ui/calendar"
import RequestCalendar from "@/components/WardStaff/Requests/RequestCalendar";

export const Route = createFileRoute("/_wardStaff/request-application")({
  component: RouteComponent,
});

function handleShiftClicked() {
  alert("Shift Requests Clicked");
}
function handleLeaveClicked() {
  alert("Leave Requests Clicked");
}
export function CalendarBasic() {
  return <Calendar mode="single" className="rounded-lg border" />
}


function RouteComponent() {
  return (
    <Flex
      h="100vh"
      w="100vw"
      direction={{ base: "column" }}
      overflowY={{ base: "auto", lg: "hidden" }}
      bgColor={"background2"}
      p={5}
    >
      <VStack gap={6} justifyItems="center" w={"full"} bgColor={"white"} rounded={"lg"} p={7} >
          <Heading color="primary">Leave and Shift Request Application</Heading>
          <HStack>
            <Button variant={"outline"} onClick={handleShiftClicked}>Shift Requests</Button>
            <Button variant={"outline"} onClick={handleLeaveClicked}>Leave Requests</Button>
          </HStack>
          <Text color="foreground" fontWeight={"light"}>Click on a date to create/edit shift request.</Text>
          <RequestCalendar />
      </VStack>
    </Flex>
  );
}
