import {
  Badge,
  Box,
  Button,
  createListCollection,
  Flex,
  HStack,
  IconButton,
  Portal,
  Select,
  Spinner,
  Text,
} from "@chakra-ui/react"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FlaskConical,
  MoreVertical,
  RefreshCw,
  Upload,
  Wand2,
  X,
} from "lucide-react"
import moment from "moment"
import { useMemo } from "react"
import {
  MenuContent,
  MenuItem,
  MenuItemGroup,
  MenuRadioItem,
  MenuRadioItemGroup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import type { RosterPeriod, ViewMode, Ward } from "../RosterTable/types"
import { AlgorithmGeneratedBadge } from "./AlgorithmGeneratedBadge"

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
]

function formatPeriodLabel(period: RosterPeriod) {
  const start = moment(period.startDate)
  const end = moment(period.endDate)

  if (start.isValid() && end.isValid()) {
    return `${start.format("MMM DD")} - ${end.format("MMM DD YYYY")}`
  }

  return period.name
}

interface RosterPlanningHeaderProps {
  currentStartDate: Date
  viewMode: ViewMode
  selectedWard: Ward | null
  selectedPeriod: RosterPeriod | null
  currentPeriodId?: number | null
  upcomingPeriodId?: number | null
  wards: Ward[]
  periods: RosterPeriod[]
  isAlgorithmGenerated?: boolean
  isGenerating?: boolean
  isPublishing?: boolean
  generationProgress?: number
  algorithmType?: "MILP" | "AB-RATIO" | null
  onAlgorithmTypeChange?: (type: "MILP" | "AB-RATIO" | null) => void
  onDateChange: (date: Date) => void
  onViewModeChange: (mode: ViewMode) => void
  onWardChange: (ward: Ward) => void
  onPeriodChange: (period: RosterPeriod) => void
  onPublishRoster: () => void
  onDownloadRoster: () => void
  onViewEditHistory: () => void
  onGenerateAlgorithm?: () => void
  onGenerateAllWards?: () => void
  onAutoRegenerate?: () => void
  showAutoRegenerate?: boolean
  onClearRoster?: () => void
  onLoadMockData?: (mockKey: string) => void
  onSeedRequests?: () => void
  onSeedAnonymizedRequests?: () => void
  onSeedApr2026PreviewRequests?: () => void
  isSeedingRequests?: boolean
}

export function RosterPlanningHeader({
  currentStartDate,
  viewMode,
  selectedWard,
  selectedPeriod,
  currentPeriodId = null,
  upcomingPeriodId = null,
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
  onGenerateAllWards,
  onAutoRegenerate,
  showAutoRegenerate = false,
  onClearRoster,
  onLoadMockData,
  onSeedRequests,
  onSeedAnonymizedRequests,
  onSeedApr2026PreviewRequests,
  isSeedingRequests = false,
}: RosterPlanningHeaderProps) {
  const normalizedGenerationProgress = Math.min(
    100,
    Math.max(
      0,
      Math.round(Number.isFinite(generationProgress) ? generationProgress : 0),
    ),
  )
  const endDate = moment(currentStartDate).add(
    viewMode === "week" ? 6 : 13,
    "days",
  )
  const sortedPeriods = useMemo(
    () =>
      [...periods].sort((left, right) =>
        moment(left.startDate).diff(moment(right.startDate)),
      ),
    [periods],
  )
  const effectiveSelectedPeriod = useMemo(() => {
    if (selectedPeriod) {
      const matchingVisiblePeriod = sortedPeriods.find(
        (period) => period.periodId === selectedPeriod.periodId,
      )
      if (matchingVisiblePeriod) {
        return matchingVisiblePeriod
      }
    }

    const periodForCurrentDate = sortedPeriods.find((period) =>
      moment(currentStartDate).isBetween(
        moment(period.startDate),
        moment(period.endDate),
        "day",
        "[]",
      ),
    )
    return periodForCurrentDate ?? sortedPeriods[0] ?? null
  }, [currentStartDate, selectedPeriod, sortedPeriods])
  const earliestVisibleStartDate = sortedPeriods[0]?.startDate ?? null
  const latestVisibleEndDate =
    sortedPeriods[sortedPeriods.length - 1]?.endDate ?? null
  const dateRangeText = `${moment(currentStartDate).format("MMMM DD")} - ${endDate.format("MMMM DD")}`

  const getPeriodFlag = (period: RosterPeriod) => {
    if (upcomingPeriodId != null && period.periodId === upcomingPeriodId)
      return "Upcoming"
    if (currentPeriodId != null && period.periodId === currentPeriodId)
      return "Current"
    return null
  }

  const renderPeriodLabel = (period: RosterPeriod) => {
    const flag = getPeriodFlag(period)
    return (
      <HStack gap={2} minW={0} flexWrap="nowrap">
        <Text whiteSpace="nowrap">{formatPeriodLabel(period)}</Text>
        {flag ? <Badge variant={"upcomingPeriod" as any}>{flag}</Badge> : null}
      </HStack>
    )
  }

  const canGoBack = useMemo(() => {
    if (!earliestVisibleStartDate) {
      return true
    }
    const days = viewMode === "week" ? 7 : 14
    const previousStart = moment(currentStartDate)
      .subtract(days, "days")
      .startOf("day")

    return previousStart.isSameOrAfter(
      moment(earliestVisibleStartDate).startOf("day"),
    )
  }, [currentStartDate, earliestVisibleStartDate, viewMode])

  const canGoNext = useMemo(() => {
    if (!latestVisibleEndDate) {
      return true
    }
    const days = viewMode === "week" ? 7 : 14
    const nextStart = moment(currentStartDate).add(days, "days").startOf("day")
    const latestAllowedStart = moment(latestVisibleEndDate)
      .subtract(days - 1, "days")
      .startOf("day")

    return nextStart.isSameOrBefore(latestAllowedStart)
  }, [currentStartDate, latestVisibleEndDate, viewMode])

  const handleBack = () => {
    if (!canGoBack) {
      return
    }
    const days = viewMode === "week" ? 7 : 14
    const newDate = moment(currentStartDate).subtract(days, "days").toDate()
    onDateChange(newDate)
  }

  const handleNext = () => {
    if (!canGoNext) {
      return
    }
    const days = viewMode === "week" ? 7 : 14
    const newDate = moment(currentStartDate).add(days, "days").toDate()
    onDateChange(newDate)
  }

  const wardCollection = createListCollection({
    items: wards,
    itemToString: (ward: Ward) => ward.wardName,
    itemToValue: (ward: Ward) => String(ward.wardId),
  })

  const periodCollection = createListCollection({
    items: sortedPeriods,
    itemToString: (period: RosterPeriod) => {
      const flag = getPeriodFlag(period)
      const label = formatPeriodLabel(period)
      return flag ? `${label} ${flag}` : label
    },
    itemToValue: (period: RosterPeriod) => String(period.periodId),
  })

  const showSeedRequests = !import.meta.env.PROD
  const showMockData = !import.meta.env.PROD

  return (
    <Box w="full" position="relative">
      {/* Top Row: Algorithm Badge (Left) + Ward/Menu (Right) - Absolute positioned */}
      <Flex
        direction={{ base: "column", md: "row" }}
        justify="space-between"
        align={{ base: "stretch", md: "center" }}
        gap={{ base: 2, md: 0 }}
        position={{ base: "static", md: "absolute" }}
        top={{ md: 0 }}
        left={{ md: 0 }}
        right={{ md: 0 }}
        zIndex={1}
      >
        {/* Left Section: Algorithm Generated Badge */}
        <Box alignSelf={{ base: "flex-start", md: "center" }}>
          <AlgorithmGeneratedBadge isGenerated={isAlgorithmGenerated} />
        </Box>

        {/* Right Section: Ward Dropdown + Hamburger Menu */}
        <Flex
          gap={2}
          align="center"
          justify={{ base: "space-between", md: "flex-end" }}
          w={{ base: "full", md: "auto" }}
        >
          <Flex gap={2} align="center" minW={0} flex="1">
            <Text fontSize="sm" color="foreground" fontWeight="medium">
              Ward:
            </Text>
            <Select.Root
              collection={wardCollection}
              size="sm"
              width={{ base: "full", sm: "140px" }}
              color="foreground"
              value={selectedWard ? [String(selectedWard.wardId)] : []}
              onValueChange={(details) => {
                const ward = wards.find(
                  (w) => String(w.wardId) === details.value[0],
                )
                if (ward) onWardChange(ward)
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
          </Flex>

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
              {!isAlgorithmGenerated && (
                <>
                  <MenuItemGroup title="Algorithm">
                    <MenuRadioItemGroup
                      value={algorithmType ?? "AUTO"}
                      onValueChange={(details) => {
                        const nextValue = details.value
                        onAlgorithmTypeChange?.(
                          nextValue === "AUTO"
                            ? null
                            : (nextValue as "MILP" | "AB-RATIO"),
                        )
                      }}
                    >
                      <MenuRadioItem
                        value="AUTO"
                        disabled={isGenerating}
                        cursor={isGenerating ? "not-allowed" : "pointer"}
                      >
                        Auto
                      </MenuRadioItem>
                      <MenuRadioItem
                        value="MILP"
                        disabled={isGenerating}
                        cursor={isGenerating ? "not-allowed" : "pointer"}
                      >
                        MILP
                      </MenuRadioItem>
                      <MenuRadioItem
                        value="AB-RATIO"
                        disabled={isGenerating}
                        cursor={isGenerating ? "not-allowed" : "pointer"}
                      >
                        CP-SAT
                      </MenuRadioItem>
                    </MenuRadioItemGroup>
                  </MenuItemGroup>
                  <MenuSeparator />
                </>
              )}
              <MenuItem
                value="publish"
                onClick={onPublishRoster}
                disabled={isPublishing}
                cursor="pointer"
                _hover={{ bg: "#F0F9FA" }}
              >
                <HStack gap={2}>
                  <Upload className="h-4 w-4" />
                  <Text>
                    {isPublishing ? "Publishing..." : "Publish Roster"}
                  </Text>
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
                    <Text>
                      {isGenerating
                        ? "Regenerating..."
                        : "Regenerate Roster (Auto)"}
                    </Text>
                  </HStack>
                </MenuItem>
              )}
              {onGenerateAllWards && (
                <MenuItem
                  value="generate-all-wards"
                  onClick={onGenerateAllWards}
                  disabled={isGenerating}
                  cursor={isGenerating ? "not-allowed" : "pointer"}
                  _hover={{ bg: "#F0F9FA" }}
                >
                  <HStack gap={2}>
                    <Wand2 className="h-4 w-4" />
                    <Text>Generate All Wards</Text>
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
                    <Text>
                      {isSeedingRequests ? "Seeding..." : "Seed Test Requests"}
                    </Text>
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
                      {isSeedingRequests
                        ? "Seeding..."
                        : "Seed Anonymized Requests"}
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
                      {isSeedingRequests
                        ? "Seeding..."
                        : "Seed Apr 2026 Preview Requests"}
                    </Text>
                  </HStack>
                </MenuItem>
              )}
            </MenuContent>
          </MenuRoot>
        </Flex>
      </Flex>

      {/* Centered Content Stack */}
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap={3}
        pt={{ base: 3, md: 1 }}
      >
        {/* Title */}
        <Text color="primary" fontWeight="semibold" fontSize={"lg"}>
          Staff Roster Schedule
        </Text>

        {/* Date Range Row: Navigation (Left) + Date Range (Center) + View Mode (Right) */}
        <Flex
          direction={{ base: "column", md: "row" }}
          justify="space-between"
          align={{ base: "stretch", md: "center" }}
          w="full"
          gap={3}
          position="relative"
        >
          {/* Left Section: Date Navigation */}
          <Flex
            gap={2}
            direction={{ base: "column", sm: "row" }}
            align={{ base: "stretch", sm: "center" }}
            justify={{ sm: "space-between", md: "flex-start" }}
            w={{ base: "full", md: "auto" }}
          >
            <Button
              size="sm"
              variant={"outlinegrey" as any}
              onClick={onViewEditHistory}
              _hover={{ bg: "#F8FAFC" }}
              w={{ base: "full", sm: "auto" }}
            >
              <Eye className="h-4 w-4" />
              View Edit History
            </Button>
            <HStack gap={0} w={{ base: "full", sm: "auto" }}>
              <Button
                size="sm"
                variant={"outlinegrey" as any}
                onClick={handleBack}
                disabled={!canGoBack}
                _hover={{ bg: "#F8FAFC" }}
                p={2}
                flex={{ base: 1, sm: "initial" }}
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
                flex={{ base: 1, sm: "initial" }}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </HStack>
          </Flex>

          {/* Center Section: Date Range Display */}
          <Text
            fontSize="lg"
            fontWeight="semibold"
            color="brand.fg"
            textAlign="center"
            position={{ base: "static", md: "absolute" }}
            left={{ md: "50%" }}
            top={{ md: "50%" }}
            transform={{ md: "translate(-50%, -50%)" }}
            whiteSpace="nowrap"
            order={{ base: -1, md: 0 }}
          >
            {dateRangeText}
          </Text>

          {/* Right Section: View Mode Toggle */}
          <HStack
            gap={0}
            borderRadius="lg"
            border="1px solid #E6E6E6"
            overflow="hidden"
            w={{ base: "full", md: "auto" }}
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
              flex={{ base: 1, md: "initial" }}
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
              flex={{ base: 1, md: "initial" }}
            >
              2 Weeks
            </Button>
          </HStack>
        </Flex>

        {/* Roster Period Dropdown */}
        <Flex
          gap={2}
          align={{ base: "stretch", sm: "center" }}
          direction={{ base: "column", sm: "row" }}
          minH="32px"
          w={{ base: "full", sm: "auto" }}
        >
          <Text fontSize="sm" color="foreground" fontWeight="medium">
            Roster Period:
          </Text>
          <Select.Root
            collection={periodCollection}
            size="sm"
            width={{ base: "full", sm: "270px" }}
            color="foreground"
            value={
              effectiveSelectedPeriod
                ? [String(effectiveSelectedPeriod.periodId)]
                : []
            }
            onValueChange={(details) => {
              const period = sortedPeriods.find(
                (p) => String(p.periodId) === details.value[0],
              )
              if (period) onPeriodChange(period)
            }}
          >
            <Select.HiddenSelect />
            <Select.Control>
              <Select.Trigger>
                {effectiveSelectedPeriod ? (
                  renderPeriodLabel(effectiveSelectedPeriod)
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
        </Flex>

        {/* Algorithm Generation Buttons */}
        {isGenerating && (
          <Flex direction="column" align="center" gap={2} w="full">
            <Box
              w="250px"
              h="6px"
              bg="gray.200"
              borderRadius="full"
              overflow="hidden"
            >
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
            <Flex
              gap={4}
              direction={{ base: "column", sm: "row" }}
              align="center"
              justify="center"
              w="full"
            >
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
                w={{ base: "full", sm: "auto" }}
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
                <Flex
                  gap={2}
                  align={{ base: "stretch", sm: "center" }}
                  direction={{ base: "column", sm: "row" }}
                  w={{ base: "full", sm: "auto" }}
                >
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
                      if (e.target.value) onLoadMockData(e.target.value)
                      e.target.value = ""
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
                      width: "100%",
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
                </Flex>
              )}
            </Flex>
          </Flex>
        ) : (
          // Regenerate / Clear Buttons (after generation)
          <Flex
            gap={3}
            direction={{ base: "column", sm: "row" }}
            align="center"
            w={{ base: "full", sm: "auto" }}
          >
            <Button
              size="sm"
              variant="outline"
              borderColor="primary"
              color="primary"
              _hover={{ bg: "#F0F9FA" }}
              onClick={onGenerateAlgorithm}
              disabled={isGenerating}
              px={4}
              w={{ base: "full", sm: "auto" }}
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
              w={{ base: "full", sm: "auto" }}
            >
              <HStack gap={2}>
                <X className="h-4 w-4" />
                <Text>Clear Roster</Text>
              </HStack>
            </Button>
          </Flex>
        )}
      </Flex>
    </Box>
  )
}

export default RosterPlanningHeader
