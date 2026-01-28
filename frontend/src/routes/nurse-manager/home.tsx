import { useState, useCallback, useMemo, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Flex, Box } from "@chakra-ui/react";
import moment from "moment";

import {
  RosterGrid,
  RosterHeader,
  useWards,
  useRosterPeriods,
  useRosterPageData,
  useUpdateRoster,
  useRosterExport,
  type Ward,
  type RosterPeriod,
  type ViewMode,
  type ShiftCode,
  type RosterRow,
} from "@/components/NurseManager/RosterTable";

export const Route = createFileRoute("/nurse-manager/home")({
  component: NurseManagerHome,
});

// Generate mock data for demonstration when API is not available
function generateMockData(startDate: Date, viewMode: ViewMode): RosterRow[] {
  const mockNurses = [
    { id: 1, name: "Mary Susan", designation: "Senior Nursing Aide II", hours: { worked: 52, contracted: 42 } },
    { id: 2, name: "Tonnie Marti", designation: "Senior Nursing Aide II", hours: { worked: 32, contracted: 42 } },
    { id: 3, name: "Mary Lamb", designation: "Senior Nursing Aide II", hours: { worked: 42, contracted: 42 } },
    { id: 4, name: "Mary Susan", designation: "Senior Staff Nurse I", hours: { worked: 42, contracted: 42 } },
    { id: 5, name: "Tonnie Marti", designation: "Senior Staff Nurse I", hours: { worked: 32, contracted: 42 } },
    { id: 6, name: "Sarah Johnson", designation: "Staff Nurse II", hours: { worked: 40, contracted: 42 } },
    { id: 7, name: "Emily Chen", designation: "Staff Nurse II", hours: { worked: 44, contracted: 42 } },
    { id: 8, name: "David Wong", designation: "Registered Nurse", hours: { worked: 38, contracted: 42 } },
  ];

  const shiftPatterns: ShiftCode[][] = [
    ["D", "A", "DO", "D", "D", "D", "D"],
    ["DO", "DO", "DO", "DO", "DO", "DO", "DO"],
    ["A", "A", "A", "A", "A", "A", "A"],
    ["D", "DO", "DO", "DO", "D", "DO", "D"],
    ["DO", "DO", "DO", "DO", "DO", "DO", "DO"],
    ["D", "PM", "D", "DO", "D", "PM", "D"],
    ["N", "N", "DO", "DO", "N", "N", "DO"],
    ["A", "D", "D", "DO", "A", "D", "DO"],
  ];

  const days = viewMode === "week" ? 7 : 14;

  return mockNurses.map((nurse, nurseIndex) => {
    const shifts: Record<string, { rosterId: number; nurseId: number; shiftDate: string; shiftCode: ShiftCode; status: "Confirmed" }> = {};
    
    for (let i = 0; i < days; i++) {
      const date = moment(startDate).add(i, "days").format("YYYY-MM-DD");
      const shiftCode = shiftPatterns[nurseIndex % shiftPatterns.length][i % 7];
      shifts[date] = {
        rosterId: nurseIndex * 100 + i,
        nurseId: nurse.id,
        shiftDate: date,
        shiftCode,
        status: "Confirmed",
      };
    }

    return {
      nurseId: nurse.id,
      name: nurse.name,
      designation: nurse.designation,
      hours: nurse.hours,
      shifts,
      hasOvertime: nurse.hours.worked > nurse.hours.contracted,
      hasWarning: nurse.hours.worked > nurse.hours.contracted * 1.1,
    };
  });
}

function NurseManagerHome() {
  // State management
  const [currentStartDate, setCurrentStartDate] = useState<Date>(
    moment().startOf("week").toDate()
  );
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<RosterPeriod | null>(null);

  // Data hooks
  const { data: wards = [], isLoading: wardsLoading } = useWards();
  const { data: periods = [] } = useRosterPeriods();
  const { exportToCSV } = useRosterExport();
  const updateRoster = useUpdateRoster();

  // Use real API data when available, otherwise use mock data
  const { rows: apiRows, isLoading: rosterLoading } = useRosterPageData(
    selectedWard?.wardId ?? null,
    selectedPeriod?.periodId ?? null
  );

  // Generate mock data if API data is not available
  const rosterData = useMemo(() => {
    if (apiRows.length > 0) {
      return apiRows;
    }
    // Use mock data for demonstration
    return generateMockData(currentStartDate, viewMode);
  }, [apiRows, currentStartDate, viewMode]);

  // Set default ward when wards are loaded
  useEffect(() => {
    if (wards.length > 0 && !selectedWard) {
      setSelectedWard(wards[0]);
    }
  }, [wards, selectedWard]);

  // Set default period when periods are loaded
  useEffect(() => {
    if (periods.length > 0 && !selectedPeriod) {
      // Select current period (index 2 is the middle one in our mock)
      const currentPeriod = periods.find(p => 
        moment().isBetween(moment(p.startDate), moment(p.endDate), 'day', '[]')
      ) || periods[Math.floor(periods.length / 2)];
      setSelectedPeriod(currentPeriod);
    }
  }, [periods, selectedPeriod]);

  // Handlers
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
      if (selectedWard && selectedPeriod) {
        updateRoster.mutate({
          wardId: selectedWard.wardId,
          nurseId,
          periodId: selectedPeriod.periodId,
          shiftDate: date,
          shiftCode: newShiftCode,
        });
      }
      // For mock data, we could also update local state here
      console.log(`Shift changed: Nurse ${nurseId}, Date ${date}, New Shift: ${newShiftCode}`);
    },
    [selectedWard, selectedPeriod, updateRoster]
  );

  const handleExportCSV = useCallback(() => {
    exportToCSV(rosterData, currentStartDate, viewMode);
  }, [rosterData, currentStartDate, viewMode, exportToCSV]);

  const handleViewEditHistory = useCallback(() => {
    // TODO: Implement edit history modal
    console.log("View Edit History clicked");
  }, []);

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
        name: `${today.clone().subtract(14, 'days').startOf('week').format('MMM DD')} - ${today.clone().subtract(14, 'days').startOf('week').add(13, 'days').format('MMM DD')}`,
        startDate: today.clone().subtract(14, 'days').startOf('week').format('YYYY-MM-DD'),
        endDate: today.clone().subtract(14, 'days').startOf('week').add(13, 'days').format('YYYY-MM-DD'),
        status: 'Finalized' as const,
      },
      {
        periodId: 2,
        name: `${today.clone().startOf('week').format('MMM DD')} - ${today.clone().startOf('week').add(13, 'days').format('MMM DD')}`,
        startDate: today.clone().startOf('week').format('YYYY-MM-DD'),
        endDate: today.clone().startOf('week').add(13, 'days').format('YYYY-MM-DD'),
        status: 'RequestOpen' as const,
      },
      {
        periodId: 3,
        name: `${today.clone().add(14, 'days').startOf('week').format('MMM DD')} - ${today.clone().add(14, 'days').startOf('week').add(13, 'days').format('MMM DD')}`,
        startDate: today.clone().add(14, 'days').startOf('week').format('YYYY-MM-DD'),
        endDate: today.clone().add(14, 'days').startOf('week').add(13, 'days').format('YYYY-MM-DD'),
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
        <RosterHeader
          currentStartDate={currentStartDate}
          viewMode={viewMode}
          selectedWard={selectedWard}
          selectedPeriod={selectedPeriod}
          wards={displayWards}
          periods={displayPeriods}
          onDateChange={handleDateChange}
          onViewModeChange={handleViewModeChange}
          onWardChange={handleWardChange}
          onPeriodChange={handlePeriodChange}
          onExportCSV={handleExportCSV}
          onViewEditHistory={handleViewEditHistory}
        />
      </Box>

      {/* Roster Grid Section */}
      <Box
        w="full"
        bgColor="white"
        rounded="lg"
        p={4}
        flex={1}
        overflow="hidden"
      >
        <RosterGrid
          data={rosterData}
          viewMode={viewMode}
          currentStartDate={currentStartDate}
          onShiftChange={handleShiftChange}
          isLoading={wardsLoading || rosterLoading}
        />
      </Box>
    </Flex>
  );
}

export default NurseManagerHome;
