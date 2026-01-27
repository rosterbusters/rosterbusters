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
  GridItem,
  Grid,
  Badge,
  Button,
} from "@chakra-ui/react";
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

function RouteComponent() {
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
      >
        <Heading color="primary">Leave and Shift Request Application</Heading>
        <HStack>
          <Button variant={"outline"} onClick={handleShiftClicked}>
            Shift Requests
          </Button>
          <Button variant={"outline"} onClick={handleLeaveClicked}>
            Leave Requests
          </Button>
        </HStack>
        <Grid templateColumns="1fr auto 1fr" w="full">
          <GridItem />
          <Text color="foreground" fontWeight="light" justifySelf="center">
            Click on a date to create/edit shift request.
          </Text>
          <HStack justifySelf="end">
            <Text color="foreground" fontWeight="light">
              Assignable:
            </Text>
            <Badge variant="requests">Requests: 1</Badge>
          </HStack>
        </Grid>
        <RequestCalendar />
      </VStack>
    </Flex>
  );
}
