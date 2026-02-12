import {
  Box,
  Flex,
  Text,
  Button,
  HStack,
  Select,
  createListCollection,
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
  const wardCollection = createListCollection({
    items: wards.map((w) => ({
      label: w.wardName,
      value: String(w.wardId),
    })),
  });

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

        {/* Right Section: Ward Dropdown */}
        <HStack gap={2}>
          <Text fontSize="sm" color="#6B7280" fontWeight="medium">
            Ward:
          </Text>
          <Select.Root
            collection={wardCollection}
            size="sm"
            width="140px"
            color="foreground"
            value={selectedWard ? [String(selectedWard.wardId)] : []}
            onValueChange={(details) => {
              const ward = wards.find(
                (w) => String(w.wardId) === details.value[0],
              );
              if (ward) onWardChange(ward);
            }}
          >
            <Select.HiddenSelect />
            <Select.Control>
              <Select.Trigger>
                <Select.ValueText placeholder="Select Ward" />
              </Select.Trigger>
              <Select.IndicatorGroup>
                <Select.Indicator />
              </Select.IndicatorGroup>
            </Select.Control>
            <Select.Positioner>
              <Select.Content>
                {wardCollection.items.map((item) => (
                  <Select.Item key={item.value} item={item}>
                    {item.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Positioner>
          </Select.Root>
        </HStack>
      </Flex>

      {/* Bottom Row: Navigation Controls + Filters + Actions */}
      <Flex justify="space-between" align="center" flexWrap="wrap" gap={3} position="relative">
        {/* Left Section: Date Navigation */}
        <HStack gap={2}>
          <Button
            size="sm"
            variant="outline"
            onClick={handleToday}
            borderColor="#E6E6E6"
            color="foreground"
            _hover={{ bg: "#F8FAFC" }}
          >
            Today
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleBack}
            borderColor="#E6E6E6"
            color="foreground"
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
            color="foreground"
            _hover={{ bg: "#F8FAFC" }}
            p={2}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </HStack>

        {/* Center Section: Roster Period Dropdown */}
        <HStack gap={2} position="absolute" left="50%" top="50%" transform="translate(-50%, -50%)">
          <Text fontSize="sm" color="foreground" fontWeight="medium">
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
              variant="outlinegrey"
              fontWeight="normal"
              onClick={() => onViewModeChange("week")}
              bg={viewMode === "week" ? "menuactive" : "transparent"}
              color={viewMode === "week" ? "primary" : "#4A4A4A"}
              _hover={{
                bg: viewMode === "week" ? "menuactive" : "#F8FAFC",
              }}
              borderRadius={0}
              px={4}
            >
              Week
            </Button>
            <Button
              size="sm"
              variant="outlinegrey"
              fontWeight="normal"
              onClick={() => onViewModeChange("twoWeeks")}
              bg={viewMode === "twoWeeks" ? "primary" : "transparent"}
              color={viewMode === "twoWeeks" ? "white" : "foreground"}
              _hover={{
                bg: viewMode === "twoWeeks" ? "menuactive" : "#F8FAFC",
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
