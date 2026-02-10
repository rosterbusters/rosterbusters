import {
  Box,
  Flex,
  Text,
  Button,
  HStack,
  Select,
  createListCollection,
} from "@chakra-ui/react";
import { ChevronLeft, ChevronRight, Eye, Download } from "lucide-react";
import moment from "moment";
import { Ward } from "@/client";
import type { RosterPeriod, ViewMode } from "./types";

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
  const endDate = moment(currentStartDate).add(
    viewMode === "week" ? 6 : 13,
    "days",
  );
  const dateRangeText = `${moment(currentStartDate).format("MMMM DD")} - ${endDate.format("MMMM DD")}`;

  const wardCollection = createListCollection({
    items: wards,
    itemToString: (ward) => ward.wardname,
    itemToValue: (ward) => String(ward.wardid),
  });

  const periodCollection = createListCollection({
    items: periods,
    itemToString: (period) =>
      period.name ||
      `${moment(period.startDate).format("MMM DD")} - ${moment(period.endDate).format("MMM DD")}`,
    itemToValue: (period) => String(period.periodId),
  });

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
          variant="outlinegrey"
          size="sm"
          onClick={onViewEditHistory}
          
          _hover={{ bg: "#F8FAFC" }}
        >
          <Eye />
          View Edit History
        </Button>

        {/* Center Section: Date Range Display */}
        <Text
          fontSize="lg"
          fontWeight="semibold"
          color="brand.fg"
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
            value={selectedWard ? [String(selectedWard.wardid)] : []}
            onValueChange={(details) => {
              const ward = wards.find(
                (w) => String(w.wardid) === details.value[0],
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
                {wardCollection.items.map((ward) => (
                  <Select.Item key={ward.wardid} item={ward}>
                    {ward.wardname}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Positioner>
          </Select.Root>
        </HStack>
      </Flex>

      {/* Bottom Row: Navigation Controls + Filters + Actions */}
      <Flex justify="space-between" align="center" flexWrap="wrap" gap={3}>
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
          <HStack gap={0}>
            <Button
            size="sm"
            variant="outline"
            onClick={handleBack}
            borderColor="#E6E6E6"
            color="#4A4A4A"
            _hover={{ bg: "#F8FAFC" }}
            roundedBottomLeft="full"
            roundedTopLeft="full"
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
            roundedBottomRight="full"
            roundedTopRight="full"
            p={2}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
          </HStack>
          
        </HStack>

        {/* Center Section: Roster Period Dropdown */}
        <HStack gap={2}>
          <Text fontSize="sm" color="#6B7280" fontWeight="medium">
            Roster Period:
          </Text>
          <Select.Root
            collection={periodCollection}
            size="sm"
            width="220px"
            value={selectedPeriod ? [String(selectedPeriod.periodId)] : []}
            onValueChange={(details) => {
              const period = periods.find(
                (p) => String(p.periodId) === details.value[0],
              );
              if (period) onPeriodChange(period);
            }}
          >
            <Select.HiddenSelect />
            <Select.Control>
              <Select.Trigger>
                <Select.ValueText placeholder="Select period" />
              </Select.Trigger>
              <Select.IndicatorGroup>
                <Select.Indicator />
              </Select.IndicatorGroup>
            </Select.Control>
            <Select.Positioner>
              <Select.Content>
                {periodCollection.items.map((period) => (
                  <Select.Item key={period.periodId} item={period}>
                    {period.name ||
                      `${moment(period.startDate).format("MMM DD")} - ${moment(period.endDate).format("MMM DD")}`}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Positioner>
          </Select.Root>
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
                bg: viewMode === "week" ? "#3d6f7d" : "#F8FAFC",
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
                bg: viewMode === "twoWeeks" ? "#3d6f7d" : "#F8FAFC",
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
            
          >
            <Download/>
            Export to CSV
          </Button>
        </HStack>
      </Flex>
    </Box>
  );
}

export default RosterHeader;
