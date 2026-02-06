import { createFileRoute } from "@tanstack/react-router";
import { Box, Heading, Text, VStack, SimpleGrid } from "@chakra-ui/react";
// Đã sửa import thành Named Import (có ngoặc nhọn)
import { StatusBanner } from "@/components/WardStaff/HomePage/StatusBanner";
import { NotificationBanner } from "@/components/WardStaff/HomePage/NotificationBanner";
import StaffCalendar from "@/components/WardStaff/HomePage/StaffCalendar";
import useAuth from "@/hooks/useAuth";

export const Route = createFileRoute("/_wardStaff/home")({
  component: WardStaffHome,
});

function WardStaffHome() {
  const { user } = useAuth();

  return (
    <Box p={4}>
      {/* Header Chào mừng */}
      <Box mb={6}>
        <Heading size="lg" color="blue.700" mb={2}>
          Welcome Back, {user?.full_name || "Nurse"}!
        </Heading>
        <Text color="gray.500">Here is your schedule overview.</Text>
      </Box>

      {/* Grid Layout: Banner bên trái, Thông báo bên phải */}
      <SimpleGrid columns={{ base: 1, lg: 2 }} gap={6} mb={8}>
        <Box>
           {/* Banner Ca Trực Mới */}
           <StatusBanner />
        </Box>
        <Box>
           <NotificationBanner />
        </Box>
      </SimpleGrid>

      {/* Lịch làm việc ở dưới cùng */}
      <Box mt={8}>
        <StaffCalendar />
      </Box>
    </Box>
  );
}
