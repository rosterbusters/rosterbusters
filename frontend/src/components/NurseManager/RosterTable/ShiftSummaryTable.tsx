import React, { useMemo } from "react";
import { Box, Flex, Text, Table } from "@chakra-ui/react";
import moment from "moment";
import { Tooltip } from "@/components/ui/tooltip";

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
  /** When false, all cells are neutral (no color). When true, cells show green/red based on thresholds. */
  isRosterGenerated?: boolean;
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
export interface DayShiftCounts {
  RN: { A: number; P: number; N: number };
  EN: { A: number; P: number; N: number };
  NA: { A: number; P: number; N: number };
  HCA12: { A: number; P: number; N: number };
  HCA3: { A: number; P: number; N: number };
}

// Calculate shift counts per day from roster data
export function calculateShiftCounts(
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
      NA: { A: 0, P: 0, N: 0 },
      HCA12: { A: 0, P: 0, N: 0 },
      HCA3: { A: 0, P: 0, N: 0 },
    });
  });

  // Count shifts for each nurse
  data.forEach((row) => {
    const role = mapDesignationToRole(row.designation);
    if (!role) return;

    Object.entries(row.shifts).forEach(([dateKey, shift]) => {
      if (!shift || !counts.has(dateKey)) return;

      const summaryType = mapShiftCodeToSummaryType(shift.shiftCode);
      if (!summaryType) return;

      const dayCounts = counts.get(dateKey)!;
      dayCounts[role][summaryType]++;
    });
  });

  return counts;
}

// Get cell styling based on count vs minimum requirement
export function getCellStyle(
  count: number,
  minimum: number,
  isRosterGenerated: boolean,
  maximum?: number,
): { bg: string; color: string } {
  if (!isRosterGenerated) {
    return { bg: "transparent", color: "#65A30D" };
  }
  if (count < minimum) {
    return { bg: "#BE123C", color: "white" };          // Red — below minimum
  }
  if (maximum !== undefined && count > maximum) {
    return { bg: "#65A30D", color: "white" };          // Green — above maximum (surplus)
  }
  return { bg: "white", color: "#4B8798" };            // White — within [min, max]
}

const SHIFT_TYPES: SummaryShiftType[] = ["A", "P", "N"];
const STAFF_ROLES: StaffRole[] = ["RN", "EN", "NA", "HCA12", "HCA3"];
const ROLE_LABEL: Record<StaffRole, string> = {
  RN: "RN",
  EN: "EN",
  NA: "NA",
  HCA12: "HCA1&2",
  HCA3: "HCA3",
};

export function ShiftSummaryTable({
  data,
  viewMode,
  currentStartDate,
  guidelines = MOCK_STAFFING_GUIDELINES,
  labelColumnWidth: labelColWidthProp = "160px",
  isRosterGenerated = false,
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

  return (
    <Box
      position="sticky"
      bottom={0}
      bg="white"
      border="2px solid"
      borderColor="#06B6D4"
      boxShadow="0 -4px 6px -1px rgba(0, 0, 0, 0.1)"
      w="100%"
      flexShrink={0}
      zIndex={10}
      borderRadius="sm"
      overflow="hidden"
    >
      <Table.Root size="sm" w="100%" style={{ tableLayout: "fixed" }}>
        {/* Header Row - Shift Type Labels (A, P, N) */}
        <Table.Header>
          <Table.Row>
            {/* Empty cell for role label column */}
            <Table.ColumnHeader
              w={labelColumnWidth}
              minW={labelColumnWidth}
              borderRight="1px solid"
              borderColor="gray.200"
              p={1}
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
                p={0}
                bg="white"
              >
                <Flex justify="space-around">
                  {SHIFT_TYPES.map((type) => (
                    <Text
                      key={type}
                      fontSize="xs"
                      fontWeight="semibold"
                      color="primary"
                      flex={1}
                      textAlign="center"
                      py={1}
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
            <Table.Row key={role}>
              {/* Role Label */}
              <Table.Cell
                fontWeight="semibold"
                fontSize="xs"
                color="primary"
                borderRight="1px solid"
                borderColor="gray.200"
                py={1}
                px={2}
                textAlign="right"
                bg="white"
              >
                {ROLE_LABEL[role]}
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
                          <Tooltip
                            key={shiftType}
                            content={
                              <Text fontSize="xs">
                                Min: {guidelines[role][shiftType].minimum}
                                {guidelines[role][shiftType].maximum !== undefined
                                  ? `  Max: ${guidelines[role][shiftType].maximum}`
                                  : ""}
                              </Text>
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
                            <Flex
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
                          </Tooltip>
                        );
                      })}
                    </Flex>
                  </Table.Cell>
                );
              })}
            </Table.Row>
          ))}

          {/* Total Row */}
          <Table.Row bg="menuactive">
            {/* Total Label */}
            <Table.Cell
              fontWeight="bold"
              fontSize="xs"
              color="primary"
              borderRight="1px solid"
              borderColor="rgba(255,255,255,0.3)"
              py={1}
              px={2}
              textAlign="right"
              bg="menuactive"
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
                  borderColor="rgba(255,255,255,0.3)"
                  p={0}
                  bg="menuactive"
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
                          color="primary"
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
