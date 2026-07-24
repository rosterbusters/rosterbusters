import { Box, Flex, Stack } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import NotificationBannerContainer from "@/components/Common/NotificationBannerContainer"
import StaffCalendar from "@/components/WardStaff/HomePage/StaffCalendar"
import StatusBanner from "@/components/WardStaff/HomePage/StatusBanner"

export const Route = createFileRoute("/ward-staff/home")({
  component: HomePage,
})

function HomePage() {
  return (
    <Flex
      w="full"
      minH="100vh"
      height="fit-content"
      direction={{ base: "column" }}
      gap={4}
      bgColor="background2"
      p={5}
    >
      <Stack
        direction={{ base: "column", md: "row" }}
        gap={6}
        w="full"
        height="100%"
      >
        <Stack
          bgColor="white"
          p={12}
          width={{ base: "100%", md: "50%" }}
          rounded="lg"
          alignItems="start"
          justifyContent="center"
        >
          <StatusBanner />
        </Stack>

        <Stack
          justifyContent="center"
          bgColor="white"
          p={4}
          rounded="lg"
          width={{ base: "100%", md: "50%" }}
        >
          <NotificationBannerContainer />
        </Stack>
      </Stack>

      <Box
        w="full"
        bgColor="white"
        rounded="lg"
        p={7}
        h={{ base: "600px", md: "900px" }}
        overflowX="auto"
      >
        <Box minW="400px" h="100%" minHeight="560px">
          <StaffCalendar />
        </Box>
      </Box>
    </Flex>
  )
}

export default HomePage
