import {
  Box,
  Flex,
  Text,
  Button,
  HStack,
} from "@chakra-ui/react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Download,
} from "lucide-react";
import moment from "moment";
import type { Ward, RosterPeriod, ViewMode } from "./types";

interface RosterHeaderProps {
  currentStartDate: Date;
  viewMode: ViewMode;
  selectedWard: Ward | null;
  selectedPeriod: RosterPeriod | null;
  wards: Ward[];
  periods: RosterPeriod[];
  onDateChange: (date: Date) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onWardChange: (ward: Ward) => void;
  onPeriodChange: (period: RosterPeriod) => void;
  onExportCSV: () => void;
  onViewEditHistory: () => void;
}

export function RosterHeader({
  currentStartDate,
  viewMode,
  selectedWard,
  selectedPeriod,
  wards,
  periods,
  onDateChange,
  onViewModeChange,
  onWardChange,
  onPeriodChange,
  onExportCSV,
  onViewEditHistory,
}: RosterHeaderProps) {
  const endDate = moment(currentStartDate).add(viewMode === "week" ? 6 : 13, "days");
  const dateRangeText = `${moment(currentStartDate).format("MMMM DD")} - ${endDate.format("MMMM DD")}`;

  const handleToday = () => {
    const today = moment().startOf("week").toDate();
    onDateChange(today);
  };

  const handleBack = () => {
    const days = viewMode === "week" ? 7 : 14;
    const newDate = moment(currentStartDate).subtract(days, "days").toDate();
    onDateChange(newDate);
  };

  const handleNext = () => {
    const days = viewMode === "week" ? 7 : 14;
    const newDate = moment(currentStartDate).add(days, "days").toDate();
    onDateChange(newDate);
  };

  return (
    <Box w="full">
      {/* Top Row: Edit History + Date Range + Ward Tabs */}
      <Flex 
        justify="space-between" 
        align="center" 
        mb={4}
        flexWrap="wrap"
        gap={3}
      >
        {/* Left Section: Edit History Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onViewEditHistory}
          borderColor="#E6E6E6"
          color="#4A4A4A"
          _hover={{ bg: "#F8FAFC" }}
        >
          <Eye className="h-4 w-4 mr-2" />
          View Edit History
        </Button>

        {/* Center Section: Date Range Display */}
        <Text
          fontSize="xl"
          fontWeight="bold"
          color="#155E75"
          textAlign="center"
        >
          {dateRangeText}
        </Text>

        {/* Right Section: Ward Tabs */}
        <HStack gap={1}>
          {wards.map((ward) => (
            <Button
              key={ward.wardId}
              size="sm"
              variant={selectedWard?.wardId === ward.wardId ? "solid" : "outline"}
              bg={selectedWard?.wardId === ward.wardId ? "#4B8798" : "transparent"}
              color={selectedWard?.wardId === ward.wardId ? "white" : "#4A4A4A"}
              borderColor="#E6E6E6"
              _hover={{ 
                bg: selectedWard?.wardId === ward.wardId ? "#3d6f7d" : "#F8FAFC" 
              }}
              onClick={() => onWardChange(ward)}
              borderRadius="md"
              px={4}
            >
              {ward.wardName}
            </Button>
          ))}
        </HStack>
      </Flex>

      {/* Bottom Row: Navigation Controls + Filters + Actions */}
      <Flex 
        justify="space-between" 
        align="center"
        flexWrap="wrap"
        gap={3}
      >
        {/* Left Section: Date Navigation */}
        <HStack gap={2}>
          <Button
            size="sm"
            variant="outline"
            onClick={handleToday}
            borderColor="#E6E6E6"
            color="#4A4A4A"
            _hover={{ bg: "#F8FAFC" }}
          >
            Today
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleBack}
            borderColor="#E6E6E6"
            color="#4A4A4A"
            _hover={{ bg: "#F8FAFC" }}
            p={2}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleNext}
            borderColor="#E6E6E6"
            color="#4A4A4A"
            _hover={{ bg: "#F8FAFC" }}
            p={2}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </HStack>

        {/* Center Section: Roster Period Dropdown */}
        <HStack gap={2}>
          <Text fontSize="sm" color="#6B7280" fontWeight="medium">
            Roster Period:
          </Text>
          <Box position="relative" minW="180px">
            <select
              value={selectedPeriod?.periodId || ""}
              onChange={(e) => {
                const period = periods.find(p => p.periodId === Number(e.target.value));
                if (period) onPeriodChange(period);
              }}
              style={{
                width: "100%",
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid #E6E6E6",
                fontSize: "14px",
                color: "#4A4A4A",
                backgroundColor: "white",
                cursor: "pointer",
              }}
            >
              {periods.map((period) => (
                <option key={period.periodId} value={period.periodId}>
                  {period.name || `${moment(period.startDate).format("MMM DD")} - ${moment(period.endDate).format("MMM DD")}`}
                </option>
              ))}
            </select>
          </Box>
        </HStack>

        {/* Right Section: View Mode Toggle + Export */}
        <HStack gap={3}>
          {/* View Mode Toggle */}
          <HStack 
            gap={0} 
            borderRadius="lg" 
            border="1px solid #E6E6E6" 
            overflow="hidden"
          >
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onViewModeChange("week")}
              bg={viewMode === "week" ? "#4B8798" : "transparent"}
              color={viewMode === "week" ? "white" : "#4A4A4A"}
              _hover={{ 
                bg: viewMode === "week" ? "#3d6f7d" : "#F8FAFC" 
              }}
              borderRadius={0}
              px={4}
            >
              Week
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onViewModeChange("twoWeeks")}
              bg={viewMode === "twoWeeks" ? "#4B8798" : "transparent"}
              color={viewMode === "twoWeeks" ? "white" : "#4A4A4A"}
              _hover={{ 
                bg: viewMode === "twoWeeks" ? "#3d6f7d" : "#F8FAFC" 
              }}
              borderRadius={0}
              px={4}
            >
              2 Weeks
            </Button>
          </HStack>

          {/* Export Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={onExportCSV}
            borderColor="#4B8798"
            color="#4B8798"
            _hover={{ bg: "#E8F4F6" }}
          >
            <Download className="h-4 w-4 mr-2" />
            Export to CSV
          </Button>
        </HStack>
      </Flex>
    </Box>
  );
}

export default RosterHeader;
