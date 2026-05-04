import {
  Box,
  Checkbox,
  Flex,
  HStack,
  Icon,
  Input,
  Popover,
  Spinner,
  Table,
  Text,
} from "@chakra-ui/react"
import { ChevronDown, ChevronRight, Filter, Star, X } from "lucide-react"
import moment from "moment"
import React, { useCallback, useMemo, useRef, useState } from "react"

import { ShiftBadge } from "./ShiftBadge"
import { ShiftCommentPopover } from "./ShiftCommentPopover"
import { ShiftEditPopover } from "./ShiftEditPopover"
import { calculateShiftCounts, getCellStyle } from "./ShiftSummaryTable"
import {
  getRosterGroupKey,
  isPsaDesignation,
  MOCK_STAFFING_GUIDELINES,
} from "./staffingGuidelines"
import type {
  DailyStaffingGuideline,
  DayColumn,
  RosterRow,
  ShiftAssignment,
  ShiftCode,
  ShiftRequestOverlay,
  StaffRole,
  SummaryShiftType,
  ViewMode,
} from "./types"

const SHIFT_TYPES: SummaryShiftType[] = ["A", "P", "N"]
const STAFF_ROLES: StaffRole[] = ["RN", "EN", "NA", "HCA12", "HCA3"]
const ROLE_LABEL: Record<StaffRole, string> = {
  RN: "RN",
  EN: "EN",
  NA: "NA",
  HCA12: "HCA1&2",
  HCA3: "HCA3",
}
const ROLE_GROUP_ORDER = ["SSN/SN", "EN/NA/HCA1/HCA2", "HCA3", "Other"] as const
type RoleGroupKey = (typeof ROLE_GROUP_ORDER)[number]

const isPSA = (designation?: string) => isPsaDesignation(designation ?? "")

interface NameFilterPopoverProps {
  isFilterActive: boolean
  selectedNames: Set<string>
  allNames: string[]
  onToggleName: (name: string) => void
  onClearFilter: () => void
  onSelectAll: () => void
}

const NameFilterPopover = React.memo(function NameFilterPopover({
  isFilterActive,
  selectedNames,
  allNames,
  onToggleName,
  onClearFilter,
  onSelectAll,
}: NameFilterPopoverProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterSearch, setFilterSearch] = useState("")
  const filterAnchorRef = useRef<HTMLDivElement>(null)

  const filteredNameOptions = useMemo(
    () =>
      allNames.filter((n) =>
        n.toLowerCase().includes(filterSearch.toLowerCase()),
      ),
    [allNames, filterSearch],
  )

  const handleClear = useCallback(() => {
    onClearFilter()
    setFilterSearch("")
  }, [onClearFilter])

  return (
    <>
      <Box position="relative" display="inline-flex" ref={filterAnchorRef}>
        <Box
          as="button"
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={1}
          borderRadius="md"
          cursor="pointer"
          color={isFilterActive ? "#155E75" : "faintforeground"}
          bg={isFilterActive ? "#e0f2fe" : "transparent"}
          _hover={{ bg: "#e0f2fe", color: "#155E75" }}
          _active={{ bg: "#bae6fd", color: "#0e7490" }}
          transition="all 0.15s ease"
          onClick={(e) => {
            e.stopPropagation()
            setFilterOpen((o) => !o)
          }}
          title="Filter by name"
        >
          <Filter size={14} />
        </Box>
        {isFilterActive && (
          <Box
            position="absolute"
            top="-2px"
            right="-2px"
            w="7px"
            h="7px"
            borderRadius="full"
            bg="#0e7490"
            border="1.5px solid white"
            pointerEvents="none"
          />
        )}
      </Box>

      {/* Name Filter Popover */}
      <Popover.Root
        open={filterOpen}
        onOpenChange={(d) => {
          if (!d.open) {
            setFilterOpen(false)
            setFilterSearch("")
          }
        }}
        positioning={{
          getAnchorRect: () =>
            filterAnchorRef.current?.getBoundingClientRect() ?? null,
          placement: "bottom-start",
        }}
      >
        <Popover.Positioner zIndex={49}>
          <Popover.Content
            w="220px"
            borderRadius="lg"
            boxShadow="lg"
            overflow="hidden"
          >
            {/* Header */}
            <Popover.Header
              p={2}
              bg="gray.50"
              borderBottom="1px solid"
              borderColor="gray.100"
            >
              <Flex justify="space-between" align="center" mb={2}>
                <Text fontSize="xs" fontWeight="semibold" color="#155E75">
                  Filter by Name
                </Text>
                <Box
                  as="button"
                  cursor="pointer"
                  color="gray.400"
                  _hover={{ color: "gray.600" }}
                  onClick={() => {
                    setFilterOpen(false)
                    setFilterSearch("")
                  }}
                >
                  <X size={13} />
                </Box>
              </Flex>
              <Input
                placeholder="Search name..."
                size="xs"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                autoFocus
                borderColor="gray.200"
                _focus={{
                  borderColor: "#4B8798",
                  boxShadow: "0 0 0 1px #4B8798",
                }}
              />
            </Popover.Header>

            {/* Actions */}
            <Flex
              px={2}
              py={1}
              gap={2}
              borderBottom="1px solid"
              borderColor="gray.100"
              bg="white"
            >
              <Box
                as="button"
                fontSize="xs"
                color="#4B8798"
                cursor="pointer"
                _hover={{ color: "#155E75", textDecoration: "underline" }}
                onClick={onSelectAll}
              >
                Select all
              </Box>
              <Text fontSize="xs" color="gray.300">
                |
              </Text>
              <Box
                as="button"
                fontSize="xs"
                color="#4B8798"
                cursor="pointer"
                _hover={{ color: "#155E75", textDecoration: "underline" }}
                onClick={handleClear}
              >
                Clear
              </Box>
              {isFilterActive && (
                <Text fontSize="xs" color="gray.400" ml="auto">
                  {selectedNames.size} selected
                </Text>
              )}
            </Flex>

            {/* Name list */}
            <Popover.Body p={0} maxH="200px" overflowY="auto">
              {filteredNameOptions.length === 0 ? (
                <Flex px={3} py={3} align="center">
                  <Text fontSize="xs" color="gray.400">
                    No names found
                  </Text>
                </Flex>
              ) : (
                filteredNameOptions.map((name) => (
                  <Flex
                    key={name}
                    align="center"
                    gap={2}
                    px={3}
                    py={1.5}
                    cursor="pointer"
                    bg={selectedNames.has(name) ? "#f0f9ff" : "white"}
                    _hover={{ bg: "#f0f9ff" }}
                    transition="background 0.1s ease"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleName(name)
                    }}
                  >
                    <Checkbox.Root
                      size="sm"
                      checked={selectedNames.has(name)}
                      onCheckedChange={() => onToggleName(name)}
                      onClick={(e) => e.stopPropagation()}
                      colorPalette="cyan"
                    >
                      <Checkbox.HiddenInput />
                      <Checkbox.Control
                        borderColor={
                          selectedNames.has(name) ? "#0e7490" : "gray.300"
                        }
                        bg={selectedNames.has(name) ? "#0e7490" : "white"}
                      >
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox.Root>
                    <Text fontSize="xs" color="gray.700" userSelect="none">
                      {name}
                    </Text>
                  </Flex>
                ))
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Popover.Root>
    </>
  )
})

interface RosterGridProps {
  data: RosterRow[]
  wardId?: number | null
  viewMode: ViewMode
  currentStartDate: Date
  onShiftChange: (
    nurseId: number,
    date: string,
    newShiftCode: ShiftCode,
  ) => void
  onCommentChange?: (nurseId: number, date: string, comment: string) => void
  isLoading?: boolean
  loadingLabel?: string
  guidelines?: DailyStaffingGuideline
  isRosterGenerated?: boolean
  showSummary?: boolean
  shiftRequestOverlays?: Record<string, Record<string, ShiftRequestOverlay>>
  highlightedNurseIds?: Set<number>
  onNurseNameClick?: (row: RosterRow) => void
  shiftDurationMap?: Map<string, number>
  shiftTimeMap?: Map<string, { start?: string; end?: string }>
  showLongServiceSnIcon?: boolean
}

interface RosterGridRowProps {
  row: RosterRow
  dayColumns: DayColumn[]
  viewMode: ViewMode
  showLongServiceSnIcon?: boolean
  highlightedNurseIds?: Set<number>
  onNurseNameClick?: (row: RosterRow) => void
  handleShiftClick: (
    nurseId: number,
    nurseName: string,
    date: string,
    shift: ShiftAssignment | null,
    event: React.MouseEvent<HTMLDivElement>,
  ) => void
  handleCommentIconClick: (
    nurseId: number,
    nurseName: string,
    date: string,
    shift: ShiftAssignment | null,
    event: React.MouseEvent,
  ) => void
  shiftRequestOverlays?: Record<string, Record<string, ShiftRequestOverlay>>
  shiftDurationMap?: Map<string, number>
  shiftTimeMap?: Map<string, { start?: string; end?: string }>
}

const RosterGridRow = React.memo(function RosterGridRow({
  row,
  dayColumns,
  viewMode,
  showLongServiceSnIcon = false,
  highlightedNurseIds,
  onNurseNameClick,
  handleShiftClick,
  handleCommentIconClick,
  shiftRequestOverlays,
  shiftDurationMap,
  shiftTimeMap,
}: RosterGridRowProps) {
  const displayName = getDisplayName(row)
  const isHighlighted = highlightedNurseIds?.has(row.nurseId) ?? false
  const showClassASnIcon = showLongServiceSnIcon && shouldShowClassASnIcon(row)

  return (
    <Table.Row
      key={row.nurseId}
      color="foreground"
      _hover={{ bg: "gray.50" }}
      borderBottom="1px solid"
      borderColor="gray.100"
    >
      {/* Name Cell with warning indicator */}
      <Table.Cell
        bg="white"
        borderRight="1px solid"
        borderColor="gray.200"
        py={2}
        px={3}
        w="160px"
        minW="160px"
      >
        <Box
          as={onNurseNameClick ? "button" : "div"}
          w="full"
          textAlign="left"
          cursor={onNurseNameClick ? "pointer" : "default"}
          onClick={() => onNurseNameClick?.(row)}
          _hover={onNurseNameClick ? { bg: "#f8fafc" } : undefined}
          borderRadius="md"
          px={1}
          py={1}
        >
          <HStack gap={2} align="center">
            <Text
              fontSize="sm"
              fontWeight="medium"
              color={isHighlighted ? "#b45309" : undefined}
              textDecoration={isHighlighted ? "underline" : undefined}
            >
              {displayName}
            </Text>
            {showClassASnIcon && (
              <Box
                as="span"
                color="gray.500"
                title="Class A SN with more than 3 years since join date"
                aria-label="Class A SN with more than 3 years since join date"
                display="inline-flex"
                alignItems="center"
              >
                <Icon as={Star} boxSize={3.5} fill="currentColor" />
              </Box>
            )}
            {isHighlighted && (
              <Box
                px={2}
                py={0.5}
                borderRadius="full"
                bg="#fef3c7"
                color="#92400e"
                fontSize="10px"
                fontWeight="semibold"
              >
                No night
              </Box>
            )}
          </HStack>
        </Box>
      </Table.Cell>

      {/* Shift Cells */}
      {dayColumns.map((col) => {
        const dateKey = moment(col.date).format("YYYY-MM-DD")
        const rawShift = row.shifts[dateKey] || null
        const shift = rawShift

        return (
          <Table.Cell
            key={col.field}
            textAlign="center"
            p={2}
            borderRight="1px solid"
            borderColor="gray.50"
          >
            <Flex justify="center">
              <Box
                onClick={(e) =>
                  handleShiftClick(row.nurseId, displayName, dateKey, shift, e)
                }
              >
                <ShiftBadge
                  shiftCode={shift?.shiftCode || null}
                  isEditable={true}
                  viewMode={viewMode}
                  comment={shift?.comment}
                  onCommentIconClick={(e) =>
                    handleCommentIconClick(
                      row.nurseId,
                      displayName,
                      dateKey,
                      shift,
                      e,
                    )
                  }
                  shiftRequestOverlay={
                    shiftRequestOverlays?.[String(row.nurseId)]?.[dateKey]
                  }
                  shiftDurationMap={shiftDurationMap}
                  shiftTimeMap={shiftTimeMap}
                />
              </Box>
            </Flex>
          </Table.Cell>
        )
      })}
    </Table.Row>
  )
})

// Generate day columns based on view mode and start date
function generateDayColumns(startDate: Date, viewMode: ViewMode): DayColumn[] {
  const days = viewMode === "week" ? 7 : 14
  const columns: DayColumn[] = []

  for (let i = 0; i < days; i++) {
    const date = moment(startDate).add(i, "days")
    columns.push({
      field: `shift_${date.format("YYYY-MM-DD")}`,
      title: date.format("dddd"),
      date: date.toDate(),
      dayOfWeek: date.format("ddd"),
    })
  }

  return columns
}

function groupByRoleGroup(data: RosterRow[]): Map<RoleGroupKey, RosterRow[]> {
  const groups = new Map<RoleGroupKey, RosterRow[]>()
  ROLE_GROUP_ORDER.forEach((key) => groups.set(key, []))

  data.forEach((row) => {
    const key = getRosterGroupKey(row)
    const existing = groups.get(key) || []
    existing.push(row)
    groups.set(key, existing)
  })

  return groups
}

function getDisplayTitle(row: RosterRow): string {
  return (row.designation ?? "").toString()
}

function getEnNaHcaSortRank(row: RosterRow): number {
  const title = getDisplayTitle(row).toUpperCase()
  if (title === "SEN") return 1
  if (title === "EN") return 2
  if (title === "NA") return 3
  if (title === "HCA1") return 4
  if (title === "HCA2") return 5
  if (title === "HCA3") return 6
  if (title === "HCA") return 7
  return 99
}

function getSsnSnSortRank(row: RosterRow): number {
  const title = getDisplayTitle(row).toUpperCase()
  if (title === "SSN") return 1
  if (title === "SN") {
    return shouldShowClassASnIcon(row) ? 2 : 3
  }
  return 99
}

function getDisplayName(row: RosterRow): string {
  const title = getDisplayTitle(row).trim()
  const name = (row.name ?? "").toString().trim()

  if (!title) return name
  if (!name) return title

  return `${title} ${name}`
}

function isSnDesignation(designation?: string): boolean {
  const normalized = (designation ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")

  return [
    "RN",
    "REGISTEREDNURSE",
    "STAFFNURSE",
    "STAFFNURSEI",
    "STAFFNURSEII",
    "SN",
  ].includes(normalized)
}

function shouldShowClassASnIcon(row: RosterRow): boolean {
  if (row.rosterRank !== "A") return false
  if (!isSnDesignation(row.designation)) return false
  if (!row.joinDate) return false

  const joinDate = moment(row.joinDate)
  if (!joinDate.isValid()) return false

  return moment().diff(joinDate, "years", true) > 3
}

export function RosterGrid({
  data,
  wardId,
  viewMode,
  currentStartDate,
  onShiftChange,
  onCommentChange,
  isLoading = false,
  loadingLabel = "Loading roster data...",
  guidelines = MOCK_STAFFING_GUIDELINES,
  isRosterGenerated = false,
  showSummary = true,
  shiftRequestOverlays = {},
  highlightedNurseIds,
  onNurseNameClick,
  shiftDurationMap,
  shiftTimeMap,
  showLongServiceSnIcon = false,
}: RosterGridProps) {
  // Popover state
  const [popoverState, setPopoverState] = useState<{
    isOpen: boolean
    nurseId: number | null
    date: string
    nurseName: string
    currentShift: ShiftAssignment | null
    anchorEl: HTMLElement | null
  }>({
    isOpen: false,
    nurseId: null,
    date: "",
    nurseName: "",
    currentShift: null,
    anchorEl: null,
  })

  // Comment-only popover state
  const [commentPopoverState, setCommentPopoverState] = useState<{
    isOpen: boolean
    nurseId: number | null
    date: string
    nurseName: string
    currentComment: string
    anchorEl: HTMLElement | null
  }>({
    isOpen: false,
    nurseId: null,
    date: "",
    nurseName: "",
    currentComment: "",
    anchorEl: null,
  })

  // Collapsed groups state - all groups start expanded
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())

  const dataWithoutPSA = useMemo(
    () => data.filter((row) => !isPSA(row.designation)),
    [data],
  )

  // All unique nurse names sorted
  const allNames = useMemo(
    () => Array.from(new Set(dataWithoutPSA.map((r) => r.name))).sort(),
    [dataWithoutPSA],
  )

  const isFilterActive = selectedNames.size > 0

  const toggleName = useCallback((name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const clearFilter = useCallback(() => {
    setSelectedNames(new Set())
  }, [])

  const selectAll = useCallback(() => {
    setSelectedNames(new Set(allNames))
  }, [allNames])

  // Generate day columns
  const dayColumns = useMemo(
    () => generateDayColumns(currentStartDate, viewMode),
    [currentStartDate, viewMode],
  )

  // Apply name filter to data before grouping
  const filteredData = useMemo(
    () =>
      isFilterActive
        ? dataWithoutPSA.filter((r) => selectedNames.has(r.name))
        : dataWithoutPSA,
    [dataWithoutPSA, isFilterActive, selectedNames],
  )

  // Group data by designation (role) - always grouped
  const groupedData = useMemo(() => {
    return groupByRoleGroup(filteredData)
  }, [filteredData])

  // Handle shift badge click
  const handleShiftClick = useCallback(
    (
      nurseId: number,
      nurseName: string,
      date: string,
      shift: ShiftAssignment | null,
      event: React.MouseEvent<HTMLDivElement>,
    ) => {
      setPopoverState({
        isOpen: true,
        nurseId,
        date,
        nurseName,
        currentShift: shift,
        anchorEl: event.currentTarget,
      })
    },
    [],
  )

  // Handle popover close
  const handlePopoverClose = useCallback(() => {
    setPopoverState((prev) => ({ ...prev, isOpen: false }))
  }, [])

  // Handle shift change from popover
  const handleShiftChange = useCallback(
    (newShiftCode: ShiftCode) => {
      if (popoverState.nurseId !== null) {
        onShiftChange(popoverState.nurseId, popoverState.date, newShiftCode)
      }
    },
    [popoverState.nurseId, popoverState.date, onShiftChange],
  )

  // Handle comment change from popover
  const handleCommentChange = useCallback(
    (comment: string) => {
      if (popoverState.nurseId !== null && onCommentChange) {
        onCommentChange(popoverState.nurseId, popoverState.date, comment)
      }
    },
    [popoverState.nurseId, popoverState.date, onCommentChange],
  )

  // Handle comment icon click — open comment-only popover (suppresses Edit Shift popover)
  const handleCommentIconClick = useCallback(
    (
      nurseId: number,
      nurseName: string,
      date: string,
      shift: ShiftAssignment | null,
      event: React.MouseEvent,
    ) => {
      setCommentPopoverState({
        isOpen: true,
        nurseId,
        date,
        nurseName,
        currentComment: shift?.comment || "",
        anchorEl: event.currentTarget as HTMLElement,
      })
    },
    [],
  )

  // Handle comment popover close
  const handleCommentPopoverClose = useCallback(() => {
    setCommentPopoverState((prev) => ({ ...prev, isOpen: false }))
  }, [])

  // Handle comment save from comment-only popover
  const handleCommentSaveFromIcon = useCallback(
    (comment: string) => {
      if (commentPopoverState.nurseId !== null && onCommentChange) {
        onCommentChange(
          commentPopoverState.nurseId,
          commentPopoverState.date,
          comment,
        )
      }
    },
    [commentPopoverState.nurseId, commentPopoverState.date, onCommentChange],
  )

  // Toggle group collapse
  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey)
      } else {
        newSet.add(groupKey)
      }
      return newSet
    })
  }, [])

  // Column width calculation
  const dayColumnWidth = viewMode === "week" ? "120px" : "80px"

  // Total columns: Name + Day columns
  const totalCols = 1 + dayColumns.length

  // Calculate shift counts for summary
  const shiftCounts = useMemo(
    () => calculateShiftCounts(filteredData, dayColumns),
    [filteredData, dayColumns],
  )

  // Calculate total for a specific shift type and date
  const getTotal = useCallback(
    (dateKey: string, shiftType: SummaryShiftType): number => {
      const dayCounts = shiftCounts.get(dateKey)
      if (!dayCounts) return 0
      return STAFF_ROLES.reduce(
        (sum, role) => sum + dayCounts[role][shiftType],
        0,
      )
    },
    [shiftCounts],
  )

  const summaryRows = useMemo(() => {
    const summaryRows: React.ReactNode[] = []

    // Summary Header Row (A, P, N labels)
    summaryRows.push(
      <Table.Row
        key="summary-header"
        bg="white"
        borderTop="2px solid"
        borderColor="#7EC8D9"
      >
        <Table.Cell
          colSpan={1}
          borderRight="1px solid"
          borderColor="gray.200"
          p={1}
          bg="white"
        />
        {dayColumns.map((col) => (
          <Table.Cell
            key={col.field}
            textAlign="center"
            borderRight="1px solid"
            borderColor="gray.100"
            p={0}
            bg="white"
          >
            <Flex justify="space-around">
              {SHIFT_TYPES.map((type) => (
                <Text
                  key={type}
                  fontSize="xs"
                  fontWeight="semibold"
                  color="#4B8798"
                  flex={1}
                  textAlign="center"
                  py={1}
                >
                  {type}
                </Text>
              ))}
            </Flex>
          </Table.Cell>
        ))}
      </Table.Row>,
    )

    // Role Rows (RN, EN, HCA)
    STAFF_ROLES.forEach((role) => {
      summaryRows.push(
        <Table.Row key={`summary-${role}`} bg="white">
          <Table.Cell
            colSpan={1}
            fontWeight="semibold"
            fontSize="xs"
            color="#4B8798"
            borderRight="1px solid"
            borderColor="gray.200"
            py={1}
            px={2}
            textAlign="right"
            bg="white"
          >
            {ROLE_LABEL[role]}
          </Table.Cell>
          {dayColumns.map((col) => {
            const dateKey = moment(col.date).format("YYYY-MM-DD")
            const dayCounts = shiftCounts.get(dateKey)

            return (
              <Table.Cell
                key={col.field}
                textAlign="center"
                borderRight="1px solid"
                borderColor="gray.100"
                p={0}
              >
                <Flex>
                  {SHIFT_TYPES.map((shiftType) => {
                    const count = dayCounts?.[role]?.[shiftType] ?? 0
                    const style = getCellStyle(
                      count,
                      guidelines[role][shiftType].minimum,
                      isRosterGenerated,
                      guidelines[role][shiftType].maximum,
                    )

                    return (
                      <Flex
                        key={shiftType}
                        justify="center"
                        align="center"
                        bg={style.bg}
                        color={style.color}
                        flex={1}
                        py={1}
                        fontSize="xs"
                        fontWeight="semibold"
                      >
                        {count}
                      </Flex>
                    )
                  })}
                </Flex>
              </Table.Cell>
            )
          })}
        </Table.Row>,
      )
    })

    // Total Row
    summaryRows.push(
      <Table.Row key="summary-total" bg="#ADD8E6">
        <Table.Cell
          colSpan={1}
          fontWeight="bold"
          fontSize="xs"
          color="#4B8798"
          borderRight="1px solid"
          borderColor="rgba(255,255,255,0.3)"
          py={1}
          px={2}
          textAlign="right"
          bg="#ADD8E6"
        >
          Total
        </Table.Cell>
        {dayColumns.map((col) => {
          const dateKey = moment(col.date).format("YYYY-MM-DD")

          return (
            <Table.Cell
              key={col.field}
              textAlign="center"
              borderRight="1px solid"
              borderColor="rgba(255,255,255,0.3)"
              p={0}
              bg="#ADD8E6"
            >
              <Flex>
                {SHIFT_TYPES.map((shiftType) => {
                  const total = getTotal(dateKey, shiftType)
                  return (
                    <Flex
                      key={shiftType}
                      justify="center"
                      align="center"
                      flex={1}
                      py={1}
                      fontSize="xs"
                      fontWeight="bold"
                      color="#4B8798"
                    >
                      {total}
                    </Flex>
                  )
                })}
              </Flex>
            </Table.Cell>
          )
        })}
      </Table.Row>,
    )

    return summaryRows
  }, [dayColumns, shiftCounts, guidelines, isRosterGenerated, getTotal])

  const renderedRows = useMemo(() => {
    const allRows: React.ReactNode[] = []

    Array.from(groupedData.entries()).forEach(([groupKey, rows]) => {
      if (!rows.length) return
      const isCollapsed = collapsedGroups.has(groupKey)
      const sortedRows =
        groupKey === "SSN/SN"
          ? [...rows].sort((a, b) => {
              const rankDelta = getSsnSnSortRank(a) - getSsnSnSortRank(b)
              if (rankDelta !== 0) return rankDelta
              return (a.name ?? "").localeCompare(b.name ?? "")
            })
          : groupKey === "EN/NA/HCA1/HCA2"
            ? [...rows].sort((a, b) => {
                const rankDelta = getEnNaHcaSortRank(a) - getEnNaHcaSortRank(b)
                if (rankDelta !== 0) return rankDelta
                return (a.name ?? "").localeCompare(b.name ?? "")
              })
            : [...rows].sort((a, b) =>
                (a.name ?? "").localeCompare(b.name ?? ""),
              )

      // Group Header Row
      allRows.push(
        <Table.Row
          key={`group-${groupKey}`}
          bg="#f8fafc"
          cursor="pointer"
          onClick={() => toggleGroup(groupKey)}
          _hover={{ bg: "#f1f5f9" }}
        >
          <Table.Cell colSpan={totalCols} py={2} px={3} w="100%">
            <HStack gap={2}>
              <Icon
                as={isCollapsed ? ChevronRight : ChevronDown}
                boxSize={4}
                color="faintforeground"
              />
              <Text fontSize="sm" color="foreground" fontWeight="medium">
                {groupKey}
              </Text>
            </HStack>
          </Table.Cell>
        </Table.Row>,
      )

      // Data Rows
      if (!isCollapsed) {
        sortedRows.forEach((row) => {
          allRows.push(
            <RosterGridRow
              key={row.nurseId}
              row={row}
              dayColumns={dayColumns}
              viewMode={viewMode}
              showLongServiceSnIcon={showLongServiceSnIcon}
              highlightedNurseIds={highlightedNurseIds}
              onNurseNameClick={onNurseNameClick}
              handleShiftClick={handleShiftClick}
              handleCommentIconClick={handleCommentIconClick}
              shiftRequestOverlays={shiftRequestOverlays}
              shiftDurationMap={shiftDurationMap}
              shiftTimeMap={shiftTimeMap}
            />,
          )
        })
      }
    })

    // Insert summary rows at the bottom of the grid
    if (showSummary) {
      allRows.push(...summaryRows)
    }

    return allRows
  }, [
    groupedData,
    collapsedGroups,
    toggleGroup,
    dayColumns,
    viewMode,
    highlightedNurseIds,
    onNurseNameClick,
    handleShiftClick,
    handleCommentIconClick,
    shiftRequestOverlays,
    shiftDurationMap,
    showSummary,
    summaryRows,
    totalCols,
    shiftTimeMap,
    showLongServiceSnIcon,
  ])

  return (
    <Box position="relative" w="100%">
      {/* Table Container */}
      <Box overflow="auto" w="100%">
        <Table.Root
          size="sm"
          variant="outline"
          w="100%"
          style={{ tableLayout: "fixed" }}
        >
          <Table.Header>
            <Table.Row borderBottom="1px solid" bg="white" color="foreground">
              {/* Name Column Header */}
              <Table.ColumnHeader
                w="160px"
                minW="160px"
                color="faintforeground"
                bg="white"
              >
                <HStack gap={2}>
                  <Text fontSize="sm" fontWeight="medium">
                    Name
                  </Text>
                  {/* Filter button */}
                  <NameFilterPopover
                    isFilterActive={isFilterActive}
                    selectedNames={selectedNames}
                    allNames={allNames}
                    onToggleName={toggleName}
                    onClearFilter={clearFilter}
                    onSelectAll={selectAll}
                  />
                </HStack>
              </Table.ColumnHeader>

              {/* Day Column Headers */}
              {dayColumns.map((col) => (
                <Table.ColumnHeader
                  key={col.field}
                  w={dayColumnWidth}
                  minW={dayColumnWidth}
                  textAlign="center"
                  color="faintforeground"
                  p={2}
                >
                  <Box>
                    <Text fontSize="sm" fontWeight="medium">
                      {col.dayOfWeek}
                    </Text>
                    <Text fontSize="xs" fontWeight="normal">
                      {moment(col.date).format("DD/MM")}
                    </Text>
                  </Box>
                </Table.ColumnHeader>
              ))}
            </Table.Row>
          </Table.Header>

          <Table.Body>{renderedRows}</Table.Body>
        </Table.Root>
      </Box>

      {/* Shift Edit Popover */}
      <ShiftEditPopover
        isOpen={popoverState.isOpen}
        onClose={handlePopoverClose}
        currentShift={popoverState.currentShift}
        nurseName={popoverState.nurseName}
        date={
          popoverState.date
            ? moment(popoverState.date).format("ddd, MMM DD")
            : ""
        }
        onShiftChange={handleShiftChange}
        onCommentChange={handleCommentChange}
        anchorEl={popoverState.anchorEl}
        wardId={wardId}
      />

      {/* Comment-only Popover (opened via comment icon click) */}
      <ShiftCommentPopover
        isOpen={commentPopoverState.isOpen}
        onClose={handleCommentPopoverClose}
        currentComment={commentPopoverState.currentComment}
        nurseName={commentPopoverState.nurseName}
        date={
          commentPopoverState.date
            ? moment(commentPopoverState.date).format("ddd, MMM DD")
            : ""
        }
        onCommentChange={handleCommentSaveFromIcon}
        anchorEl={commentPopoverState.anchorEl}
      />

      {/* Loading Overlay */}
      {isLoading && (
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="whiteAlpha.700"
          display="flex"
          alignItems="center"
          justifyContent="center"
          zIndex={10}
          flexDir={"column"}
        >
          <Spinner color="primary" />
          <Text color="gray.500">{loadingLabel}</Text>
        </Box>
      )}
    </Box>
  )
}

export default RosterGrid
