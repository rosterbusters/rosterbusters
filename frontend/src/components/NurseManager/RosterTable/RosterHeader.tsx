import {
  Box,
  Flex,
  Text,
  Button,
  Badge,
  HStack,
  Select,
  Portal,
  createListCollection,
} from "@chakra-ui/react";
import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Eye, Download } from "lucide-react";
import moment from "moment";
import { Ward } from "@/client";
import type { RosterPeriod, ViewMode } from "./types";

interface RosterHeaderProps {
  currentStartDate: Date;
  viewMode: ViewMode;
  selectedWard: Ward | null;
  selectedPeriod: RosterPeriod | null;
  currentPeriod: RosterPeriod | null;
  upcomingPeriod: RosterPeriod | null;
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
  currentPeriod,
  upcomingPeriod,
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
  const today = moment().startOf("day");
  const dateRangeText = `${moment(currentStartDate).format("MMMM DD")} - ${endDate.format("MMMM DD")}`;
  const currentPeriodId = currentPeriod?.periodId ?? null;
  const upcomingPeriodId = upcomingPeriod?.periodId ?? null;
  const earliestPeriodStartDate = periods.length > 0 ? periods[periods.length - 1]?.startDate ?? null : null;
  const navigationEndDate = upcomingPeriod?.endDate ?? currentPeriod?.endDate ?? null;
  const canGoBack = useMemo(() => {
    if (!earliestPeriodStartDate) {
      return true;
    }
    const days = viewMode === "week" ? 7 : 14;
    const previousStart = moment(currentStartDate).subtract(days, "days").startOf("day");

    return previousStart.isSameOrAfter(moment(earliestPeriodStartDate).startOf("day"));
  }, [currentStartDate, earliestPeriodStartDate, viewMode]);
  const canGoNext = useMemo(() => {
    if (!navigationEndDate) {
      return true;
    }
    const days = viewMode === "week" ? 7 : 14;
    const nextStart = moment(currentStartDate).add(days, "days").startOf("day");
    const latestAllowedStart = moment(navigationEndDate)
      .subtract(days - 1, "days")
      .startOf("day");

    return nextStart.isSameOrBefore(latestAllowedStart);
  }, [currentStartDate, navigationEndDate, viewMode]);

  const getPeriodFlag = (period: RosterPeriod) => {
    if (period.periodId === currentPeriodId) return "Current";
    if (period.periodId === upcomingPeriodId) return "Upcoming";
    return null;
  };

  const renderPeriodLabel = (period: RosterPeriod) => {
    const flag = getPeriodFlag(period);
    return (
      <HStack gap={2} minW={0} flexWrap="nowrap">
        <Text whiteSpace="nowrap">{period.name}</Text>
        {flag ? (
          <Badge variant={(flag === "Current" ? "currentPeriod" : "upcomingPeriod") as any}>
            {flag}
          </Badge>
        ) : null}
      </HStack>
    );
  };

  const wardCollection = createListCollection({
    items: wards,
    itemToString: (ward: Ward) => ward.wardname,
    itemToValue: (ward: Ward) => String(ward.wardid),
  });

  const periodCollection = createListCollection({
    items: periods,
    itemToString: (period: RosterPeriod) => {
      const flag = getPeriodFlag(period);
      return flag ? `${period.name} ${flag}` : period.name;
    },
    itemToValue: (period: RosterPeriod) => String(period.periodId),
  });

  const handleToday = () => {
    const targetDate = currentPeriod?.startDate
      ? moment(currentPeriod.startDate).toDate()
      : moment().startOf("isoWeek").toDate();
    onDateChange(targetDate);
  };

  const handleBack = () => {
    if (!canGoBack) {
      return;
    }
    const days = viewMode === "week" ? 7 : 14;
    const newDate = moment(currentStartDate).subtract(days, "days").toDate();
    onDateChange(newDate);
  };

  const handleNext = () => {
    if (!canGoNext) {
      return;
    }
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
          variant={"outlinegrey" as any}
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
            color="foreground"
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
            <Portal>
              <Select.Positioner zIndex={1500}>
                <Select.Content>
                  {wardCollection.items.map((ward) => (
                    <Select.Item key={ward.wardid} item={ward}>
                      {ward.wardname}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Portal>
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
          <HStack gap={0}>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBack}
              disabled={!canGoBack}
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
              disabled={!canGoNext}
              borderColor="#E6E6E6"
              color="foreground"
              _hover={{ bg: "#F8FAFC" }}
              p={2}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </HStack>
        </HStack>

        {/* Center Section: Roster Period Dropdown */}
        <HStack gap={2} position="absolute" left="50%" top="50%" transform="translate(-50%, -50%)">
          <Text fontSize="sm" color="foreground" fontWeight="medium">
            Roster Period:
          </Text>
          <Select.Root
            collection={periodCollection}
            size="sm"
            width="270px"
            color="foreground"
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
                {selectedPeriod ? (
                  renderPeriodLabel(selectedPeriod)
                ) : (
                  <Select.ValueText placeholder="Select period" />
                )}
              </Select.Trigger>
              <Select.IndicatorGroup>
                <Select.Indicator />
              </Select.IndicatorGroup>
            </Select.Control>
            <Portal>
              <Select.Positioner zIndex={1500}>
                <Select.Content>
                  {periodCollection.items.map((period) => (
                    <Select.Item key={period.periodId} item={period}>
                      {renderPeriodLabel(period)}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Portal>
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
              variant={"outlinegrey" as any}
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
              variant={"outlinegrey" as any}
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
          >
            <Download />
            Export to Excel
          </Button>
        </HStack>
      </Flex>
    </Box>
  );
}

export default RosterHeader;
