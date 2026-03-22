import React, { useState, useMemo, useCallback, useRef } from "react";
import {
  Box,
  Flex,
  Text,
  HStack,
  Table,
  Icon,
  Spinner,
  Input,
  Checkbox,
  Popover,
} from "@chakra-ui/react";
import {
  AlertCircle,
  Filter,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import moment from "moment";

import { ShiftBadge } from "./ShiftBadge";
import { ShiftEditPopover } from "./ShiftEditPopover";
import { ShiftCommentPopover } from "./ShiftCommentPopover";
import { calculateShiftCounts, getCellStyle } from "./ShiftSummaryTable";
import { MOCK_STAFFING_GUIDELINES, mapDesignationToRole } from "./staffingGuidelines";
import type {
  RosterRow,
  ShiftAssignment,
  ShiftCode,
  ViewMode,
  DayColumn,
  DailyStaffingGuideline,
  SummaryShiftType,
  StaffRole,
  ShiftRequestOverlay,
} from "./types";
import { Tooltip } from "@/components/ui/tooltip";

const SHIFT_TYPES: SummaryShiftType[] = ["A", "P", "N"];
const STAFF_ROLES: StaffRole[] = ["RN", "EN", "NA", "HCA12", "HCA3"];
const ROLE_LABEL: Record<StaffRole, string> = {
  RN: "RN",
  EN: "EN",
  NA: "NA",
  HCA12: "HCA1&2",
  HCA3: "HCA3",
};
const ROLE_GROUP_ORDER = ["SSN/SN", "EN/NA/HCA1/HCA2", "HCA3/PSA", "Other"] as const;
type RoleGroupKey = (typeof ROLE_GROUP_ORDER)[number];

interface RosterGridProps {
  data: RosterRow[];
  viewMode: ViewMode;
  currentStartDate: Date;
  onShiftChange: (
    nurseId: number,
    date: string,
    newShiftCode: ShiftCode,
  ) => void;
  onCommentChange?: (
    nurseId: number,
    date: string,
    comment: string,
  ) => void;
  isLoading?: boolean;
  guidelines?: DailyStaffingGuideline;
  isRosterGenerated?: boolean;
  showSummary?: boolean;
  shiftRequestOverlays?: Record<string, Record<string, ShiftRequestOverlay>>;
}

// Generate day columns based on view mode and start date
function generateDayColumns(startDate: Date, viewMode: ViewMode): DayColumn[] {
  const days = viewMode === "week" ? 7 : 14;
  const columns: DayColumn[] = [];

  for (let i = 0; i < days; i++) {
    const date = moment(startDate).add(i, "days");
    columns.push({
      field: `shift_${date.format("YYYY-MM-DD")}`,
      title: date.format("dddd"),
      date: date.toDate(),
      dayOfWeek: date.format("ddd"),
    });
  }

  return columns;
}

// Group data by designation (role)
function getRoleGroupKey(row: RosterRow): RoleGroupKey {
  const designation = (row.designation ?? "").toString();
  const d = designation.toLowerCase().trim();
  const role = row.staffingRole ?? mapDesignationToRole(designation);

  if (role === "RN") return "SSN/SN";
  if (role === "EN" || role === "NA" || role === "HCA12") return "EN/NA/HCA1/HCA2";
  if (role === "HCA3") return "HCA3/PSA";

  if (d === "ssn" || d === "sn" || d.includes("staff nurse") || d.includes("registered nurse")) {
    return "SSN/SN";
  }
  if (d === "en" || d.includes("enrolled nurse") || d === "na" || d.includes("nursing aide")) {
    return "EN/NA/HCA1/HCA2";
  }
  if (
    d === "hca1" ||
    d === "hca 1" ||
    d === "hca-1" ||
    d.includes("hca grade 1") ||
    d === "hca2" ||
    d === "hca 2" ||
    d === "hca-2" ||
    d.includes("hca grade 2") ||
    d === "hca"
  ) {
    return "EN/NA/HCA1/HCA2";
  }
  if (
    d === "hca3" ||
    d === "hca 3" ||
    d === "hca-3" ||
    d.includes("hca grade 3") ||
    d === "psa" ||
    d.includes("patient service assistant")
  ) {
    return "HCA3/PSA";
  }

  return "Other";
}

function groupByRoleGroup(data: RosterRow[]): Map<RoleGroupKey, RosterRow[]> {
  const groups = new Map<RoleGroupKey, RosterRow[]>();
  ROLE_GROUP_ORDER.forEach((key) => groups.set(key, []));

  data.forEach((row) => {
    const key = getRoleGroupKey(row);
    const existing = groups.get(key) || [];
    existing.push(row);
    groups.set(key, existing);
  });

  return groups;
}

function getDisplayTitle(row: RosterRow): string {
  const designation = (row.designation ?? "").toString();
  const d = designation.toLowerCase().trim();

  if (d === "ssn" || d.includes("senior staff nurse")) return "SSN";
  if (d === "sn" || (d.includes("staff nurse") && !d.includes("senior"))) return "SN";
  if (d === "rn" || d.includes("registered nurse")) return "RN";
  if (d === "en" || d.includes("enrolled nurse")) return "EN";
  if (d === "na" || d.includes("nursing aide")) return "NA";
  if (d === "hca1" || d === "hca 1" || d === "hca-1" || d.includes("hca grade 1")) return "HCA1";
  if (d === "hca2" || d === "hca 2" || d === "hca-2" || d.includes("hca grade 2")) return "HCA2";
  if (d === "hca3" || d === "hca 3" || d === "hca-3" || d.includes("hca grade 3")) return "HCA3";
  if (d === "psa" || d.includes("patient service assistant")) return "PSA";
  if (d === "hca" || d.includes("healthcare assistant")) return "HCA";

  if (row.staffingRole) {
    return row.staffingRole === "HCA12" ? "HCA1/2" : row.staffingRole;
  }

  return designation;
}

export function RosterGrid({
  data,
  viewMode,
  currentStartDate,
  onShiftChange,
  onCommentChange,
  isLoading = false,
  guidelines = MOCK_STAFFING_GUIDELINES,
  isRosterGenerated = false,
  showSummary = true,
  shiftRequestOverlays = {},
}: RosterGridProps) {
  // Popover state
  const [popoverState, setPopoverState] = useState<{
    isOpen: boolean;
    nurseId: number | null;
    date: string;
    nurseName: string;
    currentShift: ShiftAssignment | null;
    anchorEl: HTMLElement | null;
  }>({
    isOpen: false,
    nurseId: null,
    date: "",
    nurseName: "",
    currentShift: null,
    anchorEl: null,
  });

  // Comment-only popover state
  const [commentPopoverState, setCommentPopoverState] = useState<{
    isOpen: boolean;
    nurseId: number | null;
    date: string;
    nurseName: string;
    currentComment: string;
    anchorEl: HTMLElement | null;
  }>({
    isOpen: false,
    nurseId: null,
    date: "",
    nurseName: "",
    currentComment: "",
    anchorEl: null,
  });

  // Collapsed groups state - all groups start expanded
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  // Filter popover state
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const filterAnchorRef = useRef<HTMLDivElement>(null);

  // All unique nurse names sorted
  const allNames = useMemo(
    () => Array.from(new Set(data.map((r) => r.name))).sort(),
    [data],
  );

  // Names matching the search query
  const filteredNameOptions = useMemo(
    () =>
      allNames.filter((n) =>
        n.toLowerCase().includes(filterSearch.toLowerCase()),
      ),
    [allNames, filterSearch],
  );

  const isFilterActive = selectedNames.size > 0;

  const toggleName = useCallback((name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const clearFilter = useCallback(() => {
    setSelectedNames(new Set());
    setFilterSearch("");
  }, []);

  const selectAll = useCallback(() => {
    setSelectedNames(new Set(allNames));
  }, [allNames]);

  // Generate day columns
  const dayColumns = useMemo(
    () => generateDayColumns(currentStartDate, viewMode),
    [currentStartDate, viewMode],
  );

  // Apply name filter to data before grouping
  const filteredData = useMemo(
    () =>
      isFilterActive
        ? data.filter((r) => selectedNames.has(r.name))
        : data,
    [data, isFilterActive, selectedNames],
  );

  // Group data by designation (role) - always grouped
  const groupedData = useMemo(() => {
    return groupByRoleGroup(filteredData);
  }, [filteredData]);

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
      });
    },
    [],
  );

  // Handle popover close
  const handlePopoverClose = useCallback(() => {
    setPopoverState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Handle shift change from popover
  const handleShiftChange = useCallback(
    (newShiftCode: ShiftCode) => {
      if (popoverState.nurseId !== null) {
        onShiftChange(popoverState.nurseId, popoverState.date, newShiftCode);
      }
    },
    [popoverState.nurseId, popoverState.date, onShiftChange],
  );

  // Handle comment change from popover
  const handleCommentChange = useCallback(
    (comment: string) => {
      if (popoverState.nurseId !== null && onCommentChange) {
        onCommentChange(popoverState.nurseId, popoverState.date, comment);
      }
    },
    [popoverState.nurseId, popoverState.date, onCommentChange],
  );

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
      });
    },
    [],
  );

  // Handle comment popover close
  const handleCommentPopoverClose = useCallback(() => {
    setCommentPopoverState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Handle comment save from comment-only popover
  const handleCommentSaveFromIcon = useCallback(
    (comment: string) => {
      if (commentPopoverState.nurseId !== null && onCommentChange) {
        onCommentChange(commentPopoverState.nurseId, commentPopoverState.date, comment);
      }
    },
    [commentPopoverState.nurseId, commentPopoverState.date, onCommentChange],
  );

  // Toggle group collapse
  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  }, []);

  // Column width calculation
  const dayColumnWidth = viewMode === "week" ? "120px" : "80px";

  // Total columns: Name + Title + Day columns
  const totalCols = 2 + dayColumns.length;

  // Calculate shift counts for summary
  const shiftCounts = useMemo(
    () => calculateShiftCounts(filteredData, dayColumns),
    [filteredData, dayColumns],
  );

  // Calculate total for a specific shift type and date
  const getTotal = useCallback(
    (dateKey: string, shiftType: SummaryShiftType): number => {
      const dayCounts = shiftCounts.get(dateKey);
      if (!dayCounts) return 0;
      return STAFF_ROLES.reduce(
        (sum, role) => sum + dayCounts[role][shiftType],
        0,
      );
    },
    [shiftCounts],
  );

  // Render the embedded summary rows
  const renderSummaryRows = () => {
    const summaryRows: React.ReactNode[] = [];

    // Summary Header Row (A, P, N labels)
    summaryRows.push(
      <Table.Row
        key="summary-header"
        bg="white"
        borderTop="2px solid"
        borderColor="#7EC8D9"
      >
        <Table.Cell
          colSpan={2}
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
    );

    // Role Rows (RN, EN, HCA)
    STAFF_ROLES.forEach((role) => {
      summaryRows.push(
        <Table.Row
          key={`summary-${role}`}
          bg="white"
        >
          <Table.Cell
            colSpan={2}
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
            const dateKey = moment(col.date).format("YYYY-MM-DD");
            const dayCounts = shiftCounts.get(dateKey);

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
                    const count = dayCounts?.[role]?.[shiftType] ?? 0;
                    const style = getCellStyle(
                      count,
                      guidelines[role][shiftType].minimum,
                      isRosterGenerated,
                      guidelines[role][shiftType].maximum,
                    );

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
                    );
                  })}
                </Flex>
              </Table.Cell>
            );
          })}
        </Table.Row>,
      );
    });

    // Total Row
    summaryRows.push(
      <Table.Row
        key="summary-total"
        bg="#ADD8E6"
      >
        <Table.Cell
          colSpan={2}
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
          const dateKey = moment(col.date).format("YYYY-MM-DD");

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
                  const total = getTotal(dateKey, shiftType);
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
                  );
                })}
              </Flex>
            </Table.Cell>
          );
        })}
      </Table.Row>,
    );

    return summaryRows;
  };

  // Render grouped rows
  const renderRows = () => {
    const allRows: React.ReactNode[] = [];

    Array.from(groupedData.entries()).forEach(([groupKey, rows]) => {
      if (!rows.length) return;
      const isCollapsed = collapsedGroups.has(groupKey);

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
      );

      // Data Rows
      if (!isCollapsed) {
        rows.forEach((row) => {
          allRows.push(renderDataRow(row));
        });
      }
    });

    // Insert summary rows at the bottom of the grid
    if (showSummary) {
      allRows.push(...renderSummaryRows());
    }

    return allRows;
  };

  // Render a single data row
  const renderDataRow = (row: RosterRow) => (
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
        <HStack gap={2}>
          <Text fontSize="sm" fontWeight="medium">
            {row.name}
          </Text>
          {/* {row.hasWarning && (
            <Icon as={AlertCircle} boxSize={4} color="danger" />
          )} */}
          
        </HStack>
      </Table.Cell>

      {/* Title Cell */}
      <Table.Cell
        bg="white"
        borderRight="1px solid"
        borderColor="gray.200"
        py={2}
        px={2}
        w="90px"
        minW="90px"
      >
        <Text fontSize="xs" color="gray.600" fontWeight="semibold">
          {getDisplayTitle(row)}
        </Text>
      </Table.Cell>

      {/* Shift Cells */}
      {dayColumns.map((col) => {
        const dateKey = moment(col.date).format("YYYY-MM-DD");
        const shift = row.shifts[dateKey] || null;

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
                  handleShiftClick(row.nurseId, row.name, dateKey, shift, e)
                }
              >
                <ShiftBadge
                  shiftCode={shift?.shiftCode || null}
                  isEditable={true}
                  viewMode={viewMode}
                  comment={shift?.comment}
                  onCommentIconClick={(e) =>
                    handleCommentIconClick(row.nurseId, row.name, dateKey, shift, e)
                  }
                  shiftRequestOverlay={shiftRequestOverlays[String(row.nurseId)]?.[dateKey]}
                />
              </Box>
            </Flex>
          </Table.Cell>
        );
      })}
    </Table.Row>
  );

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
                        e.stopPropagation();
                        setFilterOpen((o) => !o);
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
                </HStack>

                {/* Name Filter Popover */}
                <Popover.Root
                  open={filterOpen}
                  onOpenChange={(d) => {
                    if (!d.open) {
                      setFilterOpen(false);
                      setFilterSearch("");
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
                              setFilterOpen(false);
                              setFilterSearch("");
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
                          onClick={selectAll}
                        >
                          Select all
                        </Box>
                        <Text fontSize="xs" color="gray.300">|</Text>
                        <Box
                          as="button"
                          fontSize="xs"
                          color="#4B8798"
                          cursor="pointer"
                          _hover={{ color: "#155E75", textDecoration: "underline" }}
                          onClick={clearFilter}
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
                            <Text fontSize="xs" color="gray.400">No names found</Text>
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
                                e.stopPropagation();
                                toggleName(name);
                              }}
                            >
                              <Checkbox.Root
                                size="sm"
                                checked={selectedNames.has(name)}
                                onCheckedChange={() => toggleName(name)}
                                onClick={(e) => e.stopPropagation()}
                                colorPalette="cyan"
                              >
                                <Checkbox.HiddenInput />
                                <Checkbox.Control
                                  borderColor={selectedNames.has(name) ? "#0e7490" : "gray.300"}
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
              </Table.ColumnHeader>

              {/* Title Column Header */}
              <Table.ColumnHeader
                w="90px"
                minW="90px"
                color="faintforeground"
                bg="white"
              >
                <Text fontSize="sm" fontWeight="medium">
                  Title
                </Text>
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

          <Table.Body>{renderRows()}</Table.Body>
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
          <Text color="gray.500">Loading roster data...</Text>
        </Box>
      )}
    </Box>
  );
}

export default RosterGrid;
