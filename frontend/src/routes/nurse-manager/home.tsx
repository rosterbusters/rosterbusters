import { Box, Flex, Stack } from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import moment from "moment"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { WardsService } from "@/client"
import type { Ward } from "@/client/types.gen"
import NotificationBannerContainer from "@/components/Common/NotificationBannerContainer"
import StatusBanner from "@/components/NurseManager/HomePage/StatusBanner"
import { getWardGuidelines } from "@/components/NurseManager/RosterPlanning"
import {
  type DailyStaffingGuideline,
  EditHistoryDialog,
  type EditHistoryEntry,
  getShiftDurationHours,
  RosterGrid,
  RosterHeader,
  type RosterPeriod,
  type RosterRow,
  type ShiftCode,
  type ShiftRequestOverlay,
  ShiftSummaryTable,
  useAllShiftCodes,
  useCreateChangelog,
  useRosterChangelog,
  useRosterExport,
  useRosterPageData,
  useRosterPeriods,
  useRosterPeriodWindow,
  useShiftCodes,
  useUpdateRoster,
  useUpdateRosterComment,
  type ViewMode,
} from "@/components/NurseManager/RosterTable"
import {
  createToast,
  showErrorToast,
  showSuccessToast,
} from "@/components/ui/toast"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/nurse-manager/home")({
  component: NurseManagerHome,
  validateSearch: (search: Record<string, unknown>): { periodId?: number } => ({
    ...(search.periodId != null ? { periodId: Number(search.periodId) } : {}),
  }),
})

interface UndoRedoItem {
  nurseId: number
  nurseName: string
  date: string
  rosterId: number | null
  fromShiftCode: ShiftCode
  toShiftCode: ShiftCode
}

// Generate mock shift request overlays for demonstration
function generateMockOverlays(
  startDate: Date,
): Record<string, Record<string, ShiftRequestOverlay>> {
  const d = (n: number) => moment(startDate).add(n, "days").format("YYYY-MM-DD")
  return {
    "1": {
      [d(0)]: {
        status: "Approved",
        category: "Nurse Manager",
        reason: "Approved due to urgent coverage need",
      },
    },
    "3": {
      [d(1)]: {
        status: "Rejected",
        category: "Algorithm",
        reason: "Violates staffing constraints",
      },
    },
    "6": {
      [d(2)]: {
        status: "Pending",
        category: "Nurse Manager",
        reason: "Awaiting manager review",
      },
    },
    "7": {
      [d(4)]: {
        status: "Approved",
        category: "Self Changed",
        reason: "Nurse swapped shift after publication",
      },
    },
  }
}

// Initial mock edit history data for demonstration
const _INITIAL_EDIT_HISTORY: EditHistoryEntry[] = [
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
]

function NurseManagerHome() {
  const { user, isUserLoading } = useAuth()
  const { periodId: initialPeriodId } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // State management
  const [currentStartDate, setCurrentStartDate] = useState<Date>(
    moment().startOf("isoWeek").toDate(),
  )
  const [viewMode, setViewMode] = useState<ViewMode>("week")
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<RosterPeriod | null>(
    null,
  )
  const [isEditHistoryOpen, setIsEditHistoryOpen] = useState(false)
  // Mock shift request overlays
  const mockOverlays = useMemo(
    () => generateMockOverlays(currentStartDate),
    [currentStartDate],
  )
  const [guidelines, setGuidelines] = useState<DailyStaffingGuideline>(
    getWardGuidelines(undefined),
  )
  const [dateOverrides, setDateOverrides] = useState<
    Record<string, DailyStaffingGuideline>
  >({})
  const [undoStack, setUndoStack] = useState<UndoRedoItem[]>([])
  const [redoStack, setRedoStack] = useState<UndoRedoItem[]>([])
  const undoStackRef = useRef<UndoRedoItem[]>([])
  const undoRedoHandlersRef = useRef({
    performUndo: (_item: UndoRedoItem) => {},
    performRedo: (_item: UndoRedoItem) => {},
  })

  // Data hooks
  const { data: periods = [] } = useRosterPeriods()
  const { data: periodWindow } = useRosterPeriodWindow()
  const { data: shiftDurationMap = new Map() } = useShiftCodes()
  const { data: allShiftCodes = [] } = useAllShiftCodes()
  const updateRoster = useUpdateRoster()
  const updateRosterComment = useUpdateRosterComment()
  const { exportToXLSX } = useRosterExport()

  const { rows: apiRows, isLoading: rosterLoading } = useRosterPageData(
    selectedWard?.wardid ?? null,
    selectedPeriod?.periodId ?? null,
  )

  const { data: changelogEntries = [] } = useRosterChangelog(
    selectedWard?.wardid ?? null,
    selectedPeriod?.periodId ?? null,
  )

  const { mutate: createChangelog } = useCreateChangelog(
    selectedWard?.wardid ?? null,
    selectedPeriod?.periodId ?? null,
  )

  const { data: wards = [], isLoading: wardsLoading } = useQuery<Ward[]>({
    queryKey: ["wards"],
    queryFn: WardsService.getWards,
  })

  // Local state for roster data (allows updates in mock mode)
  const [localRosterData, setLocalRosterData] = useState<RosterRow[]>([])

  const currentPeriod = useMemo(
    () => periodWindow?.currentPeriod ?? null,
    [periodWindow],
  )
  const upcomingPeriod = useMemo(
    () => periodWindow?.upcomingPeriod ?? null,
    [periodWindow],
  )
  const visiblePeriods = useMemo(() => {
    if (!upcomingPeriod) {
      return periods
    }

    return periods.filter((period) =>
      moment(period.startDate).isSameOrBefore(
        moment(upcomingPeriod.endDate),
        "day",
      ),
    )
  }, [periods, upcomingPeriod])

  useEffect(() => {
    setLocalRosterData(apiRows)
  }, [apiRows])

  // Set default period when periods are loaded
  useEffect(() => {
    if (visiblePeriods.length > 0 && !selectedPeriod) {
      const initialPeriod =
        (initialPeriodId != null
          ? visiblePeriods.find((period) => period.periodId === initialPeriodId)
          : null) ??
        (currentPeriod
          ? visiblePeriods.find(
              (period) => period.periodId === currentPeriod.periodId,
            )
          : null) ??
        visiblePeriods.find((period) =>
          moment().isBetween(
            moment(period.startDate),
            moment(period.endDate),
            "day",
            "[]",
          ),
        ) ??
        visiblePeriods[Math.floor(visiblePeriods.length / 2)]
      setSelectedPeriod(initialPeriod)
      if (initialPeriodId != null) {
        navigate({ to: "/nurse-manager/home", search: {}, replace: true })
      }
    }
  }, [currentPeriod, initialPeriodId, navigate, selectedPeriod, visiblePeriods])

  useEffect(() => {
    if (
      !selectedPeriod ||
      visiblePeriods.some(
        (period) => period.periodId === selectedPeriod.periodId,
      )
    ) {
      return
    }

    setSelectedPeriod(
      upcomingPeriod ??
        currentPeriod ??
        visiblePeriods[visiblePeriods.length - 1] ??
        null,
    )
  }, [currentPeriod, selectedPeriod, upcomingPeriod, visiblePeriods])

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
    }))
  }, [changelogEntries])

  // Derive roster data with hours calculated from the visible date window only
  const displayRosterData = useMemo(() => {
    const days = viewMode === "week" ? 7 : 14
    const visibleDates = Array.from({ length: days }, (_, i) =>
      moment(currentStartDate).add(i, "days").format("YYYY-MM-DD"),
    )

    return localRosterData.map((row) => {
      const workedHours = visibleDates.reduce((sum, dateKey) => {
        const shift = row.shifts[dateKey]
        return (
          sum +
          (shift ? getShiftDurationHours(shift.shiftCode, shiftDurationMap) : 0)
        )
      }, 0)

      return {
        ...row,
        hours: { ...row.hours, worked: workedHours },
        hasOvertime: workedHours > row.hours.contracted,
        hasWarning: workedHours > row.hours.contracted * 1.2,
      }
    })
  }, [localRosterData, currentStartDate, viewMode, shiftDurationMap])

  const shiftTimeMap = useMemo(() => {
    const map = new Map<string, { start?: string; end?: string }>()
    allShiftCodes.forEach((code) => {
      if (code.defaultstart || code.defaultend) {
        map.set(code.shiftcode, {
          start: code.defaultstart ?? undefined,
          end: code.defaultend ?? undefined,
        })
      }
    })
    return map
  }, [allShiftCodes])

  // Handlers
  const handleDateChange = useCallback(
    (date: Date) => {
      setCurrentStartDate(date)

      const matchingPeriod =
        visiblePeriods.find((period) =>
          moment(date).isBetween(
            moment(period.startDate),
            moment(period.endDate),
            "day",
            "[]",
          ),
        ) ?? null

      setSelectedPeriod(matchingPeriod)
    },
    [visiblePeriods],
  )

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
  }, [])

  const handleWardChange = useCallback((ward: Ward) => {
    setSelectedWard(ward)
    localStorage.setItem("selectedWardId", String(ward.wardid))
  }, [])

  const handlePeriodChange = useCallback((period: RosterPeriod) => {
    setSelectedPeriod(period)
    // Also update the start date to match the period
    setCurrentStartDate(moment(period.startDate).toDate())
  }, [])

  const handleShiftChange = useCallback(
    async (nurseId: number, date: string, newShiftCode: ShiftCode) => {
      const wardId = selectedWard?.wardid ?? null
      const periodId = selectedPeriod?.periodId ?? null
      if (!wardId || !periodId) {
        showErrorToast("Please select a ward and roster period first.")
        return
      }

      const row = localRosterData.find((r) => r.nurseId === nurseId)
      const oldShiftCode = row?.shifts[date]?.shiftCode ?? null
      const previousShift = row?.shifts[date] ? { ...row.shifts[date] } : null

      setLocalRosterData((prevData) =>
        prevData.map((r) => {
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
            }
          }
          return r
        }),
      )

      try {
        const result = await updateRoster.mutateAsync({
          wardId,
          nurseId,
          periodId,
          shiftDate: date,
          shiftCode: newShiftCode,
          comment: previousShift?.comment,
        })

        const rosterId =
          (result as { roster_id?: number })?.roster_id ??
          previousShift?.rosterId ??
          0

        if (rosterId) {
          setLocalRosterData((prevData) =>
            prevData.map((r) => {
              if (r.nurseId !== nurseId) return r
              const shift = r.shifts[date]
              if (!shift || shift.rosterId === rosterId) return r
              return {
                ...r,
                shifts: {
                  ...r.shifts,
                  [date]: {
                    ...shift,
                    rosterId,
                  },
                },
              }
            }),
          )
        }

        createChangelog({
          rosterid: rosterId || null,
          oldnurseid: nurseId,
          oldshiftcode: oldShiftCode,
          newshiftcode: newShiftCode,
          changetype: "shift_change",
          changesource: "Manual",
        })

        if (oldShiftCode !== null) {
          const undoItem: UndoRedoItem = {
            nurseId,
            nurseName: row?.name ?? "",
            date,
            rosterId,
            fromShiftCode: oldShiftCode,
            toShiftCode: newShiftCode,
          }
          setUndoStack((prev) => [...prev, undoItem])
          setRedoStack([])
          createToast({
            title: "Shift updated",
            description: `${row?.name ?? "Nurse"}: ${oldShiftCode} → ${newShiftCode}`,
            action: {
              label: "Undo",
              onClick: () => undoRedoHandlersRef.current.performUndo(undoItem),
            },
            meta: { closable: true },
            duration: 5000,
          })
        }
      } catch {
        showErrorToast("Failed to update shift. Please try again.")
        setLocalRosterData((prevData) =>
          prevData.map((r) => {
            if (r.nurseId !== nurseId) return r
            const nextShifts = { ...r.shifts }
            if (previousShift) {
              nextShifts[date] = previousShift
            } else {
              nextShifts[date] = null
            }
            return { ...r, shifts: nextShifts }
          }),
        )
      }
    },
    [
      localRosterData,
      selectedWard?.wardid,
      selectedPeriod?.periodId,
      updateRoster,
      createChangelog,
    ],
  )

  const handleCommentChange = useCallback(
    async (nurseId: number, date: string, comment: string) => {
      const row = localRosterData.find((r) => r.nurseId === nurseId)
      const rosterId = row?.shifts[date]?.rosterId ?? null
      const previousShift = row?.shifts[date] ? { ...row.shifts[date] } : null

      setLocalRosterData((prevData) =>
        prevData.map((r) => {
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
            }
          }
          return r
        }),
      )

      if (!rosterId) {
        showErrorToast("Please save the shift before adding a comment.")
        return
      }

      try {
        await updateRosterComment.mutateAsync({
          rosterId,
          comment: comment || null,
        })

        if (comment) {
          createChangelog({
            rosterid: rosterId,
            oldnurseid: nurseId,
            changetype: "comment",
            reason: comment,
            changesource: "Manual",
          })
        }
      } catch {
        showErrorToast("Failed to save comment. Please try again.")
        setLocalRosterData((prevData) =>
          prevData.map((r) => {
            if (r.nurseId !== nurseId) return r
            const nextShifts = { ...r.shifts }
            if (previousShift) {
              nextShifts[date] = previousShift
            }
            return { ...r, shifts: nextShifts }
          }),
        )
      }
    },
    [localRosterData, updateRosterComment, createChangelog],
  )
  const handleExportXLSX = useCallback(async () => {
    if (!selectedWard?.wardid || !selectedPeriod) {
      showErrorToast("Please select a ward and roster period first.")
      return
    }
    try {
      await exportToXLSX(
        displayRosterData,
        currentStartDate,
        viewMode,
        selectedWard.wardid,
        selectedPeriod.periodId,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to export roster."
      showErrorToast(message)
    }
  }, [
    displayRosterData,
    currentStartDate,
    viewMode,
    selectedWard,
    selectedPeriod,
    exportToXLSX,
  ])

  const handleViewEditHistory = useCallback(() => {
    setIsEditHistoryOpen(true)
  }, [])

  // Persist staffing guidelines to the ward record in the database
  const { mutate: persistStaffing } = useMutation({
    mutationFn: async (newGuidelines: DailyStaffingGuideline) => {
      if (!selectedWard) return
      const token = localStorage.getItem("access_token")
      const BASE = import.meta.env.VITE_API_URL || ""
      const res = await fetch(
        `${BASE}/api/v1/wards/${selectedWard.wardid}/staffing`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            staffing_json: JSON.stringify(newGuidelines),
          }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const detail =
          typeof body?.detail === "string" && body.detail.trim()
            ? body.detail
            : "Failed to save staffing requirements"
        throw new Error(detail)
      }
      return res.json()
    },
    onSuccess: (updatedWard) => {
      if (updatedWard?.wardid === selectedWard?.wardid) {
        setSelectedWard(updatedWard)
      }
      queryClient.setQueryData<Ward[] | undefined>(["wards"], (prev) =>
        prev?.map((ward) =>
          ward.wardid === updatedWard?.wardid ? updatedWard : ward,
        ),
      )
      void queryClient.invalidateQueries({ queryKey: ["wards"] })
      showSuccessToast("Staffing requirements saved for all future rosters", {
        title: "Staffing saved",
      })
    },
    onError: (error) =>
      showErrorToast(
        error instanceof Error
          ? error.message
          : "Failed to save staffing requirements",
        {
          title: "Save failed",
        },
      ),
  })

  const handleGuidelinesChange = useCallback(
    (updated: DailyStaffingGuideline) => {
      setGuidelines(updated)
      persistStaffing(updated)
    },
    [persistStaffing],
  )

  const handleDateOverrideChange = useCallback(
    (dateKey: string, updated: DailyStaffingGuideline) => {
      setDateOverrides((prev) => ({ ...prev, [dateKey]: updated }))
    },
    [],
  )

  const handleUndo = useCallback(
    (entryId: number) => {
      const entry = editHistory.find((e) => e.id === entryId)
      if (
        !entry ||
        entry.changeType !== "shift_change" ||
        !entry.previousShiftCode
      )
        return

      const nurseRow = localRosterData.find((r) => r.name === entry.nurseName)
      if (!nurseRow) return

      handleShiftChange(
        nurseRow.nurseId,
        entry.shiftDate,
        entry.previousShiftCode,
      )
    },
    [editHistory, localRosterData, handleShiftChange],
  )

  // Keep undoStackRef in sync for use in the Ctrl+Z listener
  useEffect(() => {
    undoStackRef.current = undoStack
  }, [undoStack])

  // Assign undo/redo handlers to a mutable ref so toast action closures always call the latest version
  undoRedoHandlersRef.current = {
    performUndo: (item: UndoRedoItem) => {
      setLocalRosterData((prevData) =>
        prevData.map((r) => {
          if (r.nurseId === item.nurseId) {
            return {
              ...r,
              shifts: {
                ...r.shifts,
                [item.date]: {
                  ...(r.shifts[item.date] || {}),
                  rosterId: r.shifts[item.date]?.rosterId || 0,
                  nurseId: item.nurseId,
                  shiftDate: item.date,
                  shiftCode: item.fromShiftCode,
                  status: "Confirmed" as const,
                },
              },
            }
          }
          return r
        }),
      )
      createChangelog({
        rosterid: item.rosterId,
        oldnurseid: item.nurseId,
        oldshiftcode: item.toShiftCode,
        newshiftcode: item.fromShiftCode,
        changetype: "shift_change",
        changesource: "Manual",
      })
      setUndoStack((prev) => prev.filter((i) => i !== item))
      const redoItem: UndoRedoItem = {
        ...item,
        fromShiftCode: item.toShiftCode,
        toShiftCode: item.fromShiftCode,
      }
      setRedoStack((prev) => [...prev, redoItem])
      createToast({
        title: "Change undone",
        description: `${item.nurseName}: ${item.toShiftCode} → ${item.fromShiftCode}`,
        action: {
          label: "Redo",
          onClick: () => undoRedoHandlersRef.current.performRedo(redoItem),
        },
        meta: { closable: true },
        duration: 5000,
      })
    },
    performRedo: (item: UndoRedoItem) => {
      setLocalRosterData((prevData) =>
        prevData.map((r) => {
          if (r.nurseId === item.nurseId) {
            return {
              ...r,
              shifts: {
                ...r.shifts,
                [item.date]: {
                  ...(r.shifts[item.date] || {}),
                  rosterId: r.shifts[item.date]?.rosterId || 0,
                  nurseId: item.nurseId,
                  shiftDate: item.date,
                  shiftCode: item.toShiftCode,
                  status: "Confirmed" as const,
                },
              },
            }
          }
          return r
        }),
      )
      createChangelog({
        rosterid: item.rosterId,
        oldnurseid: item.nurseId,
        oldshiftcode: item.fromShiftCode,
        newshiftcode: item.toShiftCode,
        changetype: "shift_change",
        changesource: "Manual",
      })
      setRedoStack((prev) => prev.filter((i) => i !== item))
      const undoItem: UndoRedoItem = { ...item }
      setUndoStack((prev) => [...prev, undoItem])
      createToast({
        title: "Change redone",
        description: `${item.nurseName}: ${item.fromShiftCode} → ${item.toShiftCode}`,
        action: {
          label: "Undo",
          onClick: () => undoRedoHandlersRef.current.performUndo(undoItem),
        },
        meta: { closable: true },
        duration: 5000,
      })
    },
  }

  // Keep redoStackRef in sync for use in the Ctrl+Y listener
  const redoStackRef = useRef<UndoRedoItem[]>([])
  useEffect(() => {
    redoStackRef.current = redoStack
  }, [redoStack])

  // Global Ctrl+Z / Ctrl+Y listener (only when the history dialog is not open, to avoid conflict)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !isEditHistoryOpen) {
        if (e.key === "z") {
          e.preventDefault()
          const stack = undoStackRef.current
          if (stack.length > 0) {
            undoRedoHandlersRef.current.performUndo(stack[stack.length - 1])
          }
        } else if (e.key === "y") {
          e.preventDefault()
          const stack = redoStackRef.current
          if (stack.length > 0) {
            undoRedoHandlersRef.current.performRedo(stack[stack.length - 1])
          }
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isEditHistoryOpen])

  // Re-initialise guidelines whenever the selected ward changes
  useEffect(() => {
    if (!selectedWard) return
    setGuidelines(getWardGuidelines(selectedWard))
    setDateOverrides({})
  }, [selectedWard?.wardid, selectedWard]) // eslint-disable-line react-hooks/exhaustive-deps

  // Default to the nurse manager's assigned ward when available, then restore
  // the last selected ward, and finally fall back to the first accessible ward.
  useEffect(() => {
    if (wards.length === 0 || isUserLoading) {
      return
    }

    const assignedWard =
      user?.wardid != null
        ? (wards.find((w) => w.wardid === user.wardid) ?? null)
        : null
    const selectedWardStillAvailable = selectedWard
      ? wards.some((ward) => ward.wardid === selectedWard.wardid)
      : false

    if (!selectedWardStillAvailable) {
      const savedId = localStorage.getItem("selectedWardId")
      const restored = savedId
        ? (wards.find((ward) => String(ward.wardid) === savedId) ?? null)
        : null
      setSelectedWard(assignedWard ?? restored ?? wards[0])
    }
  }, [isUserLoading, selectedWard, user?.wardid, wards])

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
          <NotificationBannerContainer />
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
            currentPeriod={currentPeriod}
            upcomingPeriod={upcomingPeriod}
            wards={wards}
            periods={visiblePeriods}
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
            wardId={selectedWard?.wardid ?? null}
            viewMode={viewMode}
            currentStartDate={currentStartDate}
            onShiftChange={handleShiftChange}
            onCommentChange={handleCommentChange}
            isLoading={wardsLoading || rosterLoading}
            showSummary={false}
            shiftRequestOverlays={mockOverlays}
            shiftDurationMap={shiftDurationMap}
            shiftTimeMap={shiftTimeMap}
          />
        </Box>

        {/* Sticky summary table */}
        <ShiftSummaryTable
          data={displayRosterData}
          viewMode={viewMode}
          currentStartDate={currentStartDate}
          wardHourType={selectedWard?.wardhourtype}
          isRosterGenerated={true}
          guidelines={guidelines}
          dateOverrides={dateOverrides}
          originalGuidelines={getWardGuidelines(selectedWard)}
          onGuidelinesChange={handleGuidelinesChange}
          onDateOverrideChange={handleDateOverrideChange}
        />
      </Box>

      <EditHistoryDialog
        isOpen={isEditHistoryOpen}
        onClose={() => setIsEditHistoryOpen(false)}
        entries={editHistory}
        onUndo={handleUndo}
      />
    </Flex>
  )
}

export default NurseManagerHome
