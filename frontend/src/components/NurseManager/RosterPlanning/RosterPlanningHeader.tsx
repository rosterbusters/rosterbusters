import {
  Box,
  Flex,
  Text,
  Button,
  Badge,
  HStack,
  IconButton,
  Spinner,
  Select,
  Portal,
  createListCollection,
} from "@chakra-ui/react";
import { useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  MoreVertical,
  Upload,
  Download,
  Wand2,
  RefreshCw,
  X,
  FlaskConical,
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

const MOCK_DATA_OPTIONS = [
  { value: "", label: "Load mock data" },
  { value: "milp_ward4_run1", label: "MILP Ward 4 Run 1" },
  { value: "milp_ward4_run2", label: "MILP Ward 4 Run 2" },
  { value: "milp_ward5_run1", label: "MILP Ward 5 Run 1" },
  { value: "milp_ward5_run2", label: "MILP Ward 5 Run 2" },
  { value: "milp_ward6_run1", label: "MILP Ward 6 Run 1" },
  { value: "milp_ward6_run2", label: "MILP Ward 6 Run 2" },
  { value: "milp_ward7_run1", label: "MILP Ward 7 Run 1" },
  { value: "milp_ward7_run2", label: "MILP Ward 7 Run 2" },
  { value: "milp_ward8_run1", label: "MILP Ward 8 Run 1" },
  { value: "milp_ward8_run2", label: "MILP Ward 8 Run 2" },
];

interface RosterPlanningHeaderProps {
  currentStartDate: Date;
  viewMode: ViewMode;
  selectedWard: Ward | null;
  selectedPeriod: RosterPeriod | null;
  wards: Ward[];
  periods: RosterPeriod[];
  isAlgorithmGenerated?: boolean;
  isGenerating?: boolean;
  isPublishing?: boolean;
  generationProgress?: number;
  algorithmType?: "MILP" | "AB-RATIO" | null;
  onAlgorithmTypeChange?: (type: "MILP" | "AB-RATIO" | null) => void;
  onDateChange: (date: Date) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onWardChange: (ward: Ward) => void;
  onPeriodChange: (period: RosterPeriod) => void;
  onPublishRoster: () => void;
  onDownloadRoster: () => void;
  onViewEditHistory: () => void;
  onGenerateAlgorithm?: () => void;
  onAutoRegenerate?: () => void;
  showAutoRegenerate?: boolean;
  onClearRoster?: () => void;
  onLoadMockData?: (mockKey: string) => void;
  onSeedRequests?: () => void;
  onSeedAnonymizedRequests?: () => void;
  onSeedApr2026PreviewRequests?: () => void;
  isSeedingRequests?: boolean;
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
  isPublishing = false,
  generationProgress = 0,
  algorithmType = null,
  onAlgorithmTypeChange,
  onDateChange,
  onViewModeChange,
  onWardChange,
  onPeriodChange,
  onPublishRoster,
  onDownloadRoster,
  onViewEditHistory,
  onGenerateAlgorithm,
  onAutoRegenerate,
  showAutoRegenerate = false,
  onClearRoster,
  onLoadMockData,
  onSeedRequests,
  onSeedAnonymizedRequests,
  onSeedApr2026PreviewRequests,
  isSeedingRequests = false,
}: RosterPlanningHeaderProps) {
  // TODO: Hide algorithm controls for prod and staging once feature gating is ready.
  const showAlgorithmControls = true;
  const normalizedGenerationProgress = Math.min(
    100,
    Math.max(0, Math.round(Number.isFinite(generationProgress) ? generationProgress : 0)),
  );
  const endDate = moment(currentStartDate).add(viewMode === "week" ? 6 : 13, "days");
  const sortedPeriods = useMemo(
    () =>
      [...periods].sort((left, right) =>
        moment(left.startDate).diff(moment(right.startDate)),
      ),
    [periods],
  );
  const earliestVisibleStartDate = sortedPeriods[0]?.startDate ?? null;
  const latestVisibleEndDate = sortedPeriods[sortedPeriods.length - 1]?.endDate ?? null;
  const dateRangeText = selectedPeriod
    ? `${moment(selectedPeriod.startDate).format("MMMM DD")} - ${moment(selectedPeriod.endDate).format("MMMM DD")}`
    : `${moment(currentStartDate).format("MMMM DD")} - ${endDate.format("MMMM DD")}`;
  const anchorUpcomingPeriodId = sortedPeriods[0]?.periodId ?? null;

  const getPeriodFlag = (period: RosterPeriod) => {
    if (period.periodId === anchorUpcomingPeriodId) return "Upcoming";
    return null;
  };

  const renderPeriodLabel = (period: RosterPeriod) => {
    const flag = getPeriodFlag(period);
    return (
      <HStack gap={2} minW={0} flexWrap="nowrap">
        <Text whiteSpace="nowrap">{period.name}</Text>
        {flag ? (
          <Badge
            variant={"upcomingPeriod" as any}
          >
            {flag}
          </Badge>
        ) : null}
      </HStack>
    );
  };

  const canGoBack = useMemo(() => {
    if (!earliestVisibleStartDate) {
      return true;
    }
    const days = viewMode === "week" ? 7 : 14;
    const previousStart = moment(currentStartDate).subtract(days, "days").startOf("day");

    return previousStart.isSameOrAfter(moment(earliestVisibleStartDate).startOf("day"));
  }, [currentStartDate, earliestVisibleStartDate, viewMode]);

  const canGoNext = useMemo(() => {
    if (!latestVisibleEndDate) {
      return true;
    }
    const days = viewMode === "week" ? 7 : 14;
    const nextStart = moment(currentStartDate).add(days, "days").startOf("day");
    const latestAllowedStart = moment(latestVisibleEndDate)
      .subtract(days - 1, "days")
      .startOf("day");

    return nextStart.isSameOrBefore(latestAllowedStart);
  }, [currentStartDate, latestVisibleEndDate, viewMode]);

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
  
  
  const wardCollection = createListCollection({
    items: wards,
    itemToString: (ward: Ward) => ward.wardName,
    itemToValue: (ward: Ward) => String(ward.wardId),
  });

  const periodCollection = createListCollection({
    items: periods,
    itemToString: (period: RosterPeriod) => {
      const flag = getPeriodFlag(period);
      return flag ? `${period.name} ${flag}` : period.name;
    },
    itemToValue: (period: RosterPeriod) => String(period.periodId),
  });

  const showSeedRequests = !import.meta.env.PROD;
  const showMockData = !import.meta.env.PROD;
  
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
          

          <HStack gap={2}>
            <Text fontSize="sm" color="foreground" fontWeight="medium">
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
                <Select.Trigger data-testid="roster-ward-trigger">
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
                      <Select.Item
                        key={ward.wardId}
                        item={ward}
                        data-testid={`roster-ward-option-${ward.wardId}`}
                      >
                        {ward.wardName}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>
          </HStack>
          

          {/* Hamburger Menu */}
          <MenuRoot>
            <MenuTrigger asChild>
              <IconButton
                aria-label="More options"
                variant={"outlinegrey" as any}
                size="sm"
                _hover={{ bg: "#F8FAFC" }}
              >
                <MoreVertical className="h-4 w-4" />
              </IconButton>
            </MenuTrigger>
            <MenuContent>
              <MenuItem
                value="publish"
                onClick={onPublishRoster}
                disabled={isPublishing}
                cursor="pointer"
                _hover={{ bg: "#F0F9FA" }}
              >
                <HStack gap={2}>
                  <Upload className="h-4 w-4" />
                  <Text>{isPublishing ? "Publishing..." : "Publish Roster"}</Text>
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
              {showAutoRegenerate && onAutoRegenerate && (
                <MenuItem
                  value="regenerate-auto"
                  onClick={onAutoRegenerate}
                  disabled={isGenerating}
                  cursor="pointer"
                  _hover={{ bg: "#F0F9FA" }}
                >
                  <HStack gap={2}>
                    <RefreshCw className="h-4 w-4" />
                    <Text>{isGenerating ? "Regenerating..." : "Regenerate Roster (Auto)"}</Text>
                  </HStack>
                </MenuItem>
              )}
              {showSeedRequests && onSeedRequests && (
                <MenuItem
                  value="seed-requests"
                  onClick={onSeedRequests}
                  disabled={isSeedingRequests}
                  cursor="pointer"
                  _hover={{ bg: "#F0F9FA" }}
                >
                  <HStack gap={2}>
                    <FlaskConical className="h-4 w-4" />
                    <Text>{isSeedingRequests ? "Seeding..." : "Seed Test Requests"}</Text>
                  </HStack>
                </MenuItem>
              )}
              {showSeedRequests && onSeedAnonymizedRequests && (
                <MenuItem
                  value="seed-requests-anonymized"
                  onClick={onSeedAnonymizedRequests}
                  disabled={isSeedingRequests}
                  cursor="pointer"
                  _hover={{ bg: "#F0F9FA" }}
                >
                  <HStack gap={2}>
                    <FlaskConical className="h-4 w-4" />
                    <Text>
                      {isSeedingRequests ? "Seeding..." : "Seed Anonymized Requests"}
                    </Text>
                  </HStack>
                </MenuItem>
              )}
              {showSeedRequests && onSeedApr2026PreviewRequests && (
                <MenuItem
                  value="seed-requests-apr-2026"
                  onClick={onSeedApr2026PreviewRequests}
                  disabled={isSeedingRequests}
                  cursor="pointer"
                  _hover={{ bg: "#F0F9FA" }}
                >
                  <HStack gap={2}>
                    <FlaskConical className="h-4 w-4" />
                    <Text>
                      {isSeedingRequests ? "Seeding..." : "Seed Apr 2026 Preview Requests"}
                    </Text>
                  </HStack>
                </MenuItem>
              )}
            </MenuContent>
          </MenuRoot>
        </HStack>
      </Flex>

      {/* Centered Content Stack */}
      <Flex direction="column" align="center" justify="center" gap={3} pt={1}>
        {/* Title */}
        <Text color="primary" fontWeight="semibold" fontSize={"lg"}>
          Staff Roster Schedule
        </Text>


        {/* Date Range Row: Navigation (Left) + Date Range (Center) + View Mode (Right) */}
        <Flex
          justify="space-between"
          align="center"
          w="full"
          flexWrap="wrap"
          gap={3}
          position="relative"
        >
          {/* Left Section: Date Navigation */}
          <HStack gap={2}>
            <Button
              size="sm"
              variant={"outlinegrey" as any}
              onClick={onViewEditHistory}
              _hover={{ bg: "#F8FAFC" }}
            >
              <Eye className="h-4 w-4" />
              View Edit History
            </Button>
            <HStack gap={0}>
              <Button
              size="sm"
              variant={"outlinegrey" as any}
              onClick={handleBack}
              disabled={!canGoBack}
              _hover={{ bg: "#F8FAFC" }}
              p={2}
            >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
              size="sm"
              variant={"outlinegrey" as any}
              onClick={handleNext}
              disabled={!canGoNext}
              _hover={{ bg: "#F8FAFC" }}
              p={2}
            >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </HStack>
          </HStack>

          {/* Center Section: Date Range Display */}
          <Text
            fontSize="lg"
            fontWeight="semibold"
            color="brand.fg"
            textAlign="center"
            position="absolute"
            left="50%"
            top="50%"
            transform="translate(-50%, -50%)"
            whiteSpace="nowrap"
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
              variant={"outlinegrey" as any}
              fontWeight="normal"
              onClick={() => onViewModeChange("week")}
              bg={viewMode === "week" ? "menuactive" : "transparent"}
              color={viewMode === "week" ? "primary" : "foreground"}
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
        </Flex>

        {/* Roster Period Dropdown */}
        <HStack gap={2} align="center" minH="32px">
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

        {/* Algorithm Generation Buttons */}
        {showAlgorithmControls && (
          <>
            {isGenerating && (
              <Flex direction="column" align="center" gap={2} w="full">
                <Box w="250px" h="6px" bg="gray.200" borderRadius="full" overflow="hidden">
                  <Box
                    h="full"
                    bg="#4B8798"
                    borderRadius="full"
                    style={{
                      width: `${normalizedGenerationProgress}%`,
                      transition: "width 0.4s ease",
                    }}
                  />
                </Box>
                <Text fontSize="sm" color="#4A4A4A">
                  {normalizedGenerationProgress}% complete
                </Text>
              </Flex>
            )}
            {!isAlgorithmGenerated ? (
              // Generate + Mock Data row
              <Flex direction="column" align="center" gap={2} w="full">
                <HStack gap={4} flexWrap="wrap" justify="center">
                {/* Algorithm type toggle */}
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
                    onClick={() => onAlgorithmTypeChange?.(null)}
                    bg={algorithmType == null ? "#4B8798" : "transparent"}
                    color={algorithmType == null ? "white" : "foreground"}
                    _hover={{ bg: algorithmType == null ? "#4B8798" : "#F8FAFC" }}
                    borderRadius={0}
                    px={4}
                    disabled={isGenerating}
                  >
                    Auto
                  </Button>
                  <Button
                    size="sm"
                    variant={"outlinegrey" as any}
                    fontWeight="normal"
                    onClick={() => onAlgorithmTypeChange?.("MILP")}
                    bg={algorithmType === "MILP" ? "#4B8798" : "transparent"}
                    color={algorithmType === "MILP" ? "white" : "foreground"}
                    _hover={{ bg: algorithmType === "MILP" ? "#4B8798" : "#F8FAFC" }}
                    borderRadius={0}
                    px={4}
                    disabled={isGenerating}
                  >
                    MILP
                  </Button>
                  <Button
                    size="sm"
                    variant={"outlinegrey" as any}
                    fontWeight="normal"
                    onClick={() => onAlgorithmTypeChange?.("AB-RATIO")}
                    bg={algorithmType === "AB-RATIO" ? "#4B8798" : "transparent"}
                    color={algorithmType === "AB-RATIO" ? "white" : "foreground"}
                    _hover={{ bg: algorithmType === "AB-RATIO" ? "#4B8798" : "#F8FAFC" }}
                    borderRadius={0}
                    px={4}
                    disabled={isGenerating}
                  >
                    CP-SAT
                  </Button>
                </HStack>

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
                      <Text>Generating… {normalizedGenerationProgress}%</Text>
                    </HStack>
                  ) : (
                    <HStack gap={2}>
                      <Wand2 className="h-5 w-5" />
                      <Text>Generate Algorithm Roster</Text>
                    </HStack>
                  )}
                </Button>

                {/* Mock Data Selector */}
                {showMockData && onLoadMockData && (
                  <HStack gap={2}>
                    <Text
                      fontSize="sm"
                      color="#6B7280"
                      fontWeight="medium"
                      whiteSpace="nowrap"
                    >
                      Mock data:
                    </Text>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) onLoadMockData(e.target.value);
                        e.target.value = "";
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "1px solid #E6E6E6",
                        fontSize: "14px",
                        color: "#4A4A4A",
                        backgroundColor: "white",
                        cursor: "pointer",
                        minWidth: "160px",
                      }}
                    >
                      {MOCK_DATA_OPTIONS.map((opt) => (
                        <option
                          key={opt.value}
                          value={opt.value}
                          disabled={opt.value === ""}
                        >
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </HStack>
                )}
              </HStack>
              </Flex>
            ) : (
              // Regenerate / Clear Buttons (after generation)
              <HStack gap={3}>
                <Button
                  size="sm"
                  variant="outline"
                  borderColor="primary"
                  color="primary"
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
                  variant={"outlinegrey" as any}
                  _hover={{
                    bg: "#F8FAFC",
                    borderColor: "#DC2626",
                    color: "#DC2626",
                  }}
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
          </>
        )}
      </Flex>
    </Box>
  );
}

export default RosterPlanningHeader;
