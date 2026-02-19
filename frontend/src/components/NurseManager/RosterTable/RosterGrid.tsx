import React, { useState, useMemo, useCallback } from "react";
import {
  Box,
  Flex,
  Text,
  HStack,
  Stack,
  Table,
  Icon,
  Spinner,
} from "@chakra-ui/react";
import {
  AlertCircle,
  Clock,
  Filter,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import moment from "moment";
import { CircleQuestionMark } from "lucide-react";

import { ShiftBadge } from "./ShiftBadge";
import { ShiftEditPopover } from "./ShiftEditPopover";
import { calculateShiftCounts, getCellStyle } from "./ShiftSummaryTable";
import { MOCK_STAFFING_GUIDELINES } from "./staffingGuidelines";
import type {
  RosterRow,
  ShiftAssignment,
  ShiftCode,
  ViewMode,
  DayColumn,
  DailyStaffingGuideline,
  SummaryShiftType,
  StaffRole,
} from "./types";
import { Tooltip } from "@/components/ui/tooltip";

const SHIFT_TYPES: SummaryShiftType[] = ["A", "P", "N"];
const STAFF_ROLES: StaffRole[] = ["RN", "EN", "HCA"];

interface RosterGridProps {
  data: RosterRow[];
  viewMode: ViewMode;
  currentStartDate: Date;
  onShiftChange: (
    nurseId: number,
    date: string,
    newShiftCode: ShiftCode,
  ) => void;
  isLoading?: boolean;
  guidelines?: DailyStaffingGuideline;
  isRosterGenerated?: boolean;
  showSummary?: boolean;
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
function groupByDesignation(data: RosterRow[]): Map<string, RosterRow[]> {
  const groups = new Map<string, RosterRow[]>();

  data.forEach((row) => {
    const key = row.designation;
    const existing = groups.get(key) || [];
    existing.push(row);
    groups.set(key, existing);
  });

  return groups;
}

export function RosterGrid({
  data,
  viewMode,
  currentStartDate,
  onShiftChange,
  isLoading = false,
  guidelines = MOCK_STAFFING_GUIDELINES,
  isRosterGenerated = false,
  showSummary = true,
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

  // Collapsed groups state - all groups start expanded
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  // Generate day columns
  const dayColumns = useMemo(
    () => generateDayColumns(currentStartDate, viewMode),
    [currentStartDate, viewMode],
  );

  // Group data by designation (role) - always grouped
  const groupedData = useMemo(() => {
    return groupByDesignation(data);
  }, [data]);

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

  // Total columns: Name + Hours + Day columns
  const totalCols = 2 + dayColumns.length;

  // Calculate shift counts for summary
  const shiftCounts = useMemo(
    () => calculateShiftCounts(data, dayColumns),
    [data, dayColumns],
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
            {role}
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
          {row.hasWarning && (
            <Icon as={AlertCircle} boxSize={4} color="danger" />
          )}
        </HStack>
      </Table.Cell>

      {/* Hours Cell - worked in red if over contracted */}
      <Table.Cell
        borderRight="1px solid"
        borderColor="gray.200"
        py={2}
        px={3}
        w="100px"
        minW="100px"
      >
        <HStack gap={1}>
          <Icon
            as={Clock}
            boxSize={3}
            color={row.hasOvertime ? "danger" : "inherit"}
          />
          <HStack gap={0}>
            <Text
              fontSize="sm"
              color={row.hasOvertime ? "danger" : undefined}
              fontWeight="medium"
            >
              {row.hours.worked}
            </Text>
            <Text
              fontSize="sm"
              fontWeight="medium"
              color={row.hasOvertime ? "danger" : undefined}
            >
              &nbsp;/ {row.hours.contracted}
            </Text>
          </HStack>
        </HStack>
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
          zIndex="1"
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
                  <Icon as={Filter} boxSize={4} />
                </HStack>
              </Table.ColumnHeader>

              {/* Hours Column Header */}
              <Table.ColumnHeader
                w="100px"
                minW="100px"
                color="faintforeground"
                bg="white"
              >
                <HStack gap={2}>
                  <Text fontSize="sm" fontWeight="medium">
                    Hours
                  </Text>
                  <Tooltip
                    content={
                      <Stack gap={1}>
                        {[
                          { color: "alert", text: `Under ${viewMode === "week" ? 42 : 84} hours` },
                          { color: "danger", text: `Above ${viewMode === "week" ? 44 : 88} hours` },
                        ].map((item) => (
                          <HStack key={item.text} gap={2}>
                            <Box borderRadius="full" w={2} h={2} bg={item.color} flexShrink={0} />
                            <Text fontSize="xs">{item.text}</Text>
                          </HStack>
                        ))}
                      </Stack>
                    }
                    lazyMount={true}
                    contentProps={{
                      css: {
                        "--tooltip-bg": "white",
                        "box-shadow": "0px 0px 4px rgba(0,0,0,0.1)",
                        color: "black",
                      },
                    }}
                  >
                    <Icon as={CircleQuestionMark} boxSize={4} />
                  </Tooltip>
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
        anchorEl={popoverState.anchorEl}
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
