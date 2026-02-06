import { createFileRoute } from "@tanstack/react-router";
import { Flex, Box, Text } from "@chakra-ui/react";

export const Route = createFileRoute("/nurse-manager/leave-overview")({
  component: LeaveOverviewPage,
});

function LeaveOverviewPage() {
  return (
    <Flex
      h="100vh"
      w="100vw"
      direction={{ base: "column" }}
      overflowY={{ base: "auto", lg: "hidden" }}
      gap={4}
      bgColor={"background2"}
      p={5}
    >
      <Box bgColor={"white"} p={6} rounded={"lg"} width="100%">
        <Text fontSize="2xl" fontWeight="bold" color="#4B8798">
          Leave Applications
        </Text>
        <Text color="#4A4A4A" mt={2}>
          Review and manage leave applications from ward staff.
        </Text>
      </Box>

      <Box
        w={"full"}
        bgColor={"white"}
        rounded={"lg"}
        p={7}
        flex={1}
      >
        <Text color="#6B7280">
          Leave applications content coming soon...
        </Text>
      </Box>
    </Flex>
  );
}

export default LeaveOverviewPage;
