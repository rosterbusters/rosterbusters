import { useState, useCallback, useMemo, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Flex, Box, Button, Text, HStack } from "@chakra-ui/react";
import moment from "moment";

import {
  RosterGrid,
  ShiftSummaryTable,
  useWards,
  useRosterPeriods,
  usePublishRoster,
  useRosterExport,
  useGenerateAlgorithmRoster,
  type Ward,
  type RosterPeriod,
  type ViewMode,
  type ShiftCode,
  type RosterRow,
} from "@/components/NurseManager/RosterTable";
import { RosterPlanningHeader } from "@/components/NurseManager/RosterPlanning";
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogCloseTrigger,
} from "@/components/ui/dialog";
import useCustomToast from "@/hooks/useCustomToast";

export const Route = createFileRoute("/nurse-manager/roster-planning")({
  component: RosterPlanningPage,
});

// Generate empty roster data for manual editing mode (before algorithm generation)
function generateEmptyRosterData(): RosterRow[] {
  const mockNurses = [
    { id: 1, name: "Mary Susan", designation: "Senior Nursing Aide II", hours: { worked: 0, contracted: 42 } },
    { id: 2, name: "Tonnie Marti", designation: "Senior Nursing Aide II", hours: { worked: 0, contracted: 42 } },
    { id: 3, name: "Mary Susan", designation: "Senior Nursing Aide II", hours: { worked: 0, contracted: 42 } },
    { id: 4, name: "Mary Susan", designation: "Senior Staff Nurse I", hours: { worked: 0, contracted: 42 } },
    { id: 5, name: "Mary Susan", designation: "Senior Staff Nurse I", hours: { worked: 0, contracted: 42 } },
    { id: 6, name: "Mary Susan", designation: "Senior Staff Nurse I", hours: { worked: 0, contracted: 42 } },
    { id: 7, name: "Mary Susan", designation: "Senior Staff Nurse II", hours: { worked: 0, contracted: 42 } },
  ];

  // Return roster rows with empty shifts (null values) - users can manually assign shifts
  return mockNurses.map((nurse) => ({
    nurseId: nurse.id,
    name: nurse.name,
    designation: nurse.designation,
    hours: nurse.hours,
    shifts: {}, // Empty shifts - will show "Select" placeholder
    hasOvertime: false,
    hasWarning: false,
  }));
}

function RosterPlanningPage() {
  const { showSuccessToast, showErrorToast } = useCustomToast();
  
  // State management
  const [currentStartDate, setCurrentStartDate] = useState<Date>(
    moment().startOf("isoWeek").toDate()
  );
  const [viewMode, setViewMode] = useState<ViewMode>("twoWeeks");
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<RosterPeriod | null>(null);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [rosterData, setRosterData] = useState<RosterRow[]>(() => generateEmptyRosterData());
  
  // Algorithm generation state
  const [isAlgorithmGenerated, setIsAlgorithmGenerated] = useState(false);

  // Data hooks
  const { data: wards = [] } = useWards();
  const { data: periods = [] } = useRosterPeriods();
  const { exportToCSV } = useRosterExport();
  const publishRoster = usePublishRoster();
  const generateAlgorithmRoster = useGenerateAlgorithmRoster();

  // Generate mock wards if API wards are empty
  const displayWards = useMemo(() => {
    if (wards.length > 0) return wards;
    return [
      { wardId: 4, wardName: "Ward 4", wardType: "General", campus: "Main" },
      { wardId: 5, wardName: "Ward 5", wardType: "General", campus: "Main" },
      { wardId: 6, wardName: "Ward 6", wardType: "ICU", campus: "Main" },
    ];
  }, [wards]);

  // Generate mock periods if API periods are empty
  const displayPeriods = useMemo(() => {
    if (periods.length > 0) return periods;
    const today = moment();
    return [
      {
        periodId: 1,
        name: `${today.clone().subtract(14, 'days').startOf('isoWeek').format('MMM DD')} - ${today.clone().subtract(14, 'days').startOf('isoWeek').add(13, 'days').format('MMM DD')}`,
        startDate: today.clone().subtract(14, 'days').startOf('isoWeek').format('YYYY-MM-DD'),
        endDate: today.clone().subtract(14, 'days').startOf('isoWeek').add(13, 'days').format('YYYY-MM-DD'),
        status: 'Finalized' as const,
      },
      {
        periodId: 2,
        name: `${today.clone().startOf('isoWeek').format('MMM DD')} - ${today.clone().startOf('isoWeek').add(13, 'days').format('MMM DD')}`,
        startDate: today.clone().startOf('isoWeek').format('YYYY-MM-DD'),
        endDate: today.clone().startOf('isoWeek').add(13, 'days').format('YYYY-MM-DD'),
        status: 'RequestOpen' as const,
      },
      {
        periodId: 3,
        name: `${today.clone().add(14, 'days').startOf('isoWeek').format('MMM DD')} - ${today.clone().add(14, 'days').startOf('isoWeek').add(13, 'days').format('MMM DD')}`,
        startDate: today.clone().add(14, 'days').startOf('isoWeek').format('YYYY-MM-DD'),
        endDate: today.clone().add(14, 'days').startOf('isoWeek').add(13, 'days').format('YYYY-MM-DD'),
        status: 'RequestOpen' as const,
      },
    ];
  }, [periods]);

  // Set default ward if not set
  useEffect(() => {
    if (displayWards.length > 0 && !selectedWard) {
      setSelectedWard(displayWards[0]);
    }
  }, [displayWards, selectedWard]);

  // Set default period if not set
  useEffect(() => {
    if (displayPeriods.length > 0 && !selectedPeriod) {
      setSelectedPeriod(displayPeriods[1]); // Current period
    }
  }, [displayPeriods, selectedPeriod]);

  // Reset to empty data when view mode changes (only if not algorithm generated)
  useEffect(() => {
    if (!isAlgorithmGenerated) {
      setRosterData(generateEmptyRosterData());
    }
  }, [viewMode, isAlgorithmGenerated]);

  // Handlers
  
  // Generate algorithm roster handler
const handleGenerateAlgorithm = useCallback(async () => {
  if (!selectedWard || !selectedPeriod) {
    showErrorToast("Please select a ward and period first");
    return;
  }

  try {
    const result = await generateAlgorithmRoster.mutateAsync({
      wardId: selectedWard.wardId,     // CamelCase to match hook params
      periodId: selectedPeriod.periodId, 
      startDate: currentStartDate,    // Pass the actual Date object
    });

    // The hook now returns exactly what we need
    setRosterData(result.rosterData);
    setIsAlgorithmGenerated(true);
    showSuccessToast("Algorithm roster generated successfully!");
  } catch (error) {
    console.error("Failed:", error);
    showErrorToast("Failed to generate roster.");
  }
}, [selectedWard, selectedPeriod, currentStartDate, generateAlgorithmRoster, showSuccessToast, showErrorToast]);

  // Clear roster and return to manual mode
  const handleClearRoster = useCallback(() => {
    setRosterData(generateEmptyRosterData());
    setIsAlgorithmGenerated(false);
  }, []);
  const handleDateChange = useCallback((date: Date) => {
    setCurrentStartDate(date);
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleWardChange = useCallback((ward: Ward) => {
    setSelectedWard(ward);
  }, []);

  const handlePeriodChange = useCallback((period: RosterPeriod) => {
    setSelectedPeriod(period);
    // Also update the start date to match the period
    setCurrentStartDate(moment(period.startDate).toDate());
  }, []);

  const handleShiftChange = useCallback(
    (nurseId: number, date: string, newShiftCode: ShiftCode) => {
      // Update local roster data (mock mode)
      setRosterData(prevData => 
        prevData.map(row => {
          if (row.nurseId === nurseId) {
            return {
              ...row,
              shifts: {
                ...row.shifts,
                [date]: {
                  ...(row.shifts[date] || {}),
                  rosterId: row.shifts[date]?.rosterId || 0,
                  nurseId,
                  shiftDate: date,
                  shiftCode: newShiftCode,
                  status: "Pending" as const,
                },
              },
            };
          }
          return row;
        })
      );
      console.log(`Shift changed: Nurse ${nurseId}, Date ${date}, New Shift: ${newShiftCode}`);
    },
    []
  );

  const handleDownloadRoster = useCallback(() => {
    exportToCSV(rosterData, currentStartDate, viewMode);
  }, [rosterData, currentStartDate, viewMode, exportToCSV]);

  const handlePublishClick = useCallback(() => {
    setIsPublishDialogOpen(true);
  }, []);

  const handleConfirmPublish = useCallback(async () => {
    if (!selectedWard || !selectedPeriod) {
      showErrorToast("Please select a ward and period first");
      return;
    }

    try {
      await publishRoster.mutateAsync({
        wardId: selectedWard.wardId,
        periodId: selectedPeriod.periodId,
      });
      showSuccessToast("Roster has been published successfully! Staff can now view their schedules on the homepage.");
      setIsPublishDialogOpen(false);
    } catch (error) {
      console.error("Failed to publish roster:", error);
      showErrorToast("Failed to publish roster. Please try again.");
    }
  }, [selectedWard, selectedPeriod, publishRoster, showSuccessToast, showErrorToast]);

  return (
    <Flex
      h="100vh"
      w="100vw"
      direction="column"
      overflowY="auto"
      gap={4}
      bgColor="background2"
      p={5}
    >
      {/* Header Section */}
      <Box bgColor="white" p={4} rounded="lg" width="100%">
        <RosterPlanningHeader
          currentStartDate={currentStartDate}
          viewMode={viewMode}
          selectedWard={selectedWard}
          selectedPeriod={selectedPeriod}
          wards={displayWards}
          periods={displayPeriods}
          isAlgorithmGenerated={isAlgorithmGenerated}
          isGenerating={generateAlgorithmRoster.isPending}
          onDateChange={handleDateChange}
          onViewModeChange={handleViewModeChange}
          onWardChange={handleWardChange}
          onPeriodChange={handlePeriodChange}
          onPublishRoster={handlePublishClick}
          onDownloadRoster={handleDownloadRoster}
          onGenerateAlgorithm={handleGenerateAlgorithm}
          onClearRoster={handleClearRoster}
        />
      </Box>

      {/* Roster Grid Section with Sticky Summary */}
      <Box
        w="full"
        bgColor="white"
        rounded="lg"
        flex={1}
        overflow="hidden"
        display="flex"
        flexDirection="column"
        position="relative"
      >
        {/* Scrollable roster area */}
        <Box
          flex={1}
          overflow="auto"
          p={4}
          pb={0}
        >
          <RosterGrid
            data={rosterData}
            viewMode={viewMode}
            currentStartDate={currentStartDate}
            onShiftChange={handleShiftChange}
            isLoading={generateAlgorithmRoster.isPending}
          />
        </Box>

        {/* Sticky Summary Table at bottom */}
        <ShiftSummaryTable
          data={rosterData}
          viewMode={viewMode}
          currentStartDate={currentStartDate}
        />
      </Box>

      {/* Publish Confirmation Dialog */}
      <DialogRoot 
        open={isPublishDialogOpen} 
        onOpenChange={(e) => setIsPublishDialogOpen(e.open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish Roster</DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger />
          <DialogBody>
            <Text color="gray.600" mb={4}>
              Are you sure you want to publish this roster?
            </Text>
            <Text color="gray.600" mb={2}>
              Once published:
            </Text>
            <Box pl={4} color="gray.600">
              <Text>• All draft shifts will be confirmed</Text>
              <Text>• Staff will be able to see their schedules</Text>
              <Text>• The roster will appear on the homepage</Text>
            </Box>
            {selectedWard && selectedPeriod && (
              <Box mt={4} p={3} bg="gray.50" borderRadius="md">
                <Text fontSize="sm" fontWeight="medium" color="gray.700">
                  Publishing for:
                </Text>
                <Text fontSize="sm" color="gray.600">
                  {selectedWard.wardName} • {selectedPeriod.name}
                </Text>
              </Box>
            )}
          </DialogBody>
          <DialogFooter>
            <HStack gap={3}>
              <Button
                variant="outline"
                onClick={() => setIsPublishDialogOpen(false)}
                borderColor="#E6E6E6"
                color="#4A4A4A"
              >
                Cancel
              </Button>
              <Button
                bg="#4B8798"
                color="white"
                _hover={{ bg: "#3d6f7d" }}
                onClick={handleConfirmPublish}
                loading={publishRoster.isPending}
              >
                Publish Roster
              </Button>
            </HStack>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </Flex>
  );
}

export default RosterPlanningPage;
