import { createFileRoute } from "@tanstack/react-router";
import { Flex, VStack } from "@chakra-ui/react";
import { RequestsOverviewTable } from "@/components/NurseManager/Requests/RequestsOverviewTable";
import useAuth from "@/hooks/useAuth";

export const Route = createFileRoute("/nurse-manager/request-overview")({
  component: ShiftOverviewPage,
});

function ShiftOverviewPage() {
  const { user } = useAuth();

  return (
    <Flex
      minH="100vh"
      w="100vw"
      height="100%"
      direction={{ base: "column" }}
      bgColor="background2"
      p={5}
    >
      <VStack
        gap={4}
        justifyItems="center"
        w="full"
        height="100%"
        bgColor="white"
        rounded="lg"
        p={7}
        textAlign="center"
      >
        <RequestsOverviewTable wardId={(user as any)?.wardid} />
      </VStack>
    </Flex>
  );
}

export default ShiftOverviewPage;
