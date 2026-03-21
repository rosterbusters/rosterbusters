import { useState, useCallback, useMemo, useEffect } from "react";
import gaWard4 from "@/mockData/ga_ward4.json";
import milpWard4Run1 from "@/mockData/milp_ward4_run1.json";
import milpWard4Run2 from "@/mockData/milp_ward4_run2.json";
import milpWard5Run1 from "@/mockData/milp_ward5_run1.json";
import milpWard5Run2 from "@/mockData/milp_ward5_run2.json";
import milpWard6Run1 from "@/mockData/milp_ward6_run1.json";
import milpWard6Run2 from "@/mockData/milp_ward6_run2.json";
import milpWard7Run1 from "@/mockData/milp_ward7_run1.json";
import milpWard7Run2 from "@/mockData/milp_ward7_run2.json";
import milpWard8Run1 from "@/mockData/milp_ward8_run1.json";
import milpWard8Run2 from "@/mockData/milp_ward8_run2.json";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Flex,
  Box,
  Button,
  Text,
  HStack,
  VStack,
  Dialog,
  Portal,
  CloseButton,
} from "@chakra-ui/react";
import { ClipboardCheck, Download, Eye, Home } from "lucide-react";
import moment from "moment";

import {
  RosterGrid,
  ShiftSummaryTable,
  EditHistoryDialog,
  useWards,
  useRosterPeriods,
  useRosterPeriodWindow,
  useWardStatistics,
  useBulkUpsertRoster,
  usePublishRoster,
  useRosterExport,
  useGenerateAlgorithmRoster,
  useShiftCodes,
  useRosterChangelog,
  useCreateChangelog,
  useAutoReviewShiftRequests,
  getShiftDurationHours,
  type Ward,
  type RosterPeriod,
  type ViewMode,
  type ShiftCode,
  type ShiftAssignment,
  type RosterRow,
  type EditHistoryEntry,
  type DailyStaffingGuideline,
  type ShiftRequestOverlay,
} from "@/components/NurseManager/RosterTable";
import {
  RosterPlanningHeader,
  getWardGuidelines,
} from "@/components/NurseManager/RosterPlanning";

import { showErrorToast, showSuccessToast } from "@/components/ui/toast";
import useAuth from "@/hooks/useAuth";

export const Route = createFileRoute("/nurse-manager/roster-planning")({
  component: RosterPlanningPage,
});

// Generate empty roster data for manual editing mode (before algorithm generation)
function generateEmptyRosterData(): RosterRow[] {
  const mockNurses = [
    {
      id: 1,
      name: "Mary Susan",
      designation: "Senior Nursing Aide II",
      hours: { worked: 0, contracted: 44 },
    },
    {
      id: 2,
      name: "Tonnie Marti",
      designation: "Senior Nursing Aide II",
      hours: { worked: 0, contracted: 44 },
    },
    {
      id: 3,
      name: "Mary Susan",
      designation: "Senior Nursing Aide II",
      hours: { worked: 0, contracted: 44 },
    },
    {
      id: 4,
      name: "Mary Susan",
      designation: "Senior Staff Nurse I",
      hours: { worked: 0, contracted: 44 },
    },
    {
      id: 5,
      name: "Mary Susan",
      designation: "Senior Staff Nurse I",
      hours: { worked: 0, contracted: 44 },
    },
    {
      id: 6,
      name: "Mary Susan",
      designation: "Senior Staff Nurse I",
      hours: { worked: 0, contracted: 44 },
    },
    {
      id: 7,
      name: "Mary Susan",
      designation: "Senior Staff Nurse II",
      hours: { worked: 0, contracted: 44 },
    },
  ];

  // Return roster rows with empty shifts (null values) - users can manually assign shifts
  return mockNurses.map((nurse) => ({
    nurseId: nurse.id,
    name: nurse.name,
    designation: nurse.designation,
    staffingRole: nurse.designation.includes("Staff Nurse") ? "RN" : "NA",
    hours: nurse.hours,
    shifts: {}, // Empty shifts - will show "Select" placeholder
    hasOvertime: false,
    hasWarning: false,
  }));
}

// Generate mock shift request overlays for demonstration (Algorithm and Nurse Manager only)
function generateMockPlanningOverlays(
  startDate: Date,
): Record<string, Record<string, ShiftRequestOverlay>> {
  const d = (n: number) =>
    moment(startDate).add(n, "days").format("YYYY-MM-DD");
  return {
    "1": {
      [d(0)]: {
        status: "Pending",
        category: "Algorithm",
        reason: "Under review by scheduling algorithm",
      },
    },
    "4": {
      [d(3)]: {
        status: "Rejected",
        category: "Nurse Manager",
        reason: "Insufficient overnight coverage",
      },
    },
  };
}

function RosterPlanningPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State management
  const [currentStartDate, setCurrentStartDate] = useState<Date>(
    moment().startOf("isoWeek").toDate(),
  );
  const [viewMode, setViewMode] = useState<ViewMode>("twoWeeks");
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<RosterPeriod | null>(
    null,
  );
  const [isPublishSuccessDialogOpen, setIsPublishSuccessDialogOpen] =
    useState(false);
  const [isGenerationSuccessDialogOpen, setIsGenerationSuccessDialogOpen] =
    useState(false);
  const [isDownloadSuccessDialogOpen, setIsDownloadSuccessDialogOpen] =
    useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [isEditHistoryOpen, setIsEditHistoryOpen] = useState(false);
  const [rosterData, setRosterData] = useState<RosterRow[]>(() =>
    generateEmptyRosterData(),
  );

  // Algorithm generation state
  const [isAlgorithmGenerated, setIsAlgorithmGenerated] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedAlgorithmMethod, setGeneratedAlgorithmMethod] = useState<
    string | null
  >(null);
  const [algorithmType, setAlgorithmType] = useState<"MILP" | "GA" | null>(null);
  const [isSeedingRequests, setIsSeedingRequests] = useState(false);

  // Mock shift request overlays (Algorithm and Nurse Manager categories only)
  const mockPlanningOverlays = useMemo(
    () => generateMockPlanningOverlays(currentStartDate),
    [currentStartDate],
  );

  // Staffing guidelines — initialised from ward data, editable via the summary table
  const [guidelines, setGuidelines] = useState<DailyStaffingGuideline>(() =>
    getWardGuidelines(undefined),
  );
  // Per-date overrides — populated when user edits a specific day only
  const [dateOverrides, setDateOverrides] = useState<
    Record<string, DailyStaffingGuideline>
  >({});

  // Data hooks
  const { data: wards = [] } = useWards();
  const { data: periods = [] } = useRosterPeriods();
  const { data: periodWindow } = useRosterPeriodWindow();
  const { data: wardStatistics } = useWardStatistics(selectedWard?.wardId ?? null);
  const { data: changelogEntries = [] } = useRosterChangelog(
    selectedWard?.wardId ?? null,
    selectedPeriod?.periodId ?? null,
  );
  const { mutate: createChangelog } = useCreateChangelog(
    selectedWard?.wardId ?? null,
    selectedPeriod?.periodId ?? null,
  );
  const { data: shiftDurationMap = new Map() } = useShiftCodes();
  const { exportToXLSX } = useRosterExport();
  const bulkUpsertRoster = useBulkUpsertRoster();
  const publishRoster = usePublishRoster();
  const generateAlgorithmRoster = useGenerateAlgorithmRoster();
  const autoReviewShiftRequests = useAutoReviewShiftRequests();

  // Generate mock wards if API wards are empty
  const displayWards = useMemo(() => {
    const availableWards =
      wards.length > 0
        ? wards
        : [
            { wardId: 4, wardName: "Ward 4", wardType: "General", campus: "Main" },
            { wardId: 5, wardName: "Ward 5", wardType: "General", campus: "Main" },
            { wardId: 6, wardName: "Ward 6", wardType: "ICU", campus: "Main" },
          ];

    if (!user?.managerid) {
      return availableWards;
    }

    const designatedWards = availableWards.filter(
      (ward) => ward.managerId === user.managerid,
    );

    return designatedWards.length > 0 ? designatedWards : availableWards;
  }, [wards, user?.managerid]);

  // Generate mock periods if API periods are empty
  const displayPeriods = useMemo(() => {
    if (periods.length > 0) return periods;
    const today = moment();
    return [
      {
        periodId: 1,
        name: `${today.clone().add(14, 'days').startOf('isoWeek').format('MMM DD')} - ${today.clone().add(14, 'days').startOf('isoWeek').add(13, 'days').format('MMM DD')}`,
        startDate: today.clone().add(14, 'days').startOf('isoWeek').format('YYYY-MM-DD'),
        endDate: today.clone().add(14, 'days').startOf('isoWeek').add(13, 'days').format('YYYY-MM-DD'),
        status: 'Pending' as const,
      },
      {
        periodId: 2,
        name: `${today.clone().add(28, 'days').startOf('isoWeek').format('MMM DD')} - ${today.clone().add(28, 'days').startOf('isoWeek').add(13, 'days').format('MMM DD')}`,
        startDate: today.clone().add(28, 'days').startOf('isoWeek').format('YYYY-MM-DD'),
        endDate: today.clone().add(28, 'days').startOf('isoWeek').add(13, 'days').format('YYYY-MM-DD'),
        status: 'Pending' as const,
      },
      {
        periodId: 3,
        name: `${today.clone().add(42, 'days').startOf('isoWeek').format('MMM DD')} - ${today.clone().add(42, 'days').startOf('isoWeek').add(13, 'days').format('MMM DD')}`,
        startDate: today.clone().add(42, 'days').startOf('isoWeek').format('YYYY-MM-DD'),
        endDate: today.clone().add(42, 'days').startOf('isoWeek').add(13, 'days').format('YYYY-MM-DD'),
        status: 'Pending' as const,
      },
    ];
  }, [periods]);

  const initialPlanningPeriod = useMemo(
    () => periodWindow?.upcomingPeriod ?? periodWindow?.currentPeriod ?? null,
    [periodWindow],
  );
  const visiblePlanningPeriods = useMemo(() => {
    if (displayPeriods.length === 0) {
      return [];
    }

    const ascendingPeriods = [...displayPeriods].sort((left, right) =>
      moment(left.startDate).diff(moment(right.startDate)),
    );

    if (initialPlanningPeriod) {
      const firstVisibleIndex = ascendingPeriods.findIndex(
        (period) => period.periodId === initialPlanningPeriod.periodId,
      );

      if (firstVisibleIndex >= 0) {
        return ascendingPeriods.slice(firstVisibleIndex, firstVisibleIndex + 3);
      }
    }

    const futurePeriods = ascendingPeriods.filter((period) =>
      moment(period.startDate).isAfter(moment().startOf("day")),
    );

    return (futurePeriods.length > 0 ? futurePeriods : ascendingPeriods).slice(0, 3);
  }, [displayPeriods, initialPlanningPeriod]);

  // Set default ward if not set
  useEffect(() => {
    if (displayWards.length === 0) return;

    const selectedWardStillAvailable = selectedWard
      ? displayWards.some((ward) => ward.wardId === selectedWard.wardId)
      : false;

    if (!selectedWardStillAvailable) {
      setSelectedWard(displayWards[0]);
    }
  }, [displayWards, selectedWard]);

  // Reset guidelines and per-date overrides when the selected ward changes
  useEffect(() => {
    setGuidelines(getWardGuidelines(selectedWard?.wardName));
    setDateOverrides({});
  }, [selectedWard?.wardName]);

  // Unmodified ward defaults — used by the dialog's "Reset to ward default" action
  const originalGuidelines = useMemo(
    () => getWardGuidelines(selectedWard?.wardName),
    [selectedWard?.wardName],
  );

  // Set default period if not set
  useEffect(() => {
    if (visiblePlanningPeriods.length > 0 && !selectedPeriod) {
      const defaultPeriod =
        (initialPlanningPeriod
          ? visiblePlanningPeriods.find(
              (period) => period.periodId === initialPlanningPeriod.periodId,
            )
          : null) ??
        visiblePlanningPeriods[0];
      setSelectedPeriod(defaultPeriod);
      setCurrentStartDate(moment(defaultPeriod.startDate).toDate());
    }
  }, [initialPlanningPeriod, selectedPeriod, visiblePlanningPeriods]);

  useEffect(() => {
    if (
      !selectedPeriod ||
      visiblePlanningPeriods.some((period) => period.periodId === selectedPeriod.periodId)
    ) {
      return;
    }

    const fallbackPeriod = visiblePlanningPeriods[0] ?? null;
    setSelectedPeriod(fallbackPeriod);
    if (fallbackPeriod) {
      setCurrentStartDate(moment(fallbackPeriod.startDate).toDate());
    }
  }, [selectedPeriod, visiblePlanningPeriods]);

  // Populate roster rows with real nurses from the selected ward whenever the ward changes
  useEffect(() => {
    if (isAlgorithmGenerated) return;
    const nurses = wardStatistics?.nurses;
    if (nurses && nurses.length > 0) {
      setRosterData(
        nurses.map((nurse) => ({
          nurseId: nurse.nurseId,
          name: nurse.name,
          designation: nurse.designation,
          staffingRole: nurse.staffing_role ?? null,
          hours: { worked: 0, contracted: 44 },
          shifts: {},
          hasOvertime: false,
          hasWarning: false,
        }))
      );
    } else {
      setRosterData([]);
    }
  }, [wardStatistics, isAlgorithmGenerated]);

  // Derive roster data with hours calculated from the visible date window only
  const displayRosterData = useMemo(() => {
    const days = viewMode === "week" ? 7 : 14;
    const visibleDates = Array.from({ length: days }, (_, i) =>
      moment(currentStartDate).add(i, "days").format("YYYY-MM-DD"),
    );

    const periodMultiplier = viewMode === "week" ? 1 : 2;
    return rosterData.map((row) => {
      const workedHours = visibleDates.reduce((sum, dateKey) => {
        const shift = row.shifts[dateKey];
        return (
          sum +
          (shift ? getShiftDurationHours(shift.shiftCode, shiftDurationMap) : 0)
        );
      }, 0);
      const contractedHours = row.hours.contracted * periodMultiplier;

      return {
        ...row,
        hours: {
          ...row.hours,
          worked: workedHours,
          contracted: contractedHours,
        },
        hasOvertime: workedHours > contractedHours,
        hasWarning: workedHours > contractedHours * 1.2,
      };
    });
  }, [rosterData, currentStartDate, viewMode, shiftDurationMap]);

  const editHistory = useMemo<EditHistoryEntry[]>(() => {
    return changelogEntries.map((entry) => ({
      id: entry.changeid,
      modifiedDate: entry.changedat,
      changeType: entry.changetype === "comment" ? "comment" : "shift_change",
      previousShiftCode: entry.oldshiftcode as ShiftCode | undefined,
      newShiftCode: entry.newshiftcode as ShiftCode | undefined,
      comment: entry.reason ?? undefined,
      shiftDate: entry.shiftdate ?? entry.changedat,
      nurseName: entry.nursename,
      modifiedBy: entry.modifiedby,
    }));
  }, [changelogEntries]);

  // Handlers

  // Seed test shift requests handler
  const handleSeedRequests = useCallback(async () => {
    if (!selectedWard) {
      showErrorToast("Please select a ward first");
      return;
    }
    setIsSeedingRequests(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`/api/v1/roster/ward/${selectedWard.wardId}/seed-requests`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Seeding failed");
      }
      showSuccessToast("Test requests seeded successfully");
    } catch (e: any) {
      showErrorToast(e.message ?? "Failed to seed requests");
    } finally {
      setIsSeedingRequests(false);
    }
  }, [selectedWard]);

  // Generate algorithm roster handler
  const handleGenerateAlgorithm = useCallback(async () => {
    if (!selectedWard || !selectedPeriod) {
      showErrorToast("Please select a ward and period first");
      return;
    }
    try {
      setGenerationProgress(0);
      const result = await generateAlgorithmRoster.mutateAsync({
        wardId: selectedWard.wardId, // CamelCase to match hook params
        periodId: selectedPeriod.periodId,
        startDate: currentStartDate, // Pass the actual Date object
        algorithm: algorithmType ?? undefined,
        onProgress: (percent) => {
          setGenerationProgress(percent);
        },
      });

      // The hook now returns exactly what we need
      setRosterData(result.rosterData);
      setIsAlgorithmGenerated(true);
      setGenerationProgress(100);
      setGeneratedAlgorithmMethod(result.algorithm);
      setIsGenerationSuccessDialogOpen(true);
      showSuccessToast("Algorithm roster generated successfully!");
    } catch (error) {
      console.error("Failed:", error);
      setGenerationProgress(0);
      showErrorToast("Failed to generate roster.");
    }
  }, [
    selectedWard,
    selectedPeriod,
    currentStartDate,
    generateAlgorithmRoster,
    setGenerationProgress,
    showSuccessToast,
    showErrorToast,
  ]);

  // Clear roster and return to manual mode — ward nurses repopulate via the wardStatistics effect
  const handleClearRoster = useCallback(() => {
    setIsAlgorithmGenerated(false);
  }, []);

  // Load a mock JSON dataset into the roster grid
  const handleLoadMockData = useCallback(
    (mockKey: string) => {
      const mockMap: Record<string, typeof gaWard4> = {
        ga_ward4: gaWard4,
      
        milp_ward4_run1: milpWard4Run1,
        milp_ward4_run2: milpWard4Run2,
        milp_ward5_run1: milpWard5Run1,
        milp_ward5_run2: milpWard5Run2,
        milp_ward6_run1: milpWard6Run1,
        milp_ward6_run2: milpWard6Run2,
        milp_ward7_run1: milpWard7Run1,
        milp_ward7_run2: milpWard7Run2,
        milp_ward8_run1: milpWard8Run1,
        milp_ward8_run2: milpWard8Run2,
      };
      const mock = mockMap[mockKey];
      if (!mock) return;

      const rows: RosterRow[] = mock.roster.nurses.map((nurse) => {
        const shiftsObject: RosterRow["shifts"] = {};
        nurse.schedule.forEach((shiftCode, index) => {
          const dateKey = moment(currentStartDate)
            .add(index, "days")
            .format("YYYY-MM-DD");
          shiftsObject[dateKey] = {
            rosterId: 0,
            nurseId: nurse.id,
            shiftDate: dateKey,
            shiftCode: shiftCode as ShiftCode,
            status: "Pending",
          };
        });
        const workedHours = nurse.schedule.reduce(
          (sum, shiftCode) =>
            sum + getShiftDurationHours(shiftCode, shiftDurationMap),
          0,
        );
        const contractedHours = 42;
        return {
          nurseId: nurse.id,
          name: nurse.name,
          designation:
            nurse.rank === "A" ? "RN" : nurse.rank === "B" ? "EN" : "HCA",
          staffingRole:
            nurse.rank === "A" ? "RN" : nurse.rank === "B" ? "EN" : "HCA12",
          hours: { worked: workedHours, contracted: contractedHours },
          shifts: shiftsObject,
          hasOvertime: workedHours > contractedHours,
          hasWarning: workedHours > contractedHours * 1.2,
        };
      });

      setRosterData(rows);
      setIsAlgorithmGenerated(true);
      showSuccessToast(
        `Loaded mock data: ${mockKey.replace(/_/g, " ").toUpperCase()}`,
      );
    },
    [currentStartDate, shiftDurationMap, showSuccessToast],
  );
  const handleDateChange = useCallback((date: Date) => {
    setCurrentStartDate(date);

    const matchingPeriod =
      visiblePlanningPeriods.find((period) =>
        moment(date).isBetween(moment(period.startDate), moment(period.endDate), "day", "[]"),
      ) ?? null;

    setSelectedPeriod(matchingPeriod);
  }, [visiblePlanningPeriods]);

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
      setRosterData((prevData) =>
        prevData.map((row) => {
          if (row.nurseId !== nurseId) return row;
          const existingShift = row.shifts[date];
          const rosterId = existingShift?.rosterId || null;
          // Only log to changelog when editing a previously saved shift
          if (rosterId) {
            createChangelog({
              rosterid: rosterId,
              oldnurseid: nurseId,
              oldshiftcode: existingShift?.shiftCode ?? null,
              newshiftcode: newShiftCode,
              changetype: "shift_change",
              changesource: "Manual",
            });
          }
          return {
            ...row,
            shifts: {
              ...row.shifts,
              [date]: {
                ...(existingShift || {}),
                rosterId: existingShift?.rosterId || 0,
                nurseId,
                shiftDate: date,
                shiftCode: newShiftCode,
                status: "Pending" as const,
              },
            },
          };
        }),
      );
    },
    [createChangelog],
  );

  const handleCommentChange = useCallback(
    (nurseId: number, date: string, comment: string) => {
      setRosterData((prevData) =>
        prevData.map((row) => {
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
        }),
      );
    },
    [],
  );

  const handleDownloadRoster = useCallback(() => {
    exportToXLSX(displayRosterData, currentStartDate, viewMode);
    // Defer to allow any open menu/dialog to fully close before opening the download dialog
    setTimeout(() => setIsDownloadSuccessDialogOpen(true), 0);
  }, [displayRosterData, currentStartDate, viewMode, exportToXLSX]);

  const handleViewEditHistory = useCallback(() => {
    setIsEditHistoryOpen(true);
  }, []);

  const handlePublishClick = useCallback(() => {
    setIsPublishDialogOpen(true);
  }, []);

  const handleConfirmPublish = useCallback(async () => {
    if (!selectedWard || !selectedPeriod) {
      showErrorToast("Please select a ward and period first");
      return;
    }

    const entriesToSave = rosterData.flatMap((row) =>
      Object.values(row.shifts)
        .filter((shift): shift is ShiftAssignment => shift != null)
        .map((shift) => ({
          nurseId: row.nurseId,
          shiftDate: shift.shiftDate,
          shiftCode: shift.shiftCode,
          comment: shift.comment,
        })),
    );

    if (entriesToSave.length === 0) {
      showErrorToast("Add at least one shift before publishing the roster");
      return;
    }

    try {
      await bulkUpsertRoster.mutateAsync({
        wardId: selectedWard.wardId,
        periodId: selectedPeriod.periodId,
        entries: entriesToSave,
      });

      await publishRoster.mutateAsync({
        wardId: selectedWard.wardId,
        periodId: selectedPeriod.periodId,
      });

      // Auto-approve/reject pending shift requests based on the published roster
      await autoReviewShiftRequests.mutateAsync({
        wardId: selectedWard.wardId,
        periodId: selectedPeriod.periodId,
        rosterData,
      });

      setIsPublishDialogOpen(false);
      setIsPublishSuccessDialogOpen(true);
    } catch (error) {
      console.error("Failed to publish roster:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to publish roster. Please try again.";
      showErrorToast(message);
    }
  }, [
    selectedWard,
    selectedPeriod,
    rosterData,
    bulkUpsertRoster,
    publishRoster,
    autoReviewShiftRequests,
    showErrorToast,
  ]);

  return (
    <Flex
      h="100vh"
      w="100vw"
      direction="column"
      overflowY="auto"
      bgColor="background2"
      p={5}
    >
      {/* Header Section */}
      <Box
        bgColor="white"
        p={4}
        rounded="lg"
        width="100%"
        position="relative"
        zIndex={2}
      >
        <RosterPlanningHeader
          currentStartDate={currentStartDate}
          viewMode={viewMode}
          selectedWard={selectedWard}
          selectedPeriod={selectedPeriod}
          wards={displayWards}
          periods={visiblePlanningPeriods}
          isAlgorithmGenerated={isAlgorithmGenerated}
          isGenerating={generateAlgorithmRoster.isPending}
          isPublishing={
            bulkUpsertRoster.isPending || publishRoster.isPending
          }
          generationProgress={generationProgress}
          onDateChange={handleDateChange}
          onViewModeChange={handleViewModeChange}
          onWardChange={handleWardChange}
          onPeriodChange={handlePeriodChange}
          onPublishRoster={handlePublishClick}
          onDownloadRoster={handleDownloadRoster}
          onViewEditHistory={handleViewEditHistory}
          algorithmType={algorithmType}
          onAlgorithmTypeChange={(t) => setAlgorithmType(t)}
          onGenerateAlgorithm={handleGenerateAlgorithm}
          onClearRoster={handleClearRoster}
          onLoadMockData={handleLoadMockData}
          onSeedRequests={handleSeedRequests}
          isSeedingRequests={isSeedingRequests}
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
        <Box flex={1} overflow="auto" p={4} pb={0}>
          <RosterGrid
            data={displayRosterData}
            viewMode={viewMode}
            currentStartDate={currentStartDate}
            onShiftChange={handleShiftChange}
            showSummary={false}
            isLoading={generateAlgorithmRoster.isPending}
            guidelines={guidelines}
            isRosterGenerated={isAlgorithmGenerated}
            shiftRequestOverlays={mockPlanningOverlays}
          />
        </Box>

        {/* Sticky Summary Table at bottom */}
        <ShiftSummaryTable
          data={displayRosterData}
          viewMode={viewMode}
          currentStartDate={currentStartDate}
          isRosterGenerated={isAlgorithmGenerated}
          guidelines={guidelines}
          dateOverrides={dateOverrides}
          originalGuidelines={originalGuidelines}
          onGuidelinesChange={setGuidelines}
          onDateOverrideChange={(dateKey, updated) =>
            setDateOverrides((prev) => ({ ...prev, [dateKey]: updated }))
          }
        />
      </Box>

      {/* Generation Success Dialog */}
      <Dialog.Root
        placement="center"
        motionPreset="slide-in-bottom"
        open={isGenerationSuccessDialogOpen}
        onOpenChange={(e) => setIsGenerationSuccessDialogOpen(e.open)}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content maxW="380px">
              <Dialog.Body py={8} px={6}>
                <VStack gap={6} align="center">
                  <Box position="relative" w="full">
                    <Text
                      fontSize="xl"
                      fontWeight="bold"
                      color="primary"
                      textAlign="center"
                      w="full"
                    >
                      Roster Generated!
                    </Text>
                    <Dialog.CloseTrigger asChild>
                      <CloseButton
                        size="sm"
                        position="absolute"
                        top="-2.5"
                        right="-2"
                      />
                    </Dialog.CloseTrigger>
                  </Box>
                  <ClipboardCheck size={80} color="#16a34a" strokeWidth={1.5} />
                  <VStack gap={2}>
                    {generatedAlgorithmMethod && (
                      <Text fontSize="sm" color="gray.500" textAlign="center">
                        Generated with {generatedAlgorithmMethod}
                      </Text>
                    )}
                    <Text fontSize="sm" color="gray.500" textAlign="center">
                      The roster is ready for review and publishing.
                    </Text>
                  </VStack>
                  <Button
                    w="full"
                    variant="outline"
                    borderColor="#E6E6E6"
                    color="#4A4A4A"
                    _hover={{ bg: "gray.50" }}
                    onClick={() => setIsGenerationSuccessDialogOpen(false)}
                  >
                    Review Generated Roster
                  </Button>
                </VStack>
              </Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      {/* Publish Success Dialog */}
      <Dialog.Root
        placement="center"
        motionPreset="slide-in-bottom"
        open={isPublishSuccessDialogOpen}
        onOpenChange={(e) => setIsPublishSuccessDialogOpen(e.open)}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content maxW="380px">
              <Dialog.Body py={8} px={6}>
                <VStack gap={6} align="center">
                  <Box position="relative" w="full">
                    <Text
                      fontSize="xl"
                      fontWeight="bold"
                      color="primary"
                      textAlign="center"
                      w="full"
                    >
                      Roster Published!
                    </Text>
                    <Dialog.CloseTrigger asChild>
                      <CloseButton
                        size="sm"
                        position="absolute"
                        top="-2.5"
                        right="-2"
                      />
                    </Dialog.CloseTrigger>
                  </Box>
                  {selectedPeriod && (
                    <Text
                      fontSize="sm"
                      color="gray.500"
                      mt={-4}
                      textAlign="center"
                    >
                      Published for :{" "}
                      {moment(selectedPeriod.startDate).format("ddd D MMM")} –{" "}
                      {moment(selectedPeriod.endDate).format("ddd D MMM")}
                    </Text>
                  )}
                  <ClipboardCheck size={80} color="#16a34a" strokeWidth={1.5} />
                  <VStack gap={3} w="full">
                    <Button
                      w="full"
                      variant="outline"
                      borderColor="#E6E6E6"
                      color="#4A4A4A"
                      _hover={{ bg: "gray.50" }}
                      onClick={() => {
                        setIsPublishSuccessDialogOpen(false);
                        handleDownloadRoster();
                      }}
                    >
                      <HStack gap={2}>
                        <Download className="h-4 w-4" />
                        <Text>Download Roster</Text>
                      </HStack>
                    </Button>
                    <Button
                      w="full"
                      variant="outline"
                      borderColor="#E6E6E6"
                      color="#4A4A4A"
                      _hover={{ bg: "gray.50" }}
                      onClick={() => navigate({ to: "/nurse-manager/home" })}
                    >
                      <HStack gap={2}>
                        <Eye className="h-4 w-4" />
                        <Text>View Published Roster</Text>
                      </HStack>
                    </Button>
                  </VStack>
                </VStack>
              </Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      {/* Publish Dialog */}
      <Dialog.Root
        placement="center"
        motionPreset="slide-in-bottom"
        open={isPublishDialogOpen}
        onOpenChange={(e) => setIsPublishDialogOpen(e.open)}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Publish Roster</Dialog.Title>
              </Dialog.Header>
              <Dialog.CloseTrigger />
              <Dialog.Body>
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
              </Dialog.Body>
              <Dialog.Footer>
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
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      {/* Download Success Dialog */}
      <Dialog.Root
        placement="center"
        motionPreset="slide-in-bottom"
        open={isDownloadSuccessDialogOpen}
        onOpenChange={(e) => setIsDownloadSuccessDialogOpen(e.open)}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content maxW="380px">
              <Dialog.Body py={8} px={6}>
                <VStack gap={6} align="center">
                  <Box position="relative" w="full">
                    <Text
                      fontSize="xl"
                      fontWeight="bold"
                      color="primary"
                      textAlign="center"
                      w="full"
                    >
                      Roster Downloaded!
                    </Text>
                    <Dialog.CloseTrigger asChild>
                      <CloseButton
                        size="sm"
                        position="absolute"
                        top="-2.5"
                        right="-2"
                      />
                    </Dialog.CloseTrigger>
                  </Box>
                  {selectedPeriod && (
                    <Text fontSize="sm" color="gray.500" mt={-4} textAlign="center">
                      Downloaded for:{" "}
                      {moment(selectedPeriod.startDate).format("ddd D MMM")} –{" "}
                      {moment(selectedPeriod.endDate).format("ddd D MMM")}
                    </Text>
                  )}
                  <Download size={80} color="#16a34a" strokeWidth={1.5} />
                  <Button
                    w="full"
                    variant="outline"
                    borderColor="#E6E6E6"
                    color="#4A4A4A"
                    _hover={{ bg: "gray.50" }}
                    onClick={() => navigate({ to: "/nurse-manager/home" })}
                  >
                    <HStack gap={2}>
                      <Home className="h-4 w-4" />
                      <Text>Go to Homepage</Text>
                    </HStack>
                  </Button>
                </VStack>
              </Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <EditHistoryDialog
        isOpen={isEditHistoryOpen}
        onClose={() => setIsEditHistoryOpen(false)}
        entries={editHistory}
      />
    </Flex>
  );
}

export default RosterPlanningPage;
