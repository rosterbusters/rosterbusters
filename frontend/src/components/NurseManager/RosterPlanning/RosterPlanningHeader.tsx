import {
  Box,
  Flex,
  Text,
  Button,
  HStack,
  IconButton,
} from "@chakra-ui/react";
import {
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Upload,
  Download,
} from "lucide-react";
import moment from "moment";
import type { Ward, RosterPeriod, ViewMode } from "../RosterTable/types";
import {
  MenuRoot,
  MenuTrigger,
  MenuContent,
  MenuItem,
} from "@/components/ui/menu";
import { AlgorithmGeneratedBadge } from "./AlgorithmGeneratedBadge";

interface RosterPlanningHeaderProps {
  currentStartDate: Date;
  viewMode: ViewMode;
  selectedWard: Ward | null;
  selectedPeriod: RosterPeriod | null;
  wards: Ward[];
  periods: RosterPeriod[];
  isAlgorithmGenerated?: boolean;
  onDateChange: (date: Date) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onWardChange: (ward: Ward) => void;
  onPeriodChange: (period: RosterPeriod) => void;
  onPublishRoster: () => void;
  onDownloadRoster: () => void;
}

export function RosterPlanningHeader({
  currentStartDate,
  viewMode,
  selectedWard,
  selectedPeriod,
  wards,
  periods,
  isAlgorithmGenerated = true,
  onDateChange,
  onViewModeChange,
  onWardChange,
  onPeriodChange,
  onPublishRoster,
  onDownloadRoster,
}: RosterPlanningHeaderProps) {
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
      {/* Top Row: Algorithm Badge + Title + Ward Tabs + Menu */}
      <Flex 
        justify="space-between" 
        align="center" 
        mb={4}
        flexWrap="wrap"
        gap={3}
      >
        {/* Left Section: Algorithm Generated Badge */}
        <AlgorithmGeneratedBadge isGenerated={isAlgorithmGenerated} />

        {/* Center Section: Title */}
        <Text
          fontSize="xl"
          fontWeight="bold"
          color="#155E75"
          textAlign="center"
        >
          Staff Roster Schedule
        </Text>

        {/* Right Section: Ward Dropdown + Hamburger Menu */}
        <HStack gap={2}>
          <Text fontSize="sm" color="#6B7280" fontWeight="medium">
            Ward:
          </Text>
          <Box position="relative" minW="140px">
            <select
              value={selectedWard?.wardId || ""}
              onChange={(e) => {
                const ward = wards.find(w => w.wardId === Number(e.target.value));
                if (ward) onWardChange(ward);
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
              {wards.map((ward) => (
                <option key={ward.wardId} value={ward.wardId}>
                  {ward.wardName}
                </option>
              ))}
            </select>
          </Box>
          
          {/* Hamburger Menu */}
          <MenuRoot>
            <MenuTrigger asChild>
              <IconButton
                aria-label="More options"
                variant="outline"
                size="sm"
                borderColor="#E6E6E6"
                color="#4A4A4A"
                _hover={{ bg: "#F8FAFC" }}
              >
                <MoreVertical className="h-4 w-4" />
              </IconButton>
            </MenuTrigger>
            <MenuContent>
              <MenuItem
                value="publish"
                onClick={onPublishRoster}
                cursor="pointer"
                _hover={{ bg: "#F0F9FA" }}
              >
                <HStack gap={2}>
                  <Upload className="h-4 w-4" />
                  <Text>Publish Roster</Text>
                </HStack>
              </MenuItem>
              <MenuItem
                value="download"
                onClick={onDownloadRoster}
                cursor="pointer"
                _hover={{ bg: "#F0F9FA" }}
              >
                <HStack gap={2}>
                  <Download className="h-4 w-4" />
                  <Text>Download Roster</Text>
                </HStack>
              </MenuItem>
            </MenuContent>
          </MenuRoot>
        </HStack>
      </Flex>

      {/* Middle Row: Navigation Controls + Date Range + View Mode */}
      <Flex 
        justify="space-between" 
        align="center"
        flexWrap="wrap"
        gap={3}
        mb={3}
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

        {/* Center Section: Date Range Display */}
        <Text
          fontSize="lg"
          fontWeight="semibold"
          color="#374151"
          textAlign="center"
        >
          {dateRangeText}
        </Text>

        {/* Right Section: View Mode Toggle */}
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
      </Flex>

      {/* Bottom Row: Roster Period Dropdown (Centered) */}
      <Flex justify="center" align="center">
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
      </Flex>
    </Box>
  );
}

export default RosterPlanningHeader;

