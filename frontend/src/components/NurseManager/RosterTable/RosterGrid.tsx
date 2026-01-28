import React, { useState, useMemo, useCallback, DragEvent } from "react";
import {
  Box,
  Flex,
  Text,
  HStack,
  Table,
  Icon,
} from "@chakra-ui/react";
import { AlertCircle, Clock, Filter, HelpCircle, ChevronDown, ChevronRight, GripVertical, X } from "lucide-react";
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

// Groupable columns configuration
type GroupableColumn = "name" | "designation" | "hours";

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

// Group data by a specific field
function groupByField(data: RosterRow[], field: GroupableColumn): Map<string, RosterRow[]> {
  const groups = new Map<string, RosterRow[]>();

  data.forEach((row) => {
    let key: string;
    if (field === "name") {
      key = row.name;
    } else if (field === "designation") {
      key = row.designation;
    } else {
      // Group by contracted hours
      key = `${row.hours.contracted} hrs contracted`;
    }
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

  // Grouping state
  const [groupByColumns, setGroupByColumns] = useState<GroupableColumn[]>(["designation"]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Collapsed groups state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Generate day columns
  const dayColumns = useMemo(
    () => generateDayColumns(currentStartDate, viewMode),
    [currentStartDate, viewMode]
  );

  // Group data based on groupByColumns
  const groupedData = useMemo(() => {
    if (groupByColumns.length === 0) {
      return null; // No grouping - flat list
    }
    return groupByField(data, groupByColumns[0]);
  }, [data, groupByColumns]);

  // Check if a column is currently used for grouping
  const isColumnGrouped = (column: GroupableColumn) => groupByColumns.includes(column);

  // Handle drag start
  const handleDragStart = (e: DragEvent<HTMLDivElement>, column: GroupableColumn) => {
    e.dataTransfer.setData("text/plain", column);
    e.dataTransfer.effectAllowed = "move";
  };

  // Handle drag over on drop zone
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  // Handle drag leave
  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // Handle drop on grouping zone
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const column = e.dataTransfer.getData("text/plain") as GroupableColumn;
    if (column && !groupByColumns.includes(column)) {
      setGroupByColumns([column]);
      setCollapsedGroups(new Set()); // Reset collapsed state
    }
  };

  // Remove grouping
  const removeGrouping = (column: GroupableColumn) => {
    setGroupByColumns(groupByColumns.filter((c) => c !== column));
  };

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
  const dayColumnWidth = viewMode === "week" ? "100px" : "80px";

  // Draggable column header component
  const DraggableColumnHeader = ({ 
    column, 
    title, 
    icon 
  }: { 
    column: GroupableColumn; 
    title: string; 
    icon?: React.ReactNode 
  }) => {
    if (isColumnGrouped(column)) return null;
    
    const columnWidth = column === "name" ? "160px" : column === "designation" ? "180px" : "100px";
    
    return (
      <Table.ColumnHeader
        w={columnWidth}
        minW={columnWidth}
        borderRight="1px solid"
        borderColor="gray.200"
        bg="gray.50"
        cursor="grab"
        draggable
        onDragStart={(e) => handleDragStart(e, column)}
        _hover={{ bg: "gray.100" }}
        _active={{ cursor: "grabbing" }}
      >
        <HStack gap={1}>
          <Icon as={GripVertical} boxSize={3} color="gray.400" />
          <Text fontSize="sm" fontWeight="medium" color="gray.600">
            {title}
          </Text>
          {icon}
        </HStack>
      </Table.ColumnHeader>
    );
  };

  // Render data rows (flat or grouped)
  const renderRows = () => {
    if (!groupedData) {
      // Flat list - no grouping
      return data.map((row) => renderDataRow(row));
    }

    // Grouped view - flatten all rows into a single array for consistent table structure
    const allRows: React.ReactNode[] = [];
    
    Array.from(groupedData.entries()).forEach(([groupKey, rows]) => {
      const isCollapsed = collapsedGroups.has(groupKey);
      const totalCols = dayColumns.length + (isColumnGrouped("name") ? 0 : 1) + (isColumnGrouped("designation") ? 0 : 1) + (isColumnGrouped("hours") ? 0 : 1);

      // Group Header Row
      allRows.push(
        <Table.Row
          key={`group-${groupKey}`}
          bg="#f1f5f9"
          cursor="pointer"
          onClick={() => toggleGroup(groupKey)}
          _hover={{ bg: "#e2e8f0" }}
        >
          <Table.Cell colSpan={totalCols} py={2} px={3} w="100%">
            <HStack gap={2}>
              <Icon
                as={isCollapsed ? ChevronRight : ChevronDown}
                boxSize={4}
                color="gray.500"
              />
              <Text fontSize="sm" fontWeight="semibold" color="#4B8798">
                {groupKey}
              </Text>
              <Text fontSize="xs" color="gray.500">
                ({rows.length})
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
      {/* Name Cell - only if not grouped by name */}
      {!isColumnGrouped("name") && (
        <Table.Cell
          bg="white"
          borderRight="1px solid"
          borderColor="gray.200"
          py={2}
          px={3}
        >
          <HStack gap={2}>
            {row.hasWarning && (
              <Icon as={AlertCircle} boxSize={4} color="red.500" />
            )}
            <Text fontSize="sm" fontWeight="medium" color="gray.700">
              {row.name}
            </Text>
          </HStack>
        </Table.Cell>
      )}

      {/* Designation Cell - only if not grouped by designation */}
      {!isColumnGrouped("designation") && (
        <Table.Cell
          bg="white"
          borderRight="1px solid"
          borderColor="gray.200"
          py={2}
          px={3}
        >
          <Text fontSize="sm" color="gray.600">
            {row.designation}
          </Text>
        </Table.Cell>
      )}

      {/* Hours Cell - only if not grouped by hours */}
      {!isColumnGrouped("hours") && (
        <Table.Cell borderRight="1px solid" borderColor="gray.200" py={2} px={3}>
          <HStack gap={1}>
            {row.hasOvertime && (
              <Icon as={Clock} boxSize={3} color="orange.500" />
            )}
            <Text
              fontSize="sm"
              color={row.hasOvertime ? "orange.600" : "gray.600"}
              fontWeight={row.hasOvertime ? "semibold" : "normal"}
            >
              {row.hours.worked} / {row.hours.contracted}
            </Text>
          </HStack>
        </Table.Cell>
      )}

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
                <ShiftBadge shiftCode={shift?.shiftCode || null} isEditable={true} />
              </Box>
            </Flex>
          </Table.Cell>
        );
      })}
    </Table.Row>
  );

  return (
    <Box position="relative" w="100%">
      {/* Grouping Drop Zone */}
      <Box
        p={3}
        mb={2}
        borderRadius="md"
        border="2px dashed"
        borderColor={isDragOver ? "#4B8798" : "gray.300"}
        bg={isDragOver ? "cyan.50" : "gray.50"}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        transition="all 0.2s ease"
      >
        {groupByColumns.length === 0 ? (
          <Text fontSize="sm" color="gray.500" textAlign="center">
            Drag a column header and drop it here to group by that column
          </Text>
        ) : (
          <HStack gap={2} flexWrap="wrap">
            <Text fontSize="sm" color="gray.500">
              Grouped by:
            </Text>
            {groupByColumns.map((col) => (
              <HStack
                key={col}
                bg="white"
                px={3}
                py={1}
                borderRadius="md"
                border="1px solid"
                borderColor="gray.200"
                gap={2}
              >
                <Text fontSize="sm" fontWeight="medium" color="#4B8798">
                  {col === "name" ? "Name" : col === "designation" ? "Designation" : "Hours"}
                </Text>
                <Icon
                  as={X}
                  boxSize={4}
                  color="gray.400"
                  cursor="pointer"
                  _hover={{ color: "red.500" }}
                  onClick={() => removeGrouping(col)}
                />
              </HStack>
            ))}
          </HStack>
        )}
      </Box>

      {/* Table Container */}
      <Box overflow="auto" maxH="calc(100vh - 340px)" w="100%">
        <Table.Root size="sm" variant="outline" w="100%" style={{ tableLayout: "fixed" }}>
          <Table.Header>
            <Table.Row bg="gray.50">
              {/* Name Column Header - Draggable */}
              <DraggableColumnHeader
                column="name"
                title="Name"
                icon={<Icon as={Filter} boxSize={3} color="gray.400" />}
              />

              {/* Designation Column Header - Draggable */}
              <DraggableColumnHeader
                column="designation"
                title="Designation"
              />

              {/* Hours Column Header - Draggable */}
              <DraggableColumnHeader
                column="hours"
                title="Hours"
                icon={<Icon as={HelpCircle} boxSize={3} color="gray.400" />}
              />

              {/* Day Column Headers */}
              {dayColumns.map((col) => (
                <Table.ColumnHeader
                  key={col.field}
                  minW={dayColumnWidth}
                  textAlign="center"
                  bg="gray.50"
                  borderRight="1px solid"
                  borderColor="gray.100"
                  p={2}
                >
                  <Box>
                    <Text fontSize="sm" fontWeight="medium" color="gray.700">
                      {col.dayOfWeek}
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
