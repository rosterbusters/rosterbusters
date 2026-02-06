import {
  Box,
  Flex,
  Text,
  Button,
  HStack,
  IconButton,
  Spinner,
} from "@chakra-ui/react";
import {
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Upload,
  Download,
  Wand2,
  RefreshCw,
  X,
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
  isGenerating?: boolean;
  onDateChange: (date: Date) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onWardChange: (ward: Ward) => void;
  onPeriodChange: (period: RosterPeriod) => void;
  onPublishRoster: () => void;
  onDownloadRoster: () => void;
  onGenerateAlgorithm?: () => void;
  onClearRoster?: () => void;
}

export function RosterPlanningHeader({
  currentStartDate,
  viewMode,
  selectedWard,
  selectedPeriod,
  wards,
  periods,
  isAlgorithmGenerated = false,
  isGenerating = false,
  onDateChange,
  onViewModeChange,
  onWardChange,
  onPeriodChange,
  onPublishRoster,
  onDownloadRoster,
  onGenerateAlgorithm,
  onClearRoster,
}: RosterPlanningHeaderProps) {
  const endDate = moment(currentStartDate).add(viewMode === "week" ? 6 : 13, "days");
  const dateRangeText = `${moment(currentStartDate).format("MMMM DD")} - ${endDate.format("MMMM DD")}`;

  const handleToday = () => {
    const today = moment().startOf("isoWeek").toDate();
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
    <Box w="full" position="relative">
      {/* Top Row: Algorithm Badge (Left) + Ward/Menu (Right) - Absolute positioned */}
      <Flex 
        justify="space-between" 
        align="center" 
        position="absolute"
        top={0}
        left={0}
        right={0}
        zIndex={1}
      >
        {/* Left Section: Algorithm Generated Badge */}
        <AlgorithmGeneratedBadge isGenerated={isAlgorithmGenerated} />

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

      {/* Centered Content Stack */}
      <Flex 
        direction="column" 
        align="center" 
        justify="center"
        gap={3}
        pt={1}
      >
        {/* Title */}
        <Text
          fontSize="xl"
          fontWeight="bold"
          color="#155E75"
          textAlign="center"
        >
          Staff Roster Schedule
        </Text>

        {/* Date Range Row: Navigation (Left) + Date Range (Center) + View Mode (Right) */}
        <Flex 
          justify="space-between" 
          align="center"
          w="full"
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

        {/* Roster Period Dropdown */}
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

        {/* Algorithm Generation Buttons */}
        {!isAlgorithmGenerated ? (
          // Generate Algorithm Roster Button
          <Button
            size="md"
            bg="#4B8798"
            color="white"
            _hover={{ bg: "#3d6f7d" }}
            _active={{ bg: "#2d5a68" }}
            onClick={onGenerateAlgorithm}
            disabled={isGenerating}
            px={6}
            py={2}
            borderRadius="lg"
            fontWeight="semibold"
            boxShadow="md"
          >
            {isGenerating ? (
              <HStack gap={2}>
                <Spinner size="sm" />
                <Text>Generating...</Text>
              </HStack>
            ) : (
              <HStack gap={2}>
                <Wand2 className="h-5 w-5" />
                <Text>Generate Algorithm Roster</Text>
              </HStack>
            )}
          </Button>
        ) : (
          // Regenerate / Clear Buttons (after generation)
          <HStack gap={3}>
            <Button
              size="sm"
              variant="outline"
              borderColor="#4B8798"
              color="#4B8798"
              _hover={{ bg: "#F0F9FA" }}
              onClick={onGenerateAlgorithm}
              disabled={isGenerating}
              px={4}
            >
              {isGenerating ? (
                <HStack gap={2}>
                  <Spinner size="xs" />
                  <Text>Regenerating...</Text>
                </HStack>
              ) : (
                <HStack gap={2}>
                  <RefreshCw className="h-4 w-4" />
                  <Text>Regenerate Roster</Text>
                </HStack>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              borderColor="#E6E6E6"
              color="#6B7280"
              _hover={{ bg: "#F8FAFC", borderColor: "#DC2626", color: "#DC2626" }}
              onClick={onClearRoster}
              disabled={isGenerating}
              px={4}
            >
              <HStack gap={2}>
                <X className="h-4 w-4" />
                <Text>Clear Roster</Text>
              </HStack>
            </Button>
          </HStack>
        )}
      </Flex>
    </Box>
  );
}

export default RosterPlanningHeader;

