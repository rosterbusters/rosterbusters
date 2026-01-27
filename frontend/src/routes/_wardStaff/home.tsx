import { createFileRoute } from "@tanstack/react-router";
import {
  Box,
  Flex,
  Stack,
} from "@chakra-ui/react";
import StaffCalendar from "../../components/WardStaff/HomePage/StaffCalendar";
import NotificationBanner from "../../components/WardStaff/HomePage/NotificationBanner";
import StatusBanner from "@/components/WardStaff/HomePage/StatusBanner";

export const Route = createFileRoute("/_wardStaff/home")({
  component: HomePage,
})
function HomePage() {
  return (
    <Flex
      h="100vh"
      w="100vw"
      direction={{ base: "column"}}
      overflowY={{ base: "auto", lg: "hidden" }}
      gap={4}
      bgColor={"background2"}
      p={5}
    >
        <Stack direction={{ base: "column", md: "row" }} gap={6} w={"full"}>
          
            <StatusBanner />

          <Stack justifyContent="center" bgColor={"white"} p={4} rounded={"lg"} width="100%">
            <NotificationBanner />
          </Stack>
        </Stack>

        <Box
          w={"full"}
          bgColor={"white"}
          rounded={"lg"}
          p={7}
          minH={{ base: "600px", md: "900px" }}
          overflowX="auto"
        >
          <Box minW="400px" h="100%" minHeight={"560px"}>
            <StaffCalendar />
          </Box>
        </Box>
    </Flex>
  );
}

export default HomePage
