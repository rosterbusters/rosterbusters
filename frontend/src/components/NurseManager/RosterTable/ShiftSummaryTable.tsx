import React, { useMemo } from "react";
import { Box, Flex, Text, Table } from "@chakra-ui/react";
import moment from "moment";

import type {
  RosterRow,
  ViewMode,
  DayColumn,
  DailyStaffingGuideline,
  SummaryShiftType,
  StaffRole,
} from "./types";
import {
  MOCK_STAFFING_GUIDELINES,
  mapDesignationToRole,
  mapShiftCodeToSummaryType,
} from "./staffingGuidelines";

interface ShiftSummaryTableProps {
  data: RosterRow[];
  viewMode: ViewMode;
  currentStartDate: Date;
  guidelines?: DailyStaffingGuideline;
  /** Combined width of name + hours columns from RosterGrid (default: 260px) */
  labelColumnWidth?: string;
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

// Shift counts structure for a day
interface DayShiftCounts {
  RN: { A: number; P: number; N: number };
  EN: { A: number; P: number; N: number };
  HCA: { A: number; P: number; N: number };
}

// Calculate shift counts per day from roster data
function calculateShiftCounts(
  data: RosterRow[],
  dayColumns: DayColumn[],
): Map<string, DayShiftCounts> {
  const counts = new Map<string, DayShiftCounts>();

  // Initialize counts for each day
  dayColumns.forEach((col) => {
    const dateKey = moment(col.date).format("YYYY-MM-DD");
    counts.set(dateKey, {
      RN: { A: 0, P: 0, N: 0 },
      EN: { A: 0, P: 0, N: 0 },
      HCA: { A: 0, P: 0, N: 0 },
    });
  });

  // Count shifts for each nurse
  data.forEach((row) => {
    const role = mapDesignationToRole(row.designation);
    if (!role) return; // Skip unknown designations

    Object.entries(row.shifts).forEach(([dateKey, shift]) => {
      if (!shift || !counts.has(dateKey)) return;

      const summaryType = mapShiftCodeToSummaryType(shift.shiftCode);
      if (!summaryType) return; // Skip non-working shifts

      const dayCounts = counts.get(dateKey)!;
      dayCounts[role][summaryType]++;
    });
  });

  return counts;
}

// Get cell background color based on count vs minimum requirement
function getCellColor(
  count: number,
  minimum: number,
): { bg: string; color: string } {
  if (count < minimum) {
    return { bg: "#DC2626", color: "white" }; // Red - below minimum
  }
  return { bg: "#16A34A", color: "white" }; // Green - at or above minimum
}

// Get total row cell color (neutral styling)
function getTotalCellColor(): { bg: string; color: string } {
  return { bg: "#0891B2", color: "white" }; // Cyan for totals
}

const SHIFT_TYPES: SummaryShiftType[] = ["A", "P", "N"];
const STAFF_ROLES: StaffRole[] = ["RN", "EN", "HCA"];

export function ShiftSummaryTable({
  data,
  viewMode,
  currentStartDate,
  guidelines = MOCK_STAFFING_GUIDELINES,
  labelColumnWidth: labelColWidthProp = "260px",
}: ShiftSummaryTableProps) {
  // Generate day columns
  const dayColumns = useMemo(
    () => generateDayColumns(currentStartDate, viewMode),
    [currentStartDate, viewMode],
  );

  // Calculate shift counts
  const shiftCounts = useMemo(
    () => calculateShiftCounts(data, dayColumns),
    [data, dayColumns],
  );

  // Column width calculation - must match RosterGrid
  const dayColumnWidth = viewMode === "week" ? "120px" : "80px";
  const labelColumnWidth = labelColWidthProp;

  // Calculate total for a specific shift type and date
  const getTotal = (dateKey: string, shiftType: SummaryShiftType): number => {
    const dayCounts = shiftCounts.get(dateKey);
    if (!dayCounts) return 0;
    return STAFF_ROLES.reduce(
      (sum, role) => sum + dayCounts[role][shiftType],
      0,
    );
  };

  // Render a count cell with appropriate color
  const renderCountCell = (
    count: number,
    role: StaffRole,
    shiftType: SummaryShiftType,
    isTotal = false,
  ) => {
    const colors = isTotal
      ? getTotalCellColor()
      : getCellColor(count, guidelines[role][shiftType].minimum);

    return (
      <Flex
        justify="center"
        align="center"
        bg={colors.bg}
        color={colors.color}
        borderRadius="md"
        w="28px"
        h="24px"
        fontSize="xs"
        fontWeight="bold"
      >
        {count}
      </Flex>
    );
  };

  return (
    <Box
      position="sticky"
      bottom={0}
      left={0}
      right={0}
      bg="white"
      borderTop="2px solid"
      borderColor="cyan.600"
      boxShadow="0 -4px 6px -1px rgba(0, 0, 0, 0.1)"
      w="100%"
      flexShrink={0}
      zIndex={10}
    >
      <Table.Root
        size="sm"
        variant="outline"
        w="100%"
        style={{ tableLayout: "fixed" }}
      >
        {/* Header Row - Shift Type Labels (A, P, N) */}
        <Table.Header>
          <Table.Row bg="white">
            {/* Empty cell for role label column - spans Name + Hours columns */}
            <Table.ColumnHeader
              w={labelColumnWidth}
              minW={labelColumnWidth}
              borderRight="1px solid"
              borderColor="gray.200"
              p={2}
              bg="white"
            />

            {/* Day columns with A, P, N sub-headers */}
            {dayColumns.map((col) => (
              <Table.ColumnHeader
                key={col.field}
                w={dayColumnWidth}
                minW={dayColumnWidth}
                textAlign="center"
                borderRight="1px solid"
                borderColor="gray.100"
                p={2}
                bg="white"
              >
                <Flex justify="space-around" gap={1}>
                  {SHIFT_TYPES.map((type) => (
                    <Text
                      key={type}
                      fontSize="xs"
                      fontWeight="bold"
                      color="gray.700"
                      w="28px"
                      textAlign="center"
                    >
                      {type}
                    </Text>
                  ))}
                </Flex>
              </Table.ColumnHeader>
            ))}
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {/* Role Rows (RN, EN, HCA) */}
          {STAFF_ROLES.map((role) => (
            <Table.Row key={role} bg="white">
              {/* Role Label */}
              <Table.Cell
                fontWeight="bold"
                fontSize="sm"
                color="gray.700"
                borderRight="1px solid"
                borderColor="gray.200"
                p={2}
                textAlign="right"
                pr={4}
              >
                {role}
              </Table.Cell>

              {/* Shift counts for each day */}
              {dayColumns.map((col) => {
                const dateKey = moment(col.date).format("YYYY-MM-DD");
                const dayCounts = shiftCounts.get(dateKey);

                return (
                  <Table.Cell
                    key={col.field}
                    textAlign="center"
                    borderRight="1px solid"
                    borderColor="gray.50"
                    p={2}
                  >
                    <Flex justify="space-around" gap={1}>
                      {SHIFT_TYPES.map((shiftType) => (
                        <Box key={shiftType}>
                          {renderCountCell(
                            dayCounts?.[role]?.[shiftType] ?? 0,
                            role,
                            shiftType,
                          )}
                        </Box>
                      ))}
                    </Flex>
                  </Table.Cell>
                );
              })}
            </Table.Row>
          ))}

          {/* Total Row */}
          <Table.Row bg="gray.50">
            {/* Total Label */}
            <Table.Cell
              fontWeight="bold"
              fontSize="sm"
              color="gray.800"
              borderRight="1px solid"
              borderColor="gray.200"
              p={2}
              textAlign="right"
              pr={4}
            >
              Total
            </Table.Cell>

            {/* Total counts for each day */}
            {dayColumns.map((col) => {
              const dateKey = moment(col.date).format("YYYY-MM-DD");

              return (
                <Table.Cell
                  key={col.field}
                  textAlign="center"
                  borderRight="1px solid"
                  borderColor="gray.50"
                  p={2}
                >
                  <Flex justify="space-around" gap={1}>
                    {SHIFT_TYPES.map((shiftType) => {
                      const total = getTotal(dateKey, shiftType);
                      return (
                        <Flex
                          key={shiftType}
                          justify="center"
                          align="center"
                          bg="#0891B2"
                          color="white"
                          borderRadius="md"
                          w="28px"
                          h="24px"
                          fontSize="xs"
                          fontWeight="bold"
                        >
                          {total}
                        </Flex>
                      );
                    })}
                  </Flex>
                </Table.Cell>
              );
            })}
          </Table.Row>
        </Table.Body>
      </Table.Root>
    </Box>
  );
}

export default ShiftSummaryTable;
