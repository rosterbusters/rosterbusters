import { useState, useCallback, useMemo, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Flex, Stack, Box } from "@chakra-ui/react";import moment from "moment";

import {
  RosterGrid,
  RosterHeader,
  ShiftSummaryTable,
  EditHistoryDialog,
  useRosterPeriods,
  useRosterPageData,
  useRosterExport,
  useShiftCodes,
  getShiftDurationHours,
  type RosterPeriod,
  type ViewMode,
  type ShiftCode,
  type RosterRow,
  type EditHistoryEntry,
  type ShiftRequestOverlay,
} from "@/components/NurseManager/RosterTable";
import { getWardGuidelines } from "@/components/NurseManager/RosterPlanning";
import StatusBanner from "@/components/NurseManager/HomePage/StatusBanner";
import NotificationBannerContainer from "@/components/Common/NotificationBannerContainer";
import { WardsService } from "@/client";
import { useQuery } from "@tanstack/react-query";
import { Ward } from "@/client/types.gen";

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
    ["D", "P", "D", "DO", "D", "P", "D"],
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

// Generate mock shift request overlays for demonstration
function generateMockOverlays(startDate: Date): Record<string, Record<string, ShiftRequestOverlay>> {
  const d = (n: number) => moment(startDate).add(n, "days").format("YYYY-MM-DD");
  return {
    "1": { [d(0)]: { status: "Approved",  category: "Nurse Manager", reason: "Approved due to urgent coverage need" } },
    "3": { [d(1)]: { status: "Rejected",  category: "Algorithm",     reason: "Violates staffing constraints" } },
    "6": { [d(2)]: { status: "Pending",   category: "Nurse Manager", reason: "Awaiting manager review" } },
    "7": { [d(4)]: { status: "Approved",  category: "Self Changed",  reason: "Nurse swapped shift after publication" } },
  };
}

// Initial mock edit history data for demonstration
const INITIAL_EDIT_HISTORY: EditHistoryEntry[] = [
  {
    id: 1,
    modifiedDate: "2025-10-04T14:56:00",
    changeType: "shift_change",
    previousShiftCode: "A",
    newShiftCode: "P",
    shiftDate: "2025-10-04T14:56:00",
    nurseName: "Mary Susan",
    modifiedBy: "Grace",
  },
  {
    id: 2,
    modifiedDate: "2025-10-04T14:56:00",
    changeType: "shift_change",
    previousShiftCode: "A",
    newShiftCode: "P",
    shiftDate: "2025-10-04T14:56:00",
    nurseName: "Tonnie Marti",
    modifiedBy: "Grace",
  },
  {
    id: 3,
    modifiedDate: "2025-10-04T14:56:00",
    changeType: "comment",
    comment: "hduehud",
    shiftDate: "2025-10-04T14:56:00",
    nurseName: "Mary Lamb",
    modifiedBy: "Tonnie Marti",
  },
  {
    id: 4,
    modifiedDate: "2025-10-03T09:30:00",
    changeType: "shift_change",
    previousShiftCode: "D",
    newShiftCode: "N",
    shiftDate: "2025-10-03T09:30:00",
    nurseName: "Sarah Johnson",
    modifiedBy: "Grace",
  },
  {
    id: 5,
    modifiedDate: "2025-10-03T08:15:00",
    changeType: "shift_change",
    previousShiftCode: "DO",
    newShiftCode: "A",
    shiftDate: "2025-10-03T08:15:00",
    nurseName: "Emily Chen",
    modifiedBy: "Grace",
  },
  {
    id: 6,
    modifiedDate: "2025-10-02T16:45:00",
    changeType: "comment",
    comment: "Nurse requested swap due to family emergency",
    shiftDate: "2025-10-02T16:45:00",
    nurseName: "David Wong",
    modifiedBy: "Grace",
  },
];

function NurseManagerHome() {
  // State management
  const [currentStartDate, setCurrentStartDate] = useState<Date>(
    moment().startOf("isoWeek").toDate()
  );
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<RosterPeriod | null>(null);
  const [isEditHistoryOpen, setIsEditHistoryOpen] = useState(false);
  const [editHistory, setEditHistory] = useState<EditHistoryEntry[]>(INITIAL_EDIT_HISTORY);
  // Mock shift request overlays
  const mockOverlays = useMemo(() => generateMockOverlays(currentStartDate), [currentStartDate]);

  // Data hooks
  const { data: periods = [] } = useRosterPeriods();
  const { data: shiftDurationMap = new Map() } = useShiftCodes();
  const { exportToXLSX } = useRosterExport();

  const { rows: apiRows, isLoading: rosterLoading } = useRosterPageData(
    selectedWard?.wardid ?? null,
    selectedPeriod?.periodId ?? null
  );

  const { data: wards = [], isLoading: wardsLoading } = useQuery<Ward[]>({
    queryKey: ["wards"],
    queryFn: WardsService.getWards,
  });

  // Local state for roster data (allows updates in mock mode)
  const [localRosterData, setLocalRosterData] = useState<RosterRow[]>([]);

  useEffect(() => {
    // TODO: Re-enable API data when backend is ready
    // if (apiRows.length > 0) {
    //   setLocalRosterData(apiRows);
    // } else {
    //   setLocalRosterData(generateMockData(currentStartDate, viewMode));
    // }
    setLocalRosterData(generateMockData(currentStartDate, viewMode));
  }, [apiRows, currentStartDate, viewMode]);

  // Set default period when periods are loaded
  useEffect(() => {
    if (periods.length > 0 && !selectedPeriod) {
      const currentPeriod = periods.find(p =>
        moment().isBetween(moment(p.startDate), moment(p.endDate), 'day', '[]')
      ) || periods[Math.floor(periods.length / 2)];
      setSelectedPeriod(currentPeriod);
    }
  }, [periods, selectedPeriod]);

  // Derive roster data with hours calculated from the visible date window only
  const displayRosterData = useMemo(() => {
    const days = viewMode === "week" ? 7 : 14;
    const visibleDates = Array.from({ length: days }, (_, i) =>
      moment(currentStartDate).add(i, "days").format("YYYY-MM-DD"),
    );

    return localRosterData.map((row) => {
      const workedHours = visibleDates.reduce((sum, dateKey) => {
        const shift = row.shifts[dateKey];
        return sum + (shift ? getShiftDurationHours(shift.shiftCode, shiftDurationMap) : 0);
      }, 0);

      return {
        ...row,
        hours: { ...row.hours, worked: workedHours },
        hasOvertime: workedHours > row.hours.contracted,
        hasWarning: workedHours > row.hours.contracted * 1.2,
      };
    });
  }, [localRosterData, currentStartDate, viewMode, shiftDurationMap]);

  // Handlers
  const handleDateChange = useCallback((date: Date) => {
    setCurrentStartDate(date);
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleWardChange = useCallback((ward: Ward) => {
    setSelectedWard(ward);
    localStorage.setItem("selectedWardId", String(ward.wardid));
  }, []);

  const handlePeriodChange = useCallback((period: RosterPeriod) => {
    setSelectedPeriod(period);
    // Also update the start date to match the period
    setCurrentStartDate(moment(period.startDate).toDate());
  }, []);

  const handleShiftChange = useCallback(
    (nurseId: number, date: string, newShiftCode: ShiftCode) => {
      setLocalRosterData(prevData =>
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
                  status: "Confirmed" as const,
                },
              },
            };
          }
          return row;
        })
      );
    },
    []
  );

  const handleCommentChange = useCallback(
    (nurseId: number, date: string, comment: string) => {
      const nurse = localRosterData.find(r => r.nurseId === nurseId);
      setLocalRosterData(prevData =>
        prevData.map(row => {
          if (row.nurseId === nurseId && row.shifts[date]) {
            return {
              ...row,
              shifts: {
                ...row.shifts,
                [date]: {
                  ...row.shifts[date],
                  comment: comment || undefined,
                },
              },
            };
          }
          return row;
        })
      );
      if (comment) {
        setEditHistory(prev => [
          {
            id: Date.now(),
            modifiedDate: moment().toISOString(),
            changeType: "comment",
            comment,
            shiftDate: date,
            nurseName: nurse?.name || "Unknown",
            modifiedBy: "Current User",
          },
          ...prev,
        ]);
      }
    },
    [localRosterData]
  );
  const handleExportXLSX = useCallback(() => {
    exportToXLSX(displayRosterData, currentStartDate, viewMode);
  }, [displayRosterData, currentStartDate, viewMode, exportToXLSX]);
  
  const handleViewEditHistory = useCallback(() => {
    setIsEditHistoryOpen(true);
  }, []);

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

  // Set default ward if not set, restoring from localStorage if available
  useEffect(() => {
    if (wards.length > 0 && !selectedWard) {
      const savedId = localStorage.getItem("selectedWardId");
      const restored = savedId ? wards.find(w => String(w.wardid) === savedId) : null;
      setSelectedWard(restored ?? wards[0]);
    }
  }, [wards, selectedWard]);

  // Set default period if not set
  useEffect(() => {
    if (displayPeriods.length > 0 && !selectedPeriod) {
      setSelectedPeriod(displayPeriods[1]); // Current period
    }
  }, [displayPeriods, selectedPeriod]);

  return (
    <Flex
      w="full"
      minH="100vh"
      height="fit-content"
      direction="column"
      gap={4}
      bgColor="background2"
      p={5}
    >
      <Stack
        direction={{ base: "column", md: "row" }}
        gap={6}
        w="full"
        height="100%"
      >
        <Stack
          bgColor="white"
          p={12}
          width={{ base: "100%", md: "50%" }}
          rounded="lg"
          alignItems="start"
          justifyContent="center"
        >
          <StatusBanner ward={selectedWard} />
        </Stack>

        <Stack
          justifyContent="center"
          bgColor="white"
          p={4}
          rounded="lg"
          width={{ base: "100%", md: "50%" }}
        >
          <NotificationBannerContainer role="manager" />
        </Stack>
      </Stack>

      {/* Header + Roster Grid + Summary Table */}
      <Box
        bgColor="white"
        rounded="lg"
        width="100%"
        overflow="hidden"
        display="flex"
        flexDirection="column"
      >
        <Box p={4} pb={0}>
          <RosterHeader
            currentStartDate={currentStartDate}
            viewMode={viewMode}
            selectedWard={selectedWard}
            selectedPeriod={selectedPeriod}
            wards={wards}
            periods={displayPeriods}
            onDateChange={handleDateChange}
            onViewModeChange={handleViewModeChange}
            onWardChange={handleWardChange}
            onPeriodChange={handlePeriodChange}
            onExportCSV={handleExportXLSX}
            onViewEditHistory={handleViewEditHistory}
          />
        </Box>

        {/* Scrollable grid */}
        <Box flex={1} overflow="auto" p={4} pb={0}>
          <RosterGrid
            data={displayRosterData}
            viewMode={viewMode}
            currentStartDate={currentStartDate}
            onShiftChange={handleShiftChange}
            onCommentChange={handleCommentChange}
            isLoading={wardsLoading || rosterLoading}
            showSummary={false}
            shiftRequestOverlays={mockOverlays}
          />
        </Box>

        {/* Sticky summary table */}
        <ShiftSummaryTable
          data={displayRosterData}
          viewMode={viewMode}
          currentStartDate={currentStartDate}
          isRosterGenerated={true}
          guidelines={getWardGuidelines(selectedWard?.wardname)}
        />
      </Box>

      <EditHistoryDialog
        isOpen={isEditHistoryOpen}
        onClose={() => setIsEditHistoryOpen(false)}
        entries={editHistory}
      />
    </Flex>
  );
}

export default NurseManagerHome;