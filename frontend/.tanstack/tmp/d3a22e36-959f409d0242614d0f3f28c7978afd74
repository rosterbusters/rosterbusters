import { createFileRoute } from "@tanstack/react-router";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import {
  Box,
  HStack,
  VStack,
  Text,
  Heading,
  Table,
  Flex,
  Grid,
  GridItem,
  Stack,
} from "@chakra-ui/react";
import StaffCalendar from "../../components/WardStaff/HomePage/StaffCalendar";
import NotificationBanner from "../../components/WardStaff/HomePage/NotificationBanner";
import StatusBanner from "@/components/WardStaff/HomePage/StatusBanner";
import { BoxIcon } from "lucide-react";
export const Route = createFileRoute("/wardStaff/")({
  component: HomePage,
});

const Name = "John Doe";

function HomePage() {
  return (
    <Flex
      h="100vh"
      w="100vw"
      direction={{ base: "column"}}
      overflowY={{ base: "auto", lg: "hidden" }}
      gap={8}
      bgColor={"background2"}
      p={5}
    >
        <Stack direction={{ mobile: "column", desktop: "row" }} gap={6} w={"full"}>
          
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
          height={{ mobile: "600px", desktop: "900px" }}
          overflowX="auto"
        >
          <Box minW="400px"h="100%">
            <StaffCalendar />
          </Box>
        </Box>
    </Flex>
  );
}
