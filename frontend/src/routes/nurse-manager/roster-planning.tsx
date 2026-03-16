import { useState, useCallback, useMemo, useEffect } from "react";
import gaWard4 from "@/mockData/ga_ward4.json";
import gaWard5 from "@/mockData/ga_ward5.json";
import gaWard6 from "@/mockData/ga_ward6.json";
import milpWard4 from "@/mockData/milp_ward4.json";
import milpWard5 from "@/mockData/milp_ward5.json";
import milpWard6 from "@/mockData/milp_ward6.json";
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
  useWards,
  useRosterPeriods,
  useWardStatistics,
  usePublishRoster,
  useRosterExport,
  useGenerateAlgorithmRoster,
  useShiftCodes,
  getShiftDurationHours,
  type Ward,
  type RosterPeriod,
  type ViewMode,
  type ShiftCode,
  type RosterRow,
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
  const [isDownloadSuccessDialogOpen, setIsDownloadSuccessDialogOpen] =
    useState(false);
  const navigate = useNavigate();
  const [rosterData, setRosterData] = useState<RosterRow[]>(() =>
    generateEmptyRosterData(),
  );

  // Algorithm generation state
  const [isAlgorithmGenerated, setIsAlgorithmGenerated] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

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
  const { data: wardStatistics } = useWardStatistics(selectedWard?.wardId ?? null);
  const { data: shiftDurationMap = new Map() } = useShiftCodes();
  const { exportToXLSX } = useRosterExport();
  const publishRoster = usePublishRoster();
  const generateAlgorithmRoster = useGenerateAlgorithmRoster();

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
        name: `${today.clone().subtract(14, "days").startOf("isoWeek").format("MMM DD")} - ${today.clone().subtract(14, "days").startOf("isoWeek").add(13, "days").format("MMM DD")}`,
        startDate: today
          .clone()
          .subtract(14, "days")
          .startOf("isoWeek")
          .format("YYYY-MM-DD"),
        endDate: today
          .clone()
          .subtract(14, "days")
          .startOf("isoWeek")
          .add(13, "days")
          .format("YYYY-MM-DD"),
        status: "Finalized" as const,
      },
      {
        periodId: 2,
        name: `${today.clone().startOf("isoWeek").format("MMM DD")} - ${today.clone().startOf("isoWeek").add(13, "days").format("MMM DD")}`,
        startDate: today.clone().startOf("isoWeek").format("YYYY-MM-DD"),
        endDate: today
          .clone()
          .startOf("isoWeek")
          .add(13, "days")
          .format("YYYY-MM-DD"),
        status: "RequestOpen" as const,
      },
      {
        periodId: 3,
        name: `${today.clone().add(14, "days").startOf("isoWeek").format("MMM DD")} - ${today.clone().add(14, "days").startOf("isoWeek").add(13, "days").format("MMM DD")}`,
        startDate: today
          .clone()
          .add(14, "days")
          .startOf("isoWeek")
          .format("YYYY-MM-DD"),
        endDate: today
          .clone()
          .add(14, "days")
          .startOf("isoWeek")
          .add(13, "days")
          .format("YYYY-MM-DD"),
        status: "RequestOpen" as const,
      },
    ];
  }, [periods]);

  // Default to a designated ward, and recover if the current selection is no longer allowed
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
    if (displayPeriods.length > 0 && !selectedPeriod) {
      setSelectedPeriod(displayPeriods[1]); // Current period
    }
  }, [displayPeriods, selectedPeriod]);

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

  // Handlers

  // Generate algorithm roster handler
  const handleGenerateAlgorithm = useCallback(async () => {
    if (!selectedWard || !selectedPeriod) {
      showErrorToast("Please select a ward and period first");
      return;
    }
    const mockData = {
      method: "GA",
      roster: {
        nurses: [
          {
            id: 1,
            name: "Nurse 1",
            rank: "A",
            schedule: [
              "DO",
              "A",
              "A",
              "P",
              "P",
              "N",
              "DO",
              "A",
              "P",
              "A",
              "N",
              "DO",
              "A",
              "DO",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 2,
            name: "Nurse 2",
            rank: "A",
            schedule: [
              "DO",
              "A",
              "P",
              "DO",
              "P",
              "N",
              "N",
              "DO",
              "A",
              "A",
              "P",
              "N",
              "DO",
              "P",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 3,
            name: "Nurse 3",
            rank: "A",
            schedule: [
              "P",
              "DO",
              "P",
              "P",
              "A",
              "DO",
              "P",
              "A",
              "A",
              "DO",
              "N",
              "N",
              "DO",
              "A",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 4,
            name: "Nurse 4",
            rank: "A",
            schedule: [
              "P",
              "P",
              "DO",
              "A",
              "A",
              "N",
              "DO",
              "A",
              "P",
              "N",
              "DO",
              "A",
              "P",
              "DO",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 5,
            name: "Nurse 5",
            rank: "A",
            schedule: [
              "A",
              "P",
              "N",
              "DO",
              "A",
              "A",
              "N",
              "DO",
              "N",
              "DO",
              "A",
              "P",
              "N",
              "DO",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 6,
            name: "Nurse 6",
            rank: "A",
            schedule: [
              "N",
              "DO",
              "A",
              "DO",
              "A",
              "A",
              "P",
              "P",
              "DO",
              "P",
              "N",
              "N",
              "DO",
              "P",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 7,
            name: "Nurse 7",
            rank: "A",
            schedule: [
              "P",
              "N",
              "N",
              "DO",
              "DO",
              "P",
              "A",
              "P",
              "A",
              "DO",
              "P",
              "A",
              "DO",
              "P",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 8,
            name: "Nurse 8",
            rank: "A",
            schedule: [
              "DO",
              "P",
              "N",
              "N",
              "DO",
              "P",
              "A",
              "A",
              "A",
              "A",
              "DO",
              "N",
              "N",
              "DO",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 9,
            name: "Nurse 9",
            rank: "A",
            schedule: [
              "DO",
              "DO",
              "P",
              "A",
              "P",
              "A",
              "N",
              "N",
              "DO",
              "P",
              "A",
              "A",
              "N",
              "DO",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 10,
            name: "Nurse 10",
            rank: "A",
            schedule: [
              "A",
              "P",
              "N",
              "DO",
              "N",
              "N",
              "DO",
              "N",
              "DO",
              "DO",
              "A",
              "P",
              "A",
              "A",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 11,
            name: "Nurse 11",
            rank: "A",
            schedule: [
              "P",
              "DO",
              "A",
              "N",
              "DO",
              "A",
              "N",
              "DO",
              "A",
              "N",
              "N",
              "DO",
              "P",
              "A",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 12,
            name: "Nurse 12",
            rank: "B",
            schedule: [
              "N",
              "DO",
              "P",
              "A",
              "A",
              "DO",
              "A",
              "DO",
              "N",
              "N",
              "DO",
              "A",
              "P",
              "P",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 13,
            name: "Nurse 13",
            rank: "B",
            schedule: [
              "N",
              "N",
              "DO",
              "A",
              "A",
              "DO",
              "A",
              "N",
              "DO",
              "A",
              "N",
              "DO",
              "A",
              "P",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 14,
            name: "Nurse 14",
            rank: "B",
            schedule: [
              "P",
              "A",
              "N",
              "DO",
              "P",
              "N",
              "DO",
              "A",
              "A",
              "N",
              "N",
              "DO",
              "A",
              "DO",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 15,
            name: "Nurse 15",
            rank: "B",
            schedule: [
              "A",
              "A",
              "A",
              "P",
              "DO",
              "DO",
              "N",
              "DO",
              "N",
              "DO",
              "P",
              "P",
              "A",
              "A",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 16,
            name: "Nurse 16",
            rank: "B",
            schedule: [
              "DO",
              "DO",
              "P",
              "A",
              "P",
              "P",
              "N",
              "N",
              "DO",
              "A",
              "P",
              "N",
              "DO",
              "A",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 17,
            name: "Nurse 17",
            rank: "B",
            schedule: [
              "A",
              "A",
              "DO",
              "P",
              "P",
              "DO",
              "N",
              "DO",
              "N",
              "DO",
              "P",
              "P",
              "A",
              "A",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 18,
            name: "Nurse 18",
            rank: "B",
            schedule: [
              "A",
              "N",
              "DO",
              "P",
              "DO",
              "P",
              "A",
              "P",
              "A",
              "P",
              "N",
              "DO",
              "DO",
              "A",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 19,
            name: "Nurse 19",
            rank: "B",
            schedule: [
              "N",
              "N",
              "DO",
              "A",
              "DO",
              "A",
              "P",
              "A",
              "DO",
              "P",
              "N",
              "DO",
              "P",
              "A",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 20,
            name: "Nurse 20",
            rank: "B",
            schedule: [
              "P",
              "P",
              "DO",
              "A",
              "A",
              "DO",
              "N",
              "N",
              "DO",
              "A",
              "A",
              "DO",
              "A",
              "P",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 21,
            name: "Nurse 21",
            rank: "B",
            schedule: [
              "DO",
              "P",
              "A",
              "A",
              "DO",
              "N",
              "N",
              "DO",
              "P",
              "P",
              "N",
              "N",
              "DO",
              "P",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 22,
            name: "Nurse 22",
            rank: "B",
            schedule: [
              "P",
              "P",
              "DO",
              "P",
              "A",
              "DO",
              "N",
              "N",
              "DO",
              "P",
              "DO",
              "A",
              "A",
              "P",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 23,
            name: "Nurse 23",
            rank: "B",
            schedule: [
              "A",
              "P",
              "A",
              "DO",
              "N",
              "N",
              "DO",
              "DO",
              "P",
              "P",
              "A",
              "P",
              "N",
              "DO",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 24,
            name: "Nurse 24",
            rank: "C",
            schedule: [
              "N",
              "DO",
              "P",
              "P",
              "N",
              "DO",
              "A",
              "A",
              "P",
              "N",
              "DO",
              "A",
              "N",
              "DO",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 25,
            name: "Nurse 25",
            rank: "C",
            schedule: [
              "P",
              "A",
              "P",
              "N",
              "DO",
              "N",
              "DO",
              "A",
              "A",
              "DO",
              "A",
              "N",
              "DO",
              "A",
            ],
            stats: {
              total_shifts: 10,
            },
          },
          {
            id: 26,
            name: "Nurse 26",
            rank: "C",
            schedule: [
              "P",
              "A",
              "P",
              "N",
              "DO",
              "A",
              "DO",
              "P",
              "N",
              "N",
              "DO",
              "A",
              "P",
              "DO",
            ],
            stats: {
              total_shifts: 10,
            },
          },
        ],
      },
    }; //Put mock data in here

    try {
      const result = await generateAlgorithmRoster.mutateAsync({
        wardId: selectedWard.wardId, // CamelCase to match hook params
        periodId: selectedPeriod.periodId,
        startDate: currentStartDate, // Pass the actual Date object

      });

      // The hook now returns exactly what we need
      setRosterData(result.rosterData);
      setIsAlgorithmGenerated(true);
      showSuccessToast("Algorithm roster generated successfully!");
    } catch (error) {
      console.error("Failed:", error);
      showErrorToast("Failed to generate roster.");
    }
  }, [
    selectedWard,
    selectedPeriod,
    currentStartDate,
    generateAlgorithmRoster,
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
        ga_ward5: gaWard5,
        ga_ward6: gaWard6,
        milp_ward4: milpWard4,
        milp_ward5: milpWard5,
        milp_ward6: milpWard6,
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
          hours: { worked: workedHours, contracted: contractedHours },
          shifts: shiftsObject,
          hasOvertime: workedHours > contractedHours,
          hasWarning: workedHours > contractedHours * 1.2,
        };
      });
      const workedHours = nurse.schedule.reduce(
        (sum, shiftCode) => sum + getShiftDurationHours(shiftCode, shiftDurationMap),
        0,
      );
      const contractedHours = 42;
      return {
        nurseId: nurse.id,
        name: nurse.name,
        designation: nurse.rank === "A" ? "RN" : nurse.rank === "B" ? "EN" : "HCA",
        staffingRole: nurse.rank === "A" ? "RN" : nurse.rank === "B" ? "EN" : "HCA12",
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
    [currentStartDate, showSuccessToast],
  );
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
      setRosterData((prevData) =>
        prevData.map((row) => {
          if (row.nurseId !== nurseId) return row;
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
        }),
      );
    },
    [],
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
    setIsDownloadSuccessDialogOpen(true);
  }, [displayRosterData, currentStartDate, viewMode, exportToXLSX]);

  const handlePublishClick = useCallback(async () => {
    if (!selectedWard || !selectedPeriod) {
      showErrorToast("Please select a ward and period first");
      return;
    }

    try {
      await publishRoster.mutateAsync({
        wardId: selectedWard.wardId,
        periodId: selectedPeriod.periodId,
      });
    } catch (error) {
      console.error("Failed to publish roster:", error);
    }
    setIsPublishSuccessDialogOpen(true);
  }, [selectedWard, selectedPeriod, publishRoster, showErrorToast]);

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
          periods={displayPeriods}
          isAlgorithmGenerated={isAlgorithmGenerated}
          isGenerating={generateAlgorithmRoster.isPending}
          generationProgress={generationProgress}
          onDateChange={handleDateChange}
          onViewModeChange={handleViewModeChange}
          onWardChange={handleWardChange}
          onPeriodChange={handlePeriodChange}
          onPublishRoster={handlePublishClick}
          onDownloadRoster={handleDownloadRoster}
          onGenerateAlgorithm={handleGenerateAlgorithm}
          onClearRoster={handleClearRoster}
          onLoadMockData={handleLoadMockData}
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
    </Flex>
  );
}

export default RosterPlanningPage;
