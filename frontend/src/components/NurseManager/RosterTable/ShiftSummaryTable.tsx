import { useMemo, useState } from "react";
import { Box, Flex, Text, Table, VStack } from "@chakra-ui/react";
import moment from "moment";
import { Tooltip } from "@/components/ui/tooltip";
import { ManpowerEditDialog } from "./ManpowerEditDialog";

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
  getRosterGroupKey,
  isPsaDesignation,
  mapShiftCodeToSummaryType,
  mapDesignationToRole,
} from "./staffingGuidelines";

interface ShiftSummaryTableProps {
  data: RosterRow[];
  viewMode: ViewMode;
  currentStartDate: Date;
  guidelines?: DailyStaffingGuideline;
  /** Per-date overrides that take precedence over base guidelines for a specific day. */
  dateOverrides?: Record<string, DailyStaffingGuideline>;
  /** Original unmodified ward defaults — used to detect resets and clear the modified indicator. */
  originalGuidelines?: DailyStaffingGuideline;
  /** Combined width of name + hours columns from RosterGrid (default: 260px) */
  labelColumnWidth?: string;
  /** When false, all cells are neutral (no color). When true, cells show green/red based on thresholds. */
  isRosterGenerated?: boolean;
  /** Called when user saves new min/max for all days; parent should update guidelines state. */
  onGuidelinesChange?: (updated: DailyStaffingGuideline) => void;
  /** Called when user saves new min/max for a specific date only. */
  onDateOverrideChange?: (dateKey: string, updated: DailyStaffingGuideline) => void;
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

const SUMMARY_GROUPS: Array<{
  key: string;
  label: string;
  groupKey: "SSN/SN" | "EN/NA/HCA1/HCA2" | "HCA3";
  requirementRole: StaffRole;
}> = [
  { key: "group-a", label: "SSN/SN", groupKey: "SSN/SN", requirementRole: "RN" },
  {
    key: "group-b",
    label: "EN/NA/HCA1/HCA2",
    groupKey: "EN/NA/HCA1/HCA2",
    requirementRole: "EN",
  },
  { key: "group-c", label: "HCA3", groupKey: "HCA3", requirementRole: "HCA3" },
];

function resolveStaffRole(row: RosterRow): StaffRole | null {
  return row.staffingRole ?? mapDesignationToRole(row.designation ?? "");
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
    const role = resolveStaffRole(row);
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

function getGroupedShiftCount(
  data: RosterRow[],
  groupKey: "SSN/SN" | "EN/NA/HCA1/HCA2" | "HCA3",
  dateKey: string,
  shiftType: SummaryShiftType,
): number {
  return data.reduce((sum, row) => {
    if (getRosterGroupKey(row) !== groupKey) return sum;

    const shift = row.shifts[dateKey];
    if (!shift) return sum;

    return mapShiftCodeToSummaryType(shift.shiftCode) === shiftType ? sum + 1 : sum;
  }, 0);
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
/** All roles — used for total row calculation only. */
const ALL_STAFF_ROLES: StaffRole[] = ["RN", "EN", "NA", "HCA12", "HCA3"];

export function ShiftSummaryTable({
  data,
  viewMode,
  currentStartDate,
  guidelines = MOCK_STAFFING_GUIDELINES,
  dateOverrides = {},
  originalGuidelines,
  labelColumnWidth: labelColWidthProp = "160px",
  isRosterGenerated = false,
  onGuidelinesChange,
  onDateOverrideChange,
}: ShiftSummaryTableProps) {
  const dataWithoutPSA = useMemo(
    () => data.filter((row) => !isPsaDesignation(row.designation ?? "")),
    [data],
  );
  const [selectedCell, setSelectedCell] = useState<{
    role: StaffRole;
    shiftType: SummaryShiftType;
    dateKey: string;
    dateLabel: string;
  } | null>(null);
  const [modifiedCells, setModifiedCells] = useState<Set<string>>(new Set());

  // Generate day columns
  const dayColumns = useMemo(
    () => generateDayColumns(currentStartDate, viewMode),
    [currentStartDate, viewMode],
  );

  // Calculate shift counts
  const shiftCounts = useMemo(
    () => calculateShiftCounts(dataWithoutPSA, dayColumns),
    [dataWithoutPSA, dayColumns],
  );

  const handleSave = (min: number, max: number | undefined, applyToAllDays: boolean) => {
    if (!selectedCell) return;
    const { role, shiftType, dateKey } = selectedCell;

    // Determine whether values are being reset to the original ward default
    const orig = (originalGuidelines ?? guidelines)[role][shiftType];
    const isRestoringDefault = min === orig.minimum && max === orig.maximum;
    const cellKey = applyToAllDays
      ? `${role}-${shiftType}`
      : `${dateKey}-${role}-${shiftType}`;

    if (applyToAllDays) {
      if (!onGuidelinesChange) return;
      onGuidelinesChange({
        ...guidelines,
        [role]: {
          ...guidelines[role],
          [shiftType]: { minimum: min, maximum: max },
        },
      });
    } else {
      if (!onDateOverrideChange) return;
      const base = dateOverrides[dateKey] ?? guidelines;
      onDateOverrideChange(dateKey, {
        ...base,
        [role]: {
          ...base[role],
          [shiftType]: { minimum: min, maximum: max },
        },
      });
    }

    // Add or remove the modified indicator depending on whether it's a reset
    setModifiedCells((prev) => {
      const next = new Set(prev);
      if (isRestoringDefault) next.delete(cellKey);
      else next.add(cellKey);
      return next;
    });
  };

  // Column width calculation - must match RosterGrid
  const dayColumnWidth = viewMode === "week" ? "120px" : "80px";
  const labelColumnWidth = labelColWidthProp;

  // Calculate total for a specific shift type and date
  const getTotal = (dateKey: string, shiftType: SummaryShiftType): number => {
    const dayCounts = shiftCounts.get(dateKey);
    if (!dayCounts) return 0;
    return ALL_STAFF_ROLES.reduce(
      (sum, role) => sum + dayCounts[role][shiftType],
      0,
    );
  };

  const getGroupedRequirement = (
    effectiveGuidelines: DailyStaffingGuideline,
    role: StaffRole,
    shiftType: SummaryShiftType,
  ) => effectiveGuidelines[role][shiftType];

  return (
    <>
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
          {/* Grouped rows aligned with RosterGrid */}
          {SUMMARY_GROUPS.map((group) => (
            <Table.Row key={group.key}>
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
                {group.label}
              </Table.Cell>

              {/* Shift counts for each day */}
              {dayColumns.map((col) => {
                const dateKey = moment(col.date).format("YYYY-MM-DD");
                const effectiveGuidelines = dateOverrides[dateKey] ?? guidelines;

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
                        const count = getGroupedShiftCount(
                          dataWithoutPSA,
                          group.groupKey,
                          dateKey,
                          shiftType,
                        );
                        const requirement = getGroupedRequirement(
                          effectiveGuidelines,
                          group.requirementRole,
                          shiftType,
                        );
                        const style = getCellStyle(
                          count,
                          requirement.minimum,
                          isRosterGenerated,
                          requirement.maximum,
                        );

                        const editableRole = group.requirementRole;
                        const isEditable =
                          editableRole !== null &&
                          (!!onGuidelinesChange || !!onDateOverrideChange);
                        const isModified =
                          editableRole !== null &&
                          (modifiedCells.has(`${editableRole}-${shiftType}`) ||
                            modifiedCells.has(`${dateKey}-${editableRole}-${shiftType}`));

                        return (
                          <Tooltip
                            key={shiftType}
                            content={
                              <VStack align="start" gap={0}>
                                <Text fontSize="xs">Min: {requirement.minimum}</Text>
                                <Text fontSize="xs">
                                  Max: {requirement.maximum ?? "-"}
                                </Text>
                              </VStack>
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
                              cursor={isEditable ? "pointer" : "default"}
                              outline={isModified ? "2px solid #4CAF50" : undefined}
                              outlineOffset="-2px"
                              _hover={
                                isEditable
                                  ? { opacity: 0.75, outline: "2px solid #4B8798", outlineOffset: "-2px" }
                                  : undefined
                              }
                              onClick={
                                isEditable
                                  ? () =>
                                      setSelectedCell({
                                        role: editableRole,
                                        shiftType,
                                        dateKey,
                                        dateLabel: moment(col.date).format("ddd, MMM D"),
                                      })
                                  : undefined
                              }
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

    {selectedCell && (
      <ManpowerEditDialog
        isOpen={true}
        onClose={() => setSelectedCell(null)}
        role={selectedCell.role}
        shiftType={selectedCell.shiftType}
        dateLabel={selectedCell.dateLabel}
        currentMin={
          (dateOverrides[selectedCell.dateKey] ?? guidelines)[selectedCell.role][selectedCell.shiftType].minimum
        }
        currentMax={
          (dateOverrides[selectedCell.dateKey] ?? guidelines)[selectedCell.role][selectedCell.shiftType].maximum
        }
        originalMin={
          (originalGuidelines ?? guidelines)[selectedCell.role][selectedCell.shiftType].minimum
        }
        originalMax={
          (originalGuidelines ?? guidelines)[selectedCell.role][selectedCell.shiftType].maximum
        }
        onSave={handleSave}
      />
    )}
  </>
  );
}

export default ShiftSummaryTable;
