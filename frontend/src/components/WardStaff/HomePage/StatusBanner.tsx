import { useEffect, useState } from "react";
import {
  Box,
  Flex,
  Text,
  Icon,
  Spinner,
  Alert,
} from "@chakra-ui/react";
import { FaSun, FaMoon, FaCoffee } from "react-icons/fa";
import useAuth from "../../../hooks/useAuth";

// Define Data Type
interface UpcomingShift {
  shiftDate: string;
  shiftCode: string;
  startTime: string;
  endTime: string;
  wardName: string;
}

export const StatusBanner = () => {
  const { user } = useAuth();
  const [shift, setShift] = useState<UpcomingShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [error] = useState<string | null>(null);

  useEffect(() => {
    const fetchUpcomingShift = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem("access_token");
        
        // Direct API Call
        const response = await fetch("/api/v1/home/upcoming-shift", {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
            if (response.status === 404) {
                setShift(null);
                return;
            }
            throw new Error("API Error");
        }

        const data = await response.json();
        
        if (data) {
          setShift(data as UpcomingShift);
        } else {
          setShift(null);
        }
      } catch (err) {
        console.error("Failed to fetch shift:", err);
        setShift(null);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchUpcomingShift();
    }
  }, [user]);

  // Helper function for styling
  const getShiftStyle = (code: string) => {
    switch (code) {
      case "AM": return { color: "orange.500", icon: FaSun, label: "Day Shift" };
      case "PM": return { color: "blue.500", icon: FaSun, label: "Afternoon Shift" };
      case "ND": return { color: "purple.600", icon: FaMoon, label: "Night Shift" };
      default: return { color: "gray.500", icon: FaCoffee, label: "Off Duty" };
    }
  };

  if (loading) {
    return <Box p={5}><Spinner /></Box>;
  }

  if (error) {
    return (
      <Alert.Root status="error" borderRadius="md" mb={4}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Error!</Alert.Title>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }

  if (!shift) {
    return (
      <Box bg="gray.50" p={6} borderRadius="lg" shadow="sm" mb={6}>
        <Text fontSize="lg" color="gray.600">
          Hi {user?.full_name || "Nurse"}, you have no upcoming shifts scheduled.
        </Text>
      </Box>
    );
  }

  const style = getShiftStyle(shift.shiftCode);

  return (
    <Box bg="white" p={6} borderRadius="lg" shadow="sm" mb={6} borderLeft="5px solid" borderColor={style.color}>
      <Flex align="center" justify="space-between">
        <Box>
          <Text fontSize="2xl" fontWeight="bold" color="gray.700">
            Hi {user?.full_name || "Nurse"},
          </Text>
          <Text fontSize="xl" mt={2}>
            You have an upcoming <Text as="span" fontWeight="bold" color={style.color}>{style.label}</Text> at 
            <Text as="span" fontWeight="bold"> {shift.startTime}</Text>, on
          </Text>
          <Text fontSize="2xl" fontWeight="bold" color="blue.600" mt={1}>
            {new Date(shift.shiftDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })}.
          </Text>
        </Box>
        <Icon as={style.icon} w={12} h={12} color={style.color} opacity={0.8} />
      </Flex>
    </Box>
  );
};
