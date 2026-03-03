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
  useRosterChangelog,
  useCreateChangelog,
  getShiftDurationHours,
  type RosterPeriod,
  type ViewMode,
  type ShiftCode,
  type RosterRow,
  type EditHistoryEntry,
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


function NurseManagerHome() {
  // State management
  const [currentStartDate, setCurrentStartDate] = useState<Date>(
    moment().startOf("isoWeek").toDate()
  );
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<RosterPeriod | null>(null);
  const [isEditHistoryOpen, setIsEditHistoryOpen] = useState(false);

  // Data hooks
  const { data: periods = [] } = useRosterPeriods();
  const { data: shiftDurationMap = new Map() } = useShiftCodes();
  const { exportToXLSX } = useRosterExport();

  const { rows: apiRows, isLoading: rosterLoading } = useRosterPageData(
    selectedWard?.wardid ?? null,
    selectedPeriod?.periodId ?? null
  );

  const { data: changelogEntries = [] } = useRosterChangelog(
    selectedWard?.wardid ?? null,
    selectedPeriod?.periodId ?? null
  );

  const { mutate: createChangelog } = useCreateChangelog(
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
    setLocalRosterData(apiRows);
  }, [apiRows]);

  // Set default period when periods are loaded
  useEffect(() => {
    if (periods.length > 0 && !selectedPeriod) {
      const currentPeriod = periods.find(p =>
        moment().isBetween(moment(p.startDate), moment(p.endDate), 'day', '[]')
      ) || periods[Math.floor(periods.length / 2)];
      setSelectedPeriod(currentPeriod);
    }
  }, [periods, selectedPeriod]);

  // Map API changelog entries to the EditHistoryEntry shape the dialog expects
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
      // Capture old values before updating state
      const row = localRosterData.find(r => r.nurseId === nurseId);
      const oldShiftCode = row?.shifts[date]?.shiftCode ?? null;
      const rosterId = row?.shifts[date]?.rosterId ?? null;

      setLocalRosterData(prevData =>
        prevData.map(r => {
          if (r.nurseId === nurseId) {
            return {
              ...r,
              shifts: {
                ...r.shifts,
                [date]: {
                  ...(r.shifts[date] || {}),
                  rosterId: r.shifts[date]?.rosterId || 0,
                  nurseId,
                  shiftDate: date,
                  shiftCode: newShiftCode,
                  status: "Confirmed" as const,
                },
              },
            };
          }
          return r;
        })
      );

      // Persist to changelog
      createChangelog({
        rosterid: rosterId,
        oldnurseid: nurseId,
        oldshiftcode: oldShiftCode,
        newshiftcode: newShiftCode,
        changetype: "shift_change",
        changesource: "Manual",
      });
    },
    [localRosterData, createChangelog]
  );

  const handleCommentChange = useCallback(
    (nurseId: number, date: string, comment: string) => {
      const row = localRosterData.find(r => r.nurseId === nurseId);
      const rosterId = row?.shifts[date]?.rosterId ?? null;

      setLocalRosterData(prevData =>
        prevData.map(r => {
          if (r.nurseId === nurseId && r.shifts[date]) {
            return {
              ...r,
              shifts: {
                ...r.shifts,
                [date]: {
                  ...r.shifts[date],
                  comment: comment || undefined,
                },
              },
            };
          }
          return r;
        })
      );

      if (comment) {
        createChangelog({
          rosterid: rosterId,
          oldnurseid: nurseId,
          changetype: "comment",
          reason: comment,
          changesource: "Manual",
        });
      }
    },
    [localRosterData, createChangelog]
  );
  const handleExportXLSX = useCallback(() => {
    exportToXLSX(displayRosterData, currentStartDate, viewMode);
  }, [displayRosterData, currentStartDate, viewMode, exportToXLSX]);
  
  const handleViewEditHistory = useCallback(() => {
    setIsEditHistoryOpen(true);
  }, []);

  const handleUndo = useCallback(
    (entryId: number) => {
      const entry = editHistory.find(e => e.id === entryId);
      if (!entry || entry.changeType !== "shift_change" || !entry.previousShiftCode) return;

      const nurseRow = localRosterData.find(r => r.name === entry.nurseName);
      if (!nurseRow) return;

      handleShiftChange(nurseRow.nurseId, entry.shiftDate, entry.previousShiftCode);
    },
    [editHistory, localRosterData, handleShiftChange]
  );

  // Set default ward if not set, restoring from localStorage if available
  useEffect(() => {
    if (wards.length > 0 && !selectedWard) {
      const savedId = localStorage.getItem("selectedWardId");
      const restored = savedId ? wards.find(w => String(w.wardid) === savedId) : null;
      setSelectedWard(restored ?? wards[0]);
    }
  }, [wards, selectedWard]);


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
            periods={periods}
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
        onUndo={handleUndo}
      />
    </Flex>
  );
}

export default NurseManagerHome;