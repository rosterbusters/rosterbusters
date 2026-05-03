import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
  usePeriodConstraints,
  useWardRoster,
  transformRosterData,
  useBulkUpsertRoster,
  usePublishRoster,
  useClearRoster,
  useRosterExport,
  useGenerateAlgorithmRoster,
  useResumeAlgorithmTask,
  useGenerationInputs,
  useShiftCodes,
  useAllShiftCodes,
  useUpdateRoster,
  useUpdateRosterComment,
  useUpdateWardStaffing,
  useUpsertPeriodConstraint,
  useDeletePeriodConstraint,
  useRosterChangelog,
  useCreateChangelog,
  useAutoReviewShiftRequests,
  getShiftDurationHours,
  loadAlgorithmTask,
  clearAlgorithmTask,
  type Ward,
  type RosterPeriod,
  type ViewMode,
  type ShiftCode,
  type ShiftAssignment,
  type RosterRow,
  type NurseInfo,
  type EditHistoryEntry,
  type DailyStaffingGuideline,
} from "@/components/NurseManager/RosterTable";
import {
  RosterPlanningHeader,
  getWardGuidelines,
} from "@/components/NurseManager/RosterPlanning";
import AlgorithmInputsDialog from "@/components/NurseManager/RosterPlanning/AlgorithmInputsDialog";
import {
  buildRequestReview,
  buildShiftRequestOverlays,
} from "@/components/NurseManager/RosterPlanning/requestReview";

import { showErrorToast, showSuccessToast } from "@/components/ui/toast";
import { Checkbox } from "@/components/ui/checkbox";
import { LockdownBanner } from "@/components/Common/LockdownBanner";
import { useRosterPlanningLockStatus } from "@/hooks/useRosterPlanningLockStatus";
import useAuth from "@/hooks/useAuth";

export const Route = createFileRoute("/nurse-manager/roster-planning")({
  component: RosterPlanningPage,
});

const API_BASE = import.meta.env.VITE_API_URL || "";

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

function RosterPlanningPage() {
  const { user, isUserLoading } = useAuth();
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
  const [isAutoRegenerateDialogOpen, setIsAutoRegenerateDialogOpen] = useState(false);
  const [isEditHistoryOpen, setIsEditHistoryOpen] = useState(false);
  const [isInputsDialogOpen, setIsInputsDialogOpen] = useState(false);
  const [isNurseSettingsDialogOpen, setIsNurseSettingsDialogOpen] = useState(false);
  const [selectedNurseForSettings, setSelectedNurseForSettings] = useState<NurseInfo | null>(null);
  const [pendingNoNightValue, setPendingNoNightValue] = useState(false);
  const [lastAlgorithmRunAt, setLastAlgorithmRunAt] = useState<Date | null>(null);
  const [lastAlgorithmRunMs, setLastAlgorithmRunMs] = useState<number | null>(null);
  const [isResumingAlgorithm, setIsResumingAlgorithm] = useState(false);
  const [rosterData, setRosterData] = useState<RosterRow[]>(() =>
    generateEmptyRosterData(),
  );

  // Algorithm generation state
  const [isAlgorithmGenerated, setIsAlgorithmGenerated] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedAlgorithmMethod, setGeneratedAlgorithmMethod] = useState<
    string | null
  >(null);
  const [algorithmType, setAlgorithmType] = useState<"MILP" | "AB-RATIO" | null>(null);
  const [isSeedingRequests, setIsSeedingRequests] = useState(false);

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
    const { data: shiftDurationMap = new Map() } = useShiftCodes();
    const { data: allShiftCodes = [] } = useAllShiftCodes();
    const updateRoster = useUpdateRoster();
    const updateRosterComment = useUpdateRosterComment();
    const updateWardStaffing = useUpdateWardStaffing();
    const { exportToXLSX } = useRosterExport();
  const bulkUpsertRoster = useBulkUpsertRoster();
  const upsertPeriodConstraint = useUpsertPeriodConstraint();
  const deletePeriodConstraint = useDeletePeriodConstraint();
  const publishRoster = usePublishRoster();
  const clearRoster = useClearRoster();
  const generateAlgorithmRoster = useGenerateAlgorithmRoster();
  const resumeAlgorithmTask = useResumeAlgorithmTask();
  const autoReviewShiftRequests = useAutoReviewShiftRequests();
  const hasResumedTaskRef = useRef(false);
  const resumeCancelledRef = useRef(false);
  const isAlgorithmRunning = generateAlgorithmRoster.isPending || isResumingAlgorithm;

  // Generate mock wards if API wards are empty
  const displayWards = useMemo(
    () =>
      wards.length > 0
        ? wards
        : [
            { wardId: 4, wardName: "Ward 4", wardType: "General", campus: "Main" },
            { wardId: 5, wardName: "Ward 5", wardType: "General", campus: "Main" },
            { wardId: 6, wardName: "Ward 6", wardType: "ICU", campus: "Main" },
          ],
    [wards],
  );

  const getDefaultWard = useCallback((availableWards: Ward[]) => {
    if (availableWards.length === 0) return null;
    return [...availableWards].sort((a, b) => a.wardId - b.wardId)[0] ?? null;
  }, []);

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
    () =>
      periodWindow?.upcomingPeriod ??
      periodWindow?.requestOpenPeriod ??
      periodWindow?.currentPeriod ??
      null,
    [periodWindow],
  );
  const periodAnchor = initialPlanningPeriod ?? selectedPeriod;
  const visiblePlanningPeriods = useMemo(() => {
    if (displayPeriods.length === 0) {
      return [];
    }

    const ascendingPeriods = [...displayPeriods].sort((left, right) =>
      moment(left.startDate).diff(moment(right.startDate)),
    );

    if (periodAnchor) {
      const firstVisibleIndex = ascendingPeriods.findIndex(
        (period) => period.periodId === periodAnchor.periodId,
      );

      if (firstVisibleIndex >= 0) {
        return ascendingPeriods.slice(firstVisibleIndex, firstVisibleIndex + 3);
      }
    }

    const futurePeriods = ascendingPeriods.filter((period) =>
      moment(period.startDate).isSameOrAfter(moment().startOf("day"), "day"),
    );

    return (futurePeriods.length > 0 ? futurePeriods : ascendingPeriods).slice(0, 3);
  }, [displayPeriods, periodAnchor]);

  const effectiveSelectedPeriod = useMemo(() => {
    if (selectedPeriod) {
      const matchingVisiblePeriod = visiblePlanningPeriods.find(
        (period) => period.periodId === selectedPeriod.periodId,
      );
      if (matchingVisiblePeriod) {
        return matchingVisiblePeriod;
      }
    }

    const periodForCurrentDate = visiblePlanningPeriods.find((period) =>
      moment(currentStartDate).isBetween(
        moment(period.startDate),
        moment(period.endDate),
        "day",
        "[]",
      ),
    );

    return periodForCurrentDate ?? visiblePlanningPeriods[0] ?? null;
  }, [currentStartDate, selectedPeriod, visiblePlanningPeriods]);

  // Roster planning lock
  const { isLocked, nextWindowStart, nextWindowEnd } = useRosterPlanningLockStatus(
    selectedWard?.wardId ?? null,
    effectiveSelectedPeriod?.periodId ?? null,
  );
  const { data: periodConstraints = [] } = usePeriodConstraints(
    selectedWard?.wardId ?? null,
    effectiveSelectedPeriod?.periodId ?? null,
  );
    const { data: savedRoster, refetch: refetchSavedRoster } = useWardRoster(
      selectedWard?.wardId ?? null,
      effectiveSelectedPeriod?.periodId ?? null,
    );
  const { data: changelogEntries = [] } = useRosterChangelog(
    selectedWard?.wardId ?? null,
    effectiveSelectedPeriod?.periodId ?? null,
  );
  const { mutate: createChangelog } = useCreateChangelog(
    selectedWard?.wardId ?? null,
    effectiveSelectedPeriod?.periodId ?? null,
  );
  const { data: generationInputs } = useGenerationInputs(
    selectedWard?.wardId ?? null,
    effectiveSelectedPeriod?.periodId ?? null,
    !!selectedWard && !!effectiveSelectedPeriod,
  );
  const nurseMetaById = useMemo(() => {
    const entries = wardStatistics?.nurses ?? [];
    return new Map(entries.map((nurse) => [nurse.nurseId, nurse]));
  }, [wardStatistics?.nurses]);
  const algorithmOverlayLabel = useMemo(() => {
    if (!isAlgorithmRunning) return "Loading roster data...";
    const percent = generationProgress ? ` ${generationProgress}%` : "";
    return `Generating algorithm roster...${percent}`;
  }, [generationProgress, isAlgorithmRunning]);
  const requestReview = useMemo(() => {
    if (!generationInputs) return null;
    return buildRequestReview({
      periodStartDate: effectiveSelectedPeriod?.startDate ?? null,
      rosterData,
      hardRequests: generationInputs.hard_requests ?? {},
      softRequests: generationInputs.soft_requests ?? {},
    });
  }, [effectiveSelectedPeriod?.startDate, generationInputs, rosterData]);
  const shiftRequestOverlays = useMemo(
    () => buildShiftRequestOverlays(requestReview),
    [requestReview],
  );
  const noNightConstraintByNurseId = useMemo(() => {
    const constraintMap = new Map<number, (typeof periodConstraints)[number]>();
    for (const constraint of periodConstraints) {
      if (constraint.constrainttype === "NO_NIGHT") {
        constraintMap.set(constraint.nurseid, constraint);
      }
    }
    return constraintMap;
  }, [periodConstraints]);
  const highlightedNoNightNurseIds = useMemo(
    () => new Set(noNightConstraintByNurseId.keys()),
    [noNightConstraintByNurseId],
  );

  const rosterEntries = savedRoster?.roster_entries ?? [];
  const hasAutoGeneratedRoster = useMemo(() => {
    return rosterEntries.some((entry) =>
      (entry.assignment_method ?? "manual").toLowerCase() !== "manual"
    );
  }, [rosterEntries]);
  const isRosterPending = useMemo(() => {
    return rosterEntries.length > 0 && rosterEntries.every((entry) => entry.status === "Pending");
  }, [rosterEntries]);
  const isRosterPublished = useMemo(() => {
    return rosterEntries.length > 0 && rosterEntries.every((entry) => entry.status === "Confirmed");
  }, [rosterEntries]);
  const canAutoRegenerate = hasAutoGeneratedRoster && isRosterPending && !isRosterPublished;

  // Set default ward when there is no valid selection yet.
  useEffect(() => {
    if (displayWards.length === 0 || isUserLoading) return;

    const designatedWard =
      (user?.wardid != null
        ? displayWards.find((ward) => ward.wardId === user.wardid)
        : undefined) ??
      (user?.managerid != null
        ? displayWards.find((ward) => ward.managerId === user.managerid)
        : undefined) ??
      null;
    const selectedWardStillAvailable = selectedWard
      ? displayWards.some((ward) => ward.wardId === selectedWard.wardId)
      : false;

    if (!selectedWardStillAvailable) {
      const fallbackWard = designatedWard ?? getDefaultWard(displayWards);
      if (fallbackWard) {
        setSelectedWard(fallbackWard);
      }
    }
  }, [displayWards, getDefaultWard, isUserLoading, selectedWard, user?.managerid, user?.wardid]);

  // Reset guidelines and per-date overrides when the selected ward changes
  useEffect(() => {
    setGuidelines(getWardGuidelines(selectedWard));
    setDateOverrides({});
  }, [selectedWard]);

  // Unmodified ward defaults — used by the dialog's "Reset to ward default" action
  const originalGuidelines = useMemo(
    () => getWardGuidelines(selectedWard),
    [selectedWard],
  );

  // Reset roster state when switching ward/period so saved rosters load correctly
  useEffect(() => {
    setIsAlgorithmGenerated(false);
    setGeneratedAlgorithmMethod(null);
    setLastAlgorithmRunAt(null);
    setLastAlgorithmRunMs(null);
    setRosterData(generateEmptyRosterData());
  }, [selectedWard?.wardId, effectiveSelectedPeriod?.periodId]);

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

  useEffect(() => {
    if (
      effectiveSelectedPeriod &&
      selectedPeriod?.periodId !== effectiveSelectedPeriod.periodId
    ) {
      setSelectedPeriod(effectiveSelectedPeriod);
    }
  }, [effectiveSelectedPeriod, selectedPeriod?.periodId]);

  useEffect(() => {
    if (!effectiveSelectedPeriod) return;

    const periodStart = moment(effectiveSelectedPeriod.startDate).startOf("day");
    const periodEnd = moment(effectiveSelectedPeriod.endDate).startOf("day");
    const current = moment(currentStartDate).startOf("day");

    if (viewMode === "twoWeeks") {
      if (!current.isSame(periodStart, "day")) {
        setCurrentStartDate(periodStart.toDate());
      }
      return;
    }

    const latestAllowedWeekStart = periodEnd.clone().subtract(6, "days");
    if (current.isBefore(periodStart, "day")) {
      setCurrentStartDate(periodStart.toDate());
      return;
    }
    if (current.isAfter(latestAllowedWeekStart, "day")) {
      setCurrentStartDate(latestAllowedWeekStart.toDate());
    }
  }, [currentStartDate, effectiveSelectedPeriod, viewMode]);

  // Populate roster rows with real nurses from the selected ward whenever the ward changes
  useEffect(() => {
    if (isAlgorithmGenerated) return;
    const nurses = wardStatistics?.nurses;
    // If we have a saved roster from the DB, it will be loaded by the effect below
    if (savedRoster?.roster_entries?.length) return;
    if (nurses && nurses.length > 0) {
      setRosterData(
        nurses.map((nurse) => ({
          nurseId: nurse.nurseId,
          name: nurse.name,
          designation: nurse.designation,
          staffingRole: nurse.staffing_role ?? null,
          rosterRank: nurse.roster_rank ?? null,
          employeeId: nurse.employeeId ?? null,
          joinDate: nurse.joinDate ?? nurse.join_date ?? null,
          hours: { worked: 0, contracted: 44 },
          shifts: {},
          hasOvertime: false,
          hasWarning: false,
        }))
      );
    } else {
      setRosterData([]);
    }
  }, [wardStatistics, isAlgorithmGenerated, savedRoster?.roster_entries?.length]);

  const buildManualRosterRows = useCallback((nurses: NurseInfo[] | undefined): RosterRow[] => {
    const entries = nurses ?? [];
    return entries.map((nurse) => ({
      nurseId: nurse.nurseId,
      name: nurse.name,
      designation: nurse.designation,
      staffingRole: nurse.staffing_role ?? null,
      rosterRank: nurse.roster_rank ?? null,
      employeeId: nurse.employeeId ?? null,
      joinDate: nurse.joinDate ?? nurse.join_date ?? null,
      hours: { worked: 0, contracted: 44 },
      shifts: {},
      hasOvertime: false,
      hasWarning: false,
    }));
  }, []);

  // Load saved DB roster when available (e.g. after page refresh or ward/period switch)
  useEffect(() => {
    if (isAlgorithmGenerated) return;
    const nurses = wardStatistics?.nurses;
    const entries = savedRoster?.roster_entries;
    if (!nurses?.length || !entries?.length) return;
    const rows = transformRosterData(nurses, entries, shiftDurationMap);
    setRosterData(rows);
    setIsAlgorithmGenerated(true);
  }, [savedRoster?.roster_entries, wardStatistics?.nurses, isAlgorithmGenerated, shiftDurationMap]);

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

  const shiftTimeMap = useMemo(() => {
    const map = new Map<string, { start?: string; end?: string }>();
    allShiftCodes.forEach((code) => {
      if (code.defaultstart || code.defaultend) {
        map.set(code.shiftcode, {
          start: code.defaultstart ?? undefined,
          end: code.defaultend ?? undefined,
        });
      }
    });
    return map;
  }, [allShiftCodes]);

  const hasAssignedRosterData = useMemo(
    () =>
      rosterData.some((row) => Object.keys(row.shifts ?? {}).length > 0),
    [rosterData],
  );
  const showAlgorithmGeneratedState = isAlgorithmGenerated && hasAssignedRosterData;

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

  const handleUndo = useCallback(
    async (entryId: number) => {
      const entry = editHistory.find((e) => e.id === entryId);
      if (!entry || entry.changeType !== "shift_change" || !entry.previousShiftCode) {
        return;
      }
      const targetShiftCode = entry.previousShiftCode as ShiftCode;

      const wardId = selectedWard?.wardId;
      const periodId = effectiveSelectedPeriod?.periodId;
      if (!wardId || !periodId) {
        showErrorToast("Please select a ward and roster period first.");
        return;
      }

      const nurseRow = rosterData.find((row) => row.name === entry.nurseName);
      if (!nurseRow) {
        showErrorToast("Nurse not found in the current roster.");
        return;
      }

      const dateKey = moment(entry.shiftDate).format("YYYY-MM-DD");
      const existingShift = nurseRow.shifts[dateKey];
      const previousShift = existingShift ? { ...existingShift } : null;

      setRosterData((prevData) =>
        prevData.map((row) => {
          if (row.nurseId !== nurseRow.nurseId) return row;
          const nextShift: ShiftAssignment = {
            rosterId: existingShift?.rosterId ?? 0,
            nurseId: nurseRow.nurseId,
            shiftDate: dateKey,
            shiftCode: targetShiftCode,
            status: "Pending" as const,
            startTime: existingShift?.startTime,
            endTime: existingShift?.endTime,
            comment: existingShift?.comment,
          };
          return {
            ...row,
            shifts: {
              ...row.shifts,
              [dateKey]: nextShift,
            },
          };
        }),
      );

      try {
        const result = await updateRoster.mutateAsync({
          wardId,
          nurseId: nurseRow.nurseId,
          periodId,
          shiftDate: dateKey,
          shiftCode: targetShiftCode,
          comment: previousShift?.comment,
        });

        const rosterId =
          (result as { roster_id?: number })?.roster_id ??
          previousShift?.rosterId ??
          0;

        if (rosterId) {
          setRosterData((prevData) =>
            prevData.map((row) => {
              if (row.nurseId !== nurseRow.nurseId) return row;
              const shift = row.shifts[dateKey];
              if (!shift || shift.rosterId === rosterId) return row;
              return {
                ...row,
                shifts: {
                  ...row.shifts,
                  [dateKey]: {
                    ...(shift as ShiftAssignment),
                    rosterId,
                  },
                },
              };
            }),
          );
        }

        createChangelog({
          rosterid: rosterId || null,
          oldnurseid: nurseRow.nurseId,
          oldshiftcode: entry.newShiftCode ?? null,
          newshiftcode: targetShiftCode,
          changetype: "shift_change",
          changesource: "Undo",
        });
      } catch {
        showErrorToast("Failed to undo shift. Please try again.");
        setRosterData((prevData) =>
          prevData.map((row) => {
            if (row.nurseId !== nurseRow.nurseId) return row;
            const nextShifts = { ...row.shifts };
            if (previousShift) {
              nextShifts[dateKey] = previousShift;
            } else {
              nextShifts[dateKey] = null;
            }
            return { ...row, shifts: nextShifts };
          }),
        );
        refetchSavedRoster();
      }
    },
    [
      editHistory,
      selectedWard?.wardId,
      effectiveSelectedPeriod?.periodId,
      rosterData,
      updateRoster,
      createChangelog,
      refetchSavedRoster,
    ],
  );

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
      const res = await fetch(`${API_BASE}/api/v1/roster/ward/${selectedWard.wardId}/seed-requests`, {
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

  const handleSeedAnonymizedRequests = useCallback(async () => {
    setIsSeedingRequests(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch("/api/v1/roster/seed-requests-anonymized", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Seeding failed");
      }
      showSuccessToast("Anonymized test requests seeded successfully");
    } catch (e: any) {
      showErrorToast(e.message ?? "Failed to seed anonymized requests");
    } finally {
      setIsSeedingRequests(false);
    }
  }, []);

  const handleSeedApr2026PreviewRequests = useCallback(async () => {
    setIsSeedingRequests(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch("/api/v1/roster/seed-requests-anonymized-apr-2026", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Seeding failed");
      }
      showSuccessToast("Apr 2026 preview requests seeded successfully");
    } catch (e: any) {
      showErrorToast(e.message ?? "Failed to seed Apr 2026 preview requests");
    } finally {
      setIsSeedingRequests(false);
    }
  }, []);

  // Generate algorithm roster handler
  const handleGenerateAlgorithm = useCallback(async () => {
    if (!selectedWard || !effectiveSelectedPeriod) {
      showErrorToast("Please select a ward and period first");
      return;
    }
    const startedAt = Date.now();
    try {
      if (rosterEntries.length > 0 && isRosterPending) {
        await clearRoster.mutateAsync({
          wardId: selectedWard.wardId,
          periodId: effectiveSelectedPeriod.periodId,
        });
      }
      setGenerationProgress(0);
      console.info("[Algorithm Debug] Starting roster generation", {
        wardId: selectedWard.wardId,
        wardName: selectedWard.wardName,
        periodId: effectiveSelectedPeriod.periodId,
        periodName: effectiveSelectedPeriod.name,
        startDate: currentStartDate.toISOString(),
        algorithmType: algorithmType ?? "AUTO",
      });
      const result = await generateAlgorithmRoster.mutateAsync({
        wardId: selectedWard.wardId, // CamelCase to match hook params
        periodId: effectiveSelectedPeriod.periodId,
        startDate: currentStartDate, // Pass the actual Date object
        algorithm: algorithmType ?? undefined,
        onProgress: (percent) => {
          setGenerationProgress(percent);
        },
      });

      // Merge in canonical designations from ward statistics so rank-only
      // algorithm output doesn't lose role detail (e.g. HCA3).
      const mergedRosterData = result.rosterData.map((row) => {
        const meta = nurseMetaById.get(row.nurseId);
        if (!meta) return row;
        return {
          ...row,
          designation: meta.designation ?? row.designation,
          staffingRole: meta.staffing_role ?? row.staffingRole ?? null,
          rosterRank: meta.roster_rank ?? row.rosterRank ?? null,
          employeeId: meta.employeeId ?? row.employeeId ?? null,
          joinDate: meta.joinDate ?? meta.join_date ?? row.joinDate ?? null,
        };
      });

      // The hook now returns exactly what we need
      setRosterData(mergedRosterData);
      setIsAlgorithmGenerated(true);
      setGenerationProgress(100);
      setGeneratedAlgorithmMethod(result.algorithm);
      setIsGenerationSuccessDialogOpen(true);
      setLastAlgorithmRunAt(new Date());
      setLastAlgorithmRunMs(Date.now() - startedAt);
      showSuccessToast("Algorithm roster generated successfully!");
    } catch (error) {
      console.error("Failed:", error);
      setGenerationProgress(0);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to generate roster.";
      showErrorToast(message);
    }
  }, [
    selectedWard,
    effectiveSelectedPeriod,
    currentStartDate,
    rosterEntries.length,
    isRosterPending,
    clearRoster,
    generateAlgorithmRoster,
    nurseMetaById,
    setGenerationProgress,
    showSuccessToast,
    showErrorToast,
  ]);

  // Clear roster and return to manual mode — ward nurses repopulate via the wardStatistics effect
  const handleClearRoster = useCallback(async () => {
    if (!selectedWard || !effectiveSelectedPeriod) {
      showErrorToast("Please select a ward and period first");
      return;
    }
    const resetRows = buildManualRosterRows(wardStatistics?.nurses);
    try {
      await clearRoster.mutateAsync({
        wardId: selectedWard.wardId,
        periodId: effectiveSelectedPeriod.periodId,
      });
      setIsAlgorithmGenerated(false);
      setGeneratedAlgorithmMethod(null);
      setLastAlgorithmRunAt(null);
      setLastAlgorithmRunMs(null);
      setRosterData(resetRows);
      showSuccessToast("Roster cleared successfully");
    } catch (error) {
      console.error("Failed to clear roster:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to clear roster. Please try again.";
      showErrorToast(message);
    }
  }, [
    selectedWard,
    effectiveSelectedPeriod,
    buildManualRosterRows,
    clearRoster,
    wardStatistics?.nurses,
    showErrorToast,
    showSuccessToast,
  ]);

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
      displayPeriods.find((period) =>
        moment(date).isBetween(moment(period.startDate), moment(period.endDate), "day", "[]"),
      ) ?? effectiveSelectedPeriod;

    setSelectedPeriod(matchingPeriod);
  }, [displayPeriods, effectiveSelectedPeriod]);

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
    async (nurseId: number, date: string, newShiftCode: ShiftCode) => {
      const wardId = selectedWard?.wardId;
      const periodId = effectiveSelectedPeriod?.periodId;
      if (!wardId || !periodId) {
        showErrorToast("Please select a ward and roster period first.");
        return;
      }

      const rowSnapshot = rosterData.find((row) => row.nurseId === nurseId);
      const previousShift: ShiftAssignment | null = rowSnapshot?.shifts[date]
        ? { ...rowSnapshot.shifts[date] }
        : null;

      setRosterData((prevData) =>
        prevData.map((row) => {
          if (row.nurseId !== nurseId) return row;
          const existingShift = row.shifts[date];
          const nextShift: ShiftAssignment = {
            rosterId: existingShift?.rosterId ?? 0,
            nurseId,
            shiftDate: date,
            shiftCode: newShiftCode,
            status: "Pending" as const,
            startTime: existingShift?.startTime,
            endTime: existingShift?.endTime,
            comment: existingShift?.comment,
          };
          return {
            ...row,
            shifts: {
              ...row.shifts,
              [date]: nextShift,
            },
          };
        }),
      );

      try {
        const result = await updateRoster.mutateAsync({
          wardId,
          nurseId,
          periodId,
          shiftDate: date,
          shiftCode: newShiftCode,
          comment: previousShift?.comment,
        });

        const rosterId =
          (result as { roster_id?: number })?.roster_id ??
          previousShift?.rosterId ??
          0;

        if (rosterId) {
          setRosterData((prevData) =>
            prevData.map((row) => {
              if (row.nurseId !== nurseId) return row;
              const shift = row.shifts[date];
              if (!shift || shift.rosterId === rosterId) return row;
              return {
                ...row,
                shifts: {
                  ...row.shifts,
                  [date]: {
                    ...(shift as ShiftAssignment),
                    rosterId,
                  },
                },
              };
            }),
          );
        }

        createChangelog({
          rosterid: rosterId || null,
          oldnurseid: nurseId,
          oldshiftcode: previousShift?.shiftCode ?? null,
          newshiftcode: newShiftCode,
          changetype: "shift_change",
          changesource: "Manual",
        });
      } catch {
        showErrorToast("Failed to update shift. Please try again.");
        setRosterData((prevData) =>
          prevData.map((row) => {
            if (row.nurseId !== nurseId) return row;
            const nextShifts = { ...row.shifts };
            if (previousShift) {
              nextShifts[date] = previousShift;
            } else {
              nextShifts[date] = null;
            }
            return { ...row, shifts: nextShifts };
          }),
        );
        refetchSavedRoster();
      }
    },
    [
      selectedWard?.wardId,
      effectiveSelectedPeriod?.periodId,
      rosterData,
      updateRoster,
      createChangelog,
      refetchSavedRoster,
    ],
  );

  const handleCommentChange = useCallback(
    async (nurseId: number, date: string, comment: string) => {
      const wardId = selectedWard?.wardId;
      const periodId = effectiveSelectedPeriod?.periodId;
      if (!wardId || !periodId) {
        showErrorToast("Please select a ward and roster period first.");
        return;
      }

      const rowSnapshot = rosterData.find((row) => row.nurseId === nurseId);
      const previousShift: ShiftAssignment | null = rowSnapshot?.shifts[date]
        ? { ...rowSnapshot.shifts[date] }
        : null;

      setRosterData((prevData) =>
        prevData.map((row) => {
          if (row.nurseId !== nurseId) return row;
          const existingShift = row.shifts[date];
          if (!existingShift) return row;
          return {
            ...row,
            shifts: {
              ...row.shifts,
              [date]: {
                ...existingShift,
                comment: comment || undefined,
              },
            },
          };
        }),
      );

      const rosterId = previousShift?.rosterId ?? 0;
      if (!rosterId) {
        showErrorToast("Please save the shift before adding a comment.");
        refetchSavedRoster();
        return;
      }

      try {
        await updateRosterComment.mutateAsync({
          rosterId,
          comment: comment || null,
        });

        if (comment) {
          createChangelog({
            rosterid: rosterId,
            oldnurseid: nurseId,
            changetype: "comment",
            reason: comment,
            changesource: "Manual",
          });
        }
      } catch {
        showErrorToast("Failed to save comment. Please try again.");
        setRosterData((prevData) =>
          prevData.map((row) => {
            if (row.nurseId !== nurseId) return row;
            const nextShifts = { ...row.shifts };
            if (previousShift) {
              nextShifts[date] = previousShift;
            }
            return { ...row, shifts: nextShifts };
          }),
        );
        refetchSavedRoster();
      }
    },
    [
      selectedWard?.wardId,
      effectiveSelectedPeriod?.periodId,
      updateRosterComment,
      createChangelog,
      refetchSavedRoster,
      rosterData,
    ],
  );

  const handleDownloadRoster = useCallback(async () => {
    if (!selectedWard || !effectiveSelectedPeriod) {
      showErrorToast("Please select a ward and period first");
      return;
    }
    try {
      await exportToXLSX(
        displayRosterData,
        currentStartDate,
        viewMode,
        selectedWard.wardId,
        effectiveSelectedPeriod.periodId,
      );
      // Defer to allow any open menu/dialog to fully close before opening the download dialog
      setTimeout(() => setIsDownloadSuccessDialogOpen(true), 0);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to export roster.";
      showErrorToast(message);
    }
  }, [
    displayRosterData,
    currentStartDate,
    viewMode,
    selectedWard,
    effectiveSelectedPeriod,
    exportToXLSX,
    showErrorToast,
  ]);

  const handleViewEditHistory = useCallback(() => {
    setIsEditHistoryOpen(true);
  }, []);

  const handleGuidelinesChange = useCallback(
    (updated: DailyStaffingGuideline) => {
      if (!selectedWard) {
        showErrorToast("Please select a ward before saving staffing requirements.");
        return;
      }

      const previousGuidelines = guidelines;
      setGuidelines(updated);

      updateWardStaffing.mutate(
        { wardId: selectedWard.wardId, guidelines: updated },
        {
          onSuccess: (updatedWard) => {
            setSelectedWard((prev) =>
              prev && prev.wardId === updatedWard.wardId ? updatedWard : prev,
            );
            showSuccessToast("Staffing requirements saved for all future rosters", {
              title: "Staffing saved",
            });
          },
          onError: (error) => {
            setGuidelines(previousGuidelines);
            showErrorToast(
              error instanceof Error
                ? error.message
                : "Failed to save staffing requirements",
              { title: "Save failed" },
            );
          },
        },
      );
    },
    [guidelines, selectedWard, updateWardStaffing],
  );

  const handleDateOverrideChange = useCallback(
    (dateKey: string, updated: DailyStaffingGuideline) => {
      setDateOverrides((prev) => ({ ...prev, [dateKey]: updated }));
    },
    [],
  );

  const handlePublishClick = useCallback(() => {
    setIsPublishDialogOpen(true);
  }, []);

  const handleAutoRegenerateClick = useCallback(() => {
    setIsAutoRegenerateDialogOpen(true);
  }, []);

  const handleViewGenerationInputs = useCallback(() => {
    if (!selectedWard || !effectiveSelectedPeriod) {
      showErrorToast("Please select a ward and period first");
      return;
    }
    setIsInputsDialogOpen(true);
  }, [selectedWard, effectiveSelectedPeriod]);

  const handleConfirmPublish = useCallback(async () => {
    if (!selectedWard || !effectiveSelectedPeriod) {
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
        periodId: effectiveSelectedPeriod.periodId,
        entries: entriesToSave,
      });

      await publishRoster.mutateAsync({
        wardId: selectedWard.wardId,
        periodId: effectiveSelectedPeriod.periodId,
      });

      setIsPublishDialogOpen(false);
      setIsPublishSuccessDialogOpen(true);

      // Continue auto-reviewing requests in the background so publish can
      // return as soon as the roster itself is finalized.
      void autoReviewShiftRequests
        .mutateAsync({
          wardId: selectedWard.wardId,
          periodId: effectiveSelectedPeriod.periodId,
          rosterData,
        })
        .catch((error) => {
          console.error("Failed to auto-review shift requests after publish:", error);
          showErrorToast("Roster published, but some request reviews may still be pending.");
        });
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
    effectiveSelectedPeriod,
    rosterData,
    bulkUpsertRoster,
    publishRoster,
    autoReviewShiftRequests,
    showErrorToast,
  ]);

  const handleConfirmAutoRegenerate = useCallback(async () => {
    if (!selectedWard || !effectiveSelectedPeriod) {
      showErrorToast("Please select a ward and period first");
      return;
    }
    if (!canAutoRegenerate) {
      showErrorToast("Auto regeneration is only available for pending auto-generated rosters.");
      return;
    }
    if (isAlgorithmRunning) {
      return;
    }
    setIsAutoRegenerateDialogOpen(false);
    const startedAt = Date.now();
    try {
      if (rosterEntries.length > 0 && isRosterPending) {
        await clearRoster.mutateAsync({
          wardId: selectedWard.wardId,
          periodId: effectiveSelectedPeriod.periodId,
        });
      }
      setGenerationProgress(0);
      setAlgorithmType(null);
      const result = await generateAlgorithmRoster.mutateAsync({
        wardId: selectedWard.wardId,
        periodId: effectiveSelectedPeriod.periodId,
        startDate: currentStartDate,
        algorithm: undefined,
        onProgress: (percent) => {
          setGenerationProgress(percent);
        },
      });

      setRosterData(result.rosterData);
      setIsAlgorithmGenerated(true);
      setGenerationProgress(100);
      setGeneratedAlgorithmMethod(result.algorithm);
      setIsGenerationSuccessDialogOpen(true);
      setLastAlgorithmRunAt(new Date());
      setLastAlgorithmRunMs(Date.now() - startedAt);
      showSuccessToast("Roster regenerated successfully!");
    } catch (error) {
      console.error("Failed:", error);
      setGenerationProgress(0);
      showErrorToast("Failed to regenerate roster.");
    }
  }, [
    selectedWard,
    effectiveSelectedPeriod,
    currentStartDate,
    rosterEntries.length,
    isRosterPending,
    clearRoster,
    canAutoRegenerate,
    isAlgorithmRunning,
    generateAlgorithmRoster,
    showSuccessToast,
    showErrorToast,
  ]);

  useEffect(() => {
    hasResumedTaskRef.current = false;
    resumeCancelledRef.current = false;
    setIsResumingAlgorithm(false);
  }, [selectedWard?.wardId, effectiveSelectedPeriod?.periodId]);

  useEffect(() => {
    if (!selectedWard || !effectiveSelectedPeriod) return;
    if (hasResumedTaskRef.current) return;
    if (generateAlgorithmRoster.isPending || resumeAlgorithmTask.isPending) return;

    const stored = loadAlgorithmTask(selectedWard.wardId, effectiveSelectedPeriod.periodId);
    if (!stored) return;

    hasResumedTaskRef.current = true;
    resumeCancelledRef.current = false;
    const startedAt = new Date(stored.startedAt);
    setLastAlgorithmRunAt(startedAt);
    setIsResumingAlgorithm(true);

    resumeAlgorithmTask.mutateAsync({
      taskId: stored.taskId,
      wardId: selectedWard.wardId,
      periodId: effectiveSelectedPeriod.periodId,
      startDate: currentStartDate,
      onProgress: (percent) => {
        if (resumeCancelledRef.current) return;
        setGenerationProgress(percent);
      },
    }).then((result) => {
      if (resumeCancelledRef.current) return;
      setRosterData(result.rosterData);
      setIsAlgorithmGenerated(true);
      setGenerationProgress(100);
      setGeneratedAlgorithmMethod(result.algorithm);
      setLastAlgorithmRunMs(Date.now() - startedAt.getTime());
      setIsResumingAlgorithm(false);
      showSuccessToast("Algorithm roster generated successfully!");
    }).catch((error) => {
      if (resumeCancelledRef.current) return;
      console.error("Failed:", error);
      setIsResumingAlgorithm(false);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to generate roster.";
      showErrorToast(message);
    });
  }, [
    selectedWard,
    effectiveSelectedPeriod,
    currentStartDate,
    generateAlgorithmRoster.isPending,
    resumeAlgorithmTask,
    showErrorToast,
    showSuccessToast,
  ]);

  const handleCancelResume = useCallback(() => {
    if (!selectedWard || !effectiveSelectedPeriod) return;
    resumeCancelledRef.current = true;
    setIsResumingAlgorithm(false);
    setGenerationProgress(0);
    setIsAlgorithmGenerated(false);
    setGeneratedAlgorithmMethod(null);
    setLastAlgorithmRunAt(null);
    setLastAlgorithmRunMs(null);
    const nurses = wardStatistics?.nurses ?? [];
    setRosterData(
      nurses.map((nurse) => ({
        nurseId: nurse.nurseId,
        name: nurse.name,
        designation: nurse.designation,
        staffingRole: nurse.staffing_role ?? null,
        rosterRank: nurse.roster_rank ?? null,
        employeeId: nurse.employeeId ?? null,
        joinDate: nurse.joinDate ?? nurse.join_date ?? null,
        hours: { worked: 0, contracted: 44 },
        shifts: {},
        hasOvertime: false,
        hasWarning: false,
      })),
    );
    clearAlgorithmTask(selectedWard.wardId, effectiveSelectedPeriod.periodId);
  }, [selectedWard, effectiveSelectedPeriod, wardStatistics?.nurses]);

  const handleOpenNurseSettings = useCallback(
    (row: RosterRow) => {
      const nurse = wardStatistics?.nurses.find((item) => item.nurseId === row.nurseId) ?? null;
      if (!nurse) {
        showErrorToast("Unable to load nurse settings.");
        return;
      }
      setSelectedNurseForSettings(nurse);
      setPendingNoNightValue(highlightedNoNightNurseIds.has(row.nurseId));
      setIsNurseSettingsDialogOpen(true);
    },
    [highlightedNoNightNurseIds, wardStatistics?.nurses],
  );

  const handleSaveNurseSettings = useCallback(async () => {
    if (!selectedWard || !effectiveSelectedPeriod || !selectedNurseForSettings) {
      showErrorToast("Select a ward, period, and nurse first.");
      return;
    }

    const existingConstraint = noNightConstraintByNurseId.get(selectedNurseForSettings.nurseId);

    try {
      if (pendingNoNightValue && !existingConstraint) {
        await upsertPeriodConstraint.mutateAsync({
          wardId: selectedWard.wardId,
          nurseId: selectedNurseForSettings.nurseId,
          periodId: effectiveSelectedPeriod.periodId,
          constraintType: "NO_NIGHT",
          value: "true",
          reason: "Temporary special duty",
        });
      } else if (!pendingNoNightValue && existingConstraint) {
        await deletePeriodConstraint.mutateAsync({
          constraintId: existingConstraint.constraintid,
        });
      }

      showSuccessToast("Roster-period nurse setting updated.");
      setIsNurseSettingsDialogOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update nurse setting.";
      showErrorToast(message);
    }
  }, [
    deletePeriodConstraint,
    noNightConstraintByNurseId,
    pendingNoNightValue,
    selectedNurseForSettings,
    effectiveSelectedPeriod,
    selectedWard,
    upsertPeriodConstraint,
  ]);

  return (
    <Flex
      h="100vh"
      w="100vw"
      direction="column"
      bgColor="background2"
    >
      {/* Roster planning lock — banner is full-width, outside padded area */}
      {isLocked && (
        <>
          <LockdownBanner
            title="Roster Planning Period Closed."
            nextLabel="Next Roster Planning Period:"
            nextWindowStart={nextWindowStart}
            nextWindowEnd={nextWindowEnd}
          />
          <Box
            position="fixed"
            top="64px"
            left={0}
            right={0}
            bottom={0}
            bg="rgba(0, 0, 0, 0.08)"
            zIndex={40}
            pointerEvents="all"
          />
        </>
      )}

      {/* Padded content area */}
      <Flex direction="column" flex={1} overflowY="auto" p={5}>

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
          selectedPeriod={effectiveSelectedPeriod}
          currentPeriodId={periodWindow?.currentPeriod?.periodId ?? null}
          upcomingPeriodId={periodWindow?.upcomingPeriod?.periodId ?? null}
          wards={displayWards}
          periods={visiblePlanningPeriods}
          isAlgorithmGenerated={showAlgorithmGeneratedState}
          isGenerating={isAlgorithmRunning}
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
          showAutoRegenerate={showAlgorithmGeneratedState && canAutoRegenerate}
          onAutoRegenerate={handleAutoRegenerateClick}
          onClearRoster={handleClearRoster}
          onLoadMockData={handleLoadMockData}
          onSeedRequests={handleSeedRequests}
          onSeedAnonymizedRequests={handleSeedAnonymizedRequests}
          onSeedApr2026PreviewRequests={handleSeedApr2026PreviewRequests}
          isSeedingRequests={isSeedingRequests}
        />
        <Box mt={3} display="flex" justifyContent="flex-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleViewGenerationInputs}
            borderColor="#E6E6E6"
            color="#4A4A4A"
            _hover={{ bg: "gray.50" }}
          >
            View Algorithm Inputs
          </Button>
        </Box>
      </Box>

      {isResumingAlgorithm && (
        <Box
          mt={3}
          bg="yellow.50"
          border="1px solid"
          borderColor="yellow.200"
          rounded="md"
          px={4}
          py={3}
          display="flex"
          justifyContent="space-between"
          alignItems="center"
        >
          <Text fontSize="sm" color="yellow.800">
            Resuming algorithm… {generationProgress ? `${generationProgress}%` : ""}
          </Text>
          <Button
            size="sm"
            variant="outline"
            borderColor="yellow.300"
            color="yellow.800"
            _hover={{ bg: "yellow.100" }}
            onClick={handleCancelResume}
          >
            Cancel
          </Button>
        </Box>
      )}

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
            wardId={selectedWard?.wardId ?? null}
            viewMode={viewMode}
            currentStartDate={currentStartDate}
            onShiftChange={handleShiftChange}
            onCommentChange={handleCommentChange}
            showSummary={false}
            isLoading={isAlgorithmRunning}
            loadingLabel={algorithmOverlayLabel}
            guidelines={guidelines}
            isRosterGenerated={showAlgorithmGeneratedState}
            shiftRequestOverlays={shiftRequestOverlays}
            highlightedNurseIds={highlightedNoNightNurseIds}
            onNurseNameClick={handleOpenNurseSettings}
            shiftDurationMap={shiftDurationMap}
            shiftTimeMap={shiftTimeMap}
            showLongServiceSnIcon={true}
          />
        </Box>

        {/* Sticky Summary Table at bottom */}
        <ShiftSummaryTable
          data={displayRosterData}
          viewMode={viewMode}
          currentStartDate={currentStartDate}
          wardHourType={selectedWard?.wardHourType}
          isRosterGenerated={showAlgorithmGeneratedState}
          guidelines={guidelines}
          dateOverrides={dateOverrides}
          originalGuidelines={originalGuidelines}
          onGuidelinesChange={handleGuidelinesChange}
          onDateOverrideChange={handleDateOverrideChange}
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
                  {effectiveSelectedPeriod && (
                    <Text
                      fontSize="sm"
                      color="gray.500"
                      mt={-4}
                      textAlign="center"
                    >
                      Published for :{" "}
                      {moment(effectiveSelectedPeriod.startDate).format("ddd D MMM")} –{" "}
                      {moment(effectiveSelectedPeriod.endDate).format("ddd D MMM")}
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
                      onClick={() => navigate({ to: "/nurse-manager/home", search: { periodId: effectiveSelectedPeriod?.periodId } })}
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

      {/* Auto Regenerate Dialog */}
      <Dialog.Root
        placement="center"
        motionPreset="slide-in-bottom"
        open={isAutoRegenerateDialogOpen}
        onOpenChange={(e) => setIsAutoRegenerateDialogOpen(e.open)}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Regenerate Auto Roster</Dialog.Title>
              </Dialog.Header>
              <Dialog.CloseTrigger />
              <Dialog.Body>
                <Text color="gray.600" mb={4}>
                  This will overwrite the current pending roster with a newly generated auto roster.
                </Text>
                <Text color="gray.600" mb={2}>
                  Before continuing:
                </Text>
                <Box pl={4} color="gray.600">
                  <Text>• Any manual edits will be replaced</Text>
                  <Text>• The roster will remain in pending status</Text>
                </Box>
                {selectedWard && effectiveSelectedPeriod && (
                  <Box mt={4} p={3} bg="gray.50" borderRadius="md">
                    <Text fontSize="sm" fontWeight="medium" color="gray.700">
                      Regenerating for:
                    </Text>
                    <Text fontSize="sm" color="gray.600">
                      {selectedWard.wardName} • {effectiveSelectedPeriod.name}
                    </Text>
                  </Box>
                )}
              </Dialog.Body>
              <Dialog.Footer>
                <HStack gap={3}>
                  <Button
                    variant="outline"
                    onClick={() => setIsAutoRegenerateDialogOpen(false)}
                    borderColor="#E6E6E6"
                    color="#4A4A4A"
                  >
                    Cancel
                  </Button>
                  <Button
                    bg="#4B8798"
                    color="white"
                    _hover={{ bg: "#3d6f7d" }}
                    onClick={handleConfirmAutoRegenerate}
                    loading={isAlgorithmRunning}
                  >
                    Regenerate Roster
                  </Button>
                </HStack>
              </Dialog.Footer>
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
                {selectedWard && effectiveSelectedPeriod && (
                  <Box mt={4} p={3} bg="gray.50" borderRadius="md">
                    <Text fontSize="sm" fontWeight="medium" color="gray.700">
                      Publishing for:
                    </Text>
                    <Text fontSize="sm" color="gray.600">
                      {selectedWard.wardName} • {effectiveSelectedPeriod.name}
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
                    loading={bulkUpsertRoster.isPending || publishRoster.isPending}
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
                  {effectiveSelectedPeriod && (
                    <Text fontSize="sm" color="gray.500" mt={-4} textAlign="center">
                      Downloaded for:{" "}
                      {moment(effectiveSelectedPeriod.startDate).format("ddd D MMM")} –{" "}
                      {moment(effectiveSelectedPeriod.endDate).format("ddd D MMM")}
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

      </Flex>{/* end padded content area */}
      <AlgorithmInputsDialog
        isOpen={isInputsDialogOpen}
        onClose={() => setIsInputsDialogOpen(false)}
        wardId={selectedWard?.wardId ?? null}
        wardName={selectedWard?.wardName ?? null}
        periodId={effectiveSelectedPeriod?.periodId ?? null}
        periodName={effectiveSelectedPeriod?.name ?? null}
        periodStartDate={effectiveSelectedPeriod?.startDate ?? null}
        algorithmType={algorithmType}
        lastRunAt={lastAlgorithmRunAt}
        lastRunMs={lastAlgorithmRunMs}
        rosterData={rosterData}
      />

      <EditHistoryDialog
        isOpen={isEditHistoryOpen}
        onClose={() => setIsEditHistoryOpen(false)}
        entries={editHistory}
        onUndo={handleUndo}
      />

      <Dialog.Root
        placement="center"
        motionPreset="slide-in-bottom"
        open={isNurseSettingsDialogOpen}
        onOpenChange={(e) => setIsNurseSettingsDialogOpen(e.open)}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content maxW="420px">
              <Dialog.Header>
                <Dialog.Title>Nurse Roster Settings</Dialog.Title>
              </Dialog.Header>
              <Dialog.CloseTrigger />
              <Dialog.Body>
                <VStack align="stretch" gap={4}>
                  <Box>
                    <Text fontSize="sm" fontWeight="semibold" color="gray.800">
                      {selectedNurseForSettings?.name ?? "Selected nurse"}
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      {selectedNurseForSettings?.designation ?? ""}
                    </Text>
                  </Box>

                  <Box p={3} rounded="md" bg="gray.50">
                    <Text fontSize="sm" color="gray.700">
                      Roster period: {effectiveSelectedPeriod?.name ?? "No period selected"}
                    </Text>
                  </Box>

                  <Box>
                    <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={2}>
                      Permanent pattern
                    </Text>
                    <Text fontSize="sm" color="gray.600">
                      {selectedNurseForSettings?.shiftPattern === "AM_ONLY"
                        ? "AM only (4 on / 3 off)"
                        : selectedNurseForSettings?.shiftPattern === "PM_ONLY"
                          ? "PM only (4 on / 3 off)"
                          : "No permanent pattern"}
                    </Text>
                  </Box>

                  <Box>
                    <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={2}>
                      Temporary period setting
                    </Text>
                    <Checkbox
                      checked={pendingNoNightValue}
                      onCheckedChange={(details: { checked: boolean | "indeterminate" }) =>
                        setPendingNoNightValue(Boolean(details.checked))
                      }
                      colorPalette="cyan"
                    >
                      No night shift for this roster period
                    </Checkbox>
                    <Text fontSize="xs" color="gray.500" mt={2}>
                      When enabled, this nurse will be highlighted in the roster and excluded from all night assignments for the selected period.
                    </Text>
                  </Box>
                </VStack>
              </Dialog.Body>
              <Dialog.Footer>
                <HStack gap={3}>
                  <Button
                    variant="outline"
                    onClick={() => setIsNurseSettingsDialogOpen(false)}
                    borderColor="#E6E6E6"
                    color="#4A4A4A"
                  >
                    Cancel
                  </Button>
                  <Button
                    bg="#4B8798"
                    color="white"
                    _hover={{ bg: "#3d6f7d" }}
                    onClick={handleSaveNurseSettings}
                    loading={
                      upsertPeriodConstraint.isPending ||
                      deletePeriodConstraint.isPending
                    }
                  >
                    Save Settings
                  </Button>
                </HStack>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Flex>
  );
}

export default RosterPlanningPage;
