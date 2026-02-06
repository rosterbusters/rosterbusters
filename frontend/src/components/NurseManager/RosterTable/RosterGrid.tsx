import React, { useState, useMemo, useCallback } from "react";
import {
  Box,
  Flex,
  Text,
  HStack,
  Table,
  Icon,
} from "@chakra-ui/react";
import { AlertCircle, Clock, Filter, ChevronDown, ChevronRight } from "lucide-react";
import moment from "moment";

import { ShiftBadge } from "./ShiftBadge";
import { ShiftEditPopover } from "./ShiftEditPopover";
import type {
  RosterRow,
  ShiftAssignment,
  ShiftCode,
  ViewMode,
  DayColumn,
} from "./types";

interface RosterGridProps {
  data: RosterRow[];
  viewMode: ViewMode;
  currentStartDate: Date;
  onShiftChange: (nurseId: number, date: string, newShiftCode: ShiftCode) => void;
  isLoading?: boolean;
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Generate day columns
  const dayColumns = useMemo(
    () => generateDayColumns(currentStartDate, viewMode),
    [currentStartDate, viewMode]
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
      event: React.MouseEvent<HTMLDivElement>
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
    []
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
    [popoverState.nurseId, popoverState.date, onShiftChange]
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
                color="gray.500"
              />
              <Text fontSize="sm" fontWeight="semibold" color="gray.700">
                {groupKey}
              </Text>
            </HStack>
          </Table.Cell>
        </Table.Row>
      );

      // Data Rows
      if (!isCollapsed) {
        rows.forEach((row) => {
          allRows.push(renderDataRow(row));
        });
      }
    });

    return allRows;
  };

  // Render a single data row
  const renderDataRow = (row: RosterRow) => (
    <Table.Row
      key={row.nurseId}
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
          <Text fontSize="sm" fontWeight="medium" color="gray.700">
            {row.name}
          </Text>
          {row.hasWarning && (
            <Icon as={AlertCircle} boxSize={4} color="orange.400" />
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
          {row.hasOvertime && (
            <Icon as={Clock} boxSize={3} color="orange.400" />
          )}
          <HStack gap={0}>
            <Text
              fontSize="sm"
              color={row.hasOvertime ? "red.500" : "gray.600"}
              fontWeight={row.hasOvertime ? "semibold" : "normal"}
            >
              {row.hours.worked}
            </Text>
            <Text fontSize="sm" color="gray.600">
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
                <ShiftBadge shiftCode={shift?.shiftCode || null} isEditable={true} viewMode={viewMode} />
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
      <Box overflow="auto" maxH="calc(100vh - 300px)" w="100%">
        <Table.Root size="sm" variant="outline" w="100%" style={{ tableLayout: "fixed" }}>
          <Table.Header>
            <Table.Row bg="gray.50">
              {/* Name Column Header */}
              <Table.ColumnHeader
                w="160px"
                minW="160px"
                borderRight="1px solid"
                borderColor="gray.200"
                bg="gray.50"
              >
                <HStack gap={1}>
                  <Text fontSize="sm" fontWeight="medium" color="gray.600">
                    Name
                  </Text>
                  <Icon as={Filter} boxSize={3} color="gray.400" />
                </HStack>
              </Table.ColumnHeader>

              {/* Hours Column Header */}
              <Table.ColumnHeader
                w="100px"
                minW="100px"
                borderRight="1px solid"
                borderColor="gray.200"
                bg="gray.50"
              >
                <HStack gap={1}>
                  <Icon as={Clock} boxSize={3} color="gray.400" />
                  <Text fontSize="sm" fontWeight="medium" color="gray.600">
                    Hours
                  </Text>
                </HStack>
              </Table.ColumnHeader>

              {/* Day Column Headers */}
              {dayColumns.map((col) => (
                <Table.ColumnHeader
                  key={col.field}
                  w={dayColumnWidth}
                  minW={dayColumnWidth}
                  textAlign="center"
                  bg="gray.50"
                  borderRight="1px solid"
                  borderColor="gray.100"
                  p={2}
                >
                  <Box>
                    <Text fontSize="sm" fontWeight="medium" color="gray.700">
                      {col.title}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      {moment(col.date).format("DD/MM/YYYY")}
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
        date={popoverState.date ? moment(popoverState.date).format("ddd, MMM DD") : ""}
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
        >
          <Text color="gray.500">Loading roster data...</Text>
        </Box>
      )}
    </Box>
  );
}

export default RosterGrid;
