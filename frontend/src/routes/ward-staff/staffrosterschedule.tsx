import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Popover,
  Spinner,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Filter, X } from "lucide-react";
import moment from "moment";

import { ShiftBadge } from "@/components/NurseManager/RosterTable/ShiftBadge";
import {
  useRosterPeriodWindow,
  transformRosterData,
  useRosterPeriods,
  useWardRoster,
  useWardStatistics,
} from "@/components/NurseManager/RosterTable/useRosterData";
import type { DayColumn } from "@/components/NurseManager/RosterTable/types";
import { Checkbox } from "@/components/ui/checkbox";
import useAuth from "@/hooks/useAuth";

export const Route = createFileRoute("/ward-staff/staffrosterschedule")({
  component: StaffRosterSchedule,
});

function generateDayColumns(startDate: Date): DayColumn[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = moment(startDate).add(index, "days");

    return {
      field: `shift_${date.format("YYYY-MM-DD")}`,
      title: date.format("dddd"),
      date: date.toDate(),
      dayOfWeek: date.format("ddd"),
    };
  });
}

function StaffRosterSchedule() {
  const { user } = useAuth();
  const [currentStartDate, setCurrentStartDate] = useState(() =>
    moment().startOf("isoWeek").toDate(),
  );
  const [nameFilterOpen, setNameFilterOpen] = useState(false);
  const [designationFilterOpen, setDesignationFilterOpen] = useState(false);
  const [nameFilterSearch, setNameFilterSearch] = useState("");
  const [designationFilterSearch, setDesignationFilterSearch] = useState("");
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [selectedDesignations, setSelectedDesignations] = useState<Set<string>>(
    new Set(),
  );
  const [hasInitializedCurrentPeriod, setHasInitializedCurrentPeriod] =
    useState(false);
  const nameFilterAnchorRef = useRef<HTMLDivElement>(null);
  const designationFilterAnchorRef = useRef<HTMLDivElement>(null);

  const wardId = user?.wardid ?? null;
  const dayColumns = useMemo(
    () => generateDayColumns(currentStartDate),
    [currentStartDate],
  );

  const { data: periods } = useRosterPeriods();
  const { data: periodWindow } = useRosterPeriodWindow();
  const currentPeriod = periodWindow?.currentPeriod ?? null;
  const upcomingPeriod = periodWindow?.upcomingPeriod ?? null;
  const activePeriod = useMemo(() => {
    const weekStart = moment(currentStartDate);
    return (
      periods?.find((period) =>
        weekStart.isBetween(moment(period.startDate), moment(period.endDate), "day", "[]"),
      ) ?? null
    );
  }, [currentStartDate, periods]);
  const isViewingCurrentPeriod =
    !!activePeriod &&
    !!currentPeriod &&
    activePeriod.periodId === currentPeriod.periodId;
  const isViewingUpcomingPeriod =
    !!activePeriod &&
    !!upcomingPeriod &&
    activePeriod.periodId === upcomingPeriod.periodId;

  const navigationEndDate = useMemo(() => {
    return upcomingPeriod?.endDate ?? currentPeriod?.endDate ?? null;
  }, [currentPeriod?.endDate, upcomingPeriod?.endDate]);
  const navigationStartDate = currentPeriod?.startDate ?? null;

  const canGoBack = useMemo(() => {
    if (!navigationStartDate) {
      return true;
    }
    const previousWeekStart = moment(currentStartDate).subtract(7, "days").startOf("day");
    return previousWeekStart.isSameOrAfter(moment(navigationStartDate).startOf("day"));
  }, [currentStartDate, navigationStartDate]);

  const canGoNext = useMemo(() => {
    if (!navigationEndDate) {
      return true;
    }
    const nextWeekStart = moment(currentStartDate).add(7, "days").startOf("day");
    const latestAllowedWeekStart = moment(navigationEndDate)
      .subtract(6, "days")
      .startOf("day");

    return nextWeekStart.isSameOrBefore(latestAllowedWeekStart);
  }, [currentStartDate, navigationEndDate]);

  useEffect(() => {
    if (currentPeriod && !hasInitializedCurrentPeriod) {
      setCurrentStartDate(moment(currentPeriod.startDate).toDate());
      setHasInitializedCurrentPeriod(true);
    }
  }, [currentPeriod, hasInitializedCurrentPeriod]);

  const {
    data: statistics,
    isLoading: isStatisticsLoading,
    isError: isStatisticsError,
  } = useWardStatistics(wardId);
  const {
    data: rosterData,
    isLoading: isRosterLoading,
    isError: isRosterError,
  } = useWardRoster(wardId, activePeriod?.periodId ?? null);

  const rows = useMemo(() => {
    if (!statistics?.nurses || !rosterData?.roster_entries) {
      return [];
    }

    return transformRosterData(statistics.nurses, rosterData.roster_entries);
  }, [rosterData, statistics]);

  const allNames = useMemo(
    () => Array.from(new Set(rows.map((row) => row.name))).sort(),
    [rows],
  );
  const allDesignations = useMemo(
    () => Array.from(new Set(rows.map((row) => row.designation))).sort(),
    [rows],
  );
  const filteredNameOptions = useMemo(
    () =>
      allNames.filter((name) =>
        name.toLowerCase().includes(nameFilterSearch.toLowerCase()),
      ),
    [allNames, nameFilterSearch],
  );
  const filteredDesignationOptions = useMemo(
    () =>
      allDesignations.filter((designation) =>
        designation
          .toLowerCase()
          .includes(designationFilterSearch.toLowerCase()),
      ),
    [allDesignations, designationFilterSearch],
  );
  const isNameFilterActive = selectedNames.size > 0;
  const isDesignationFilterActive = selectedDesignations.size > 0;
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesName =
          !isNameFilterActive || selectedNames.has(row.name);
        const matchesDesignation =
          !isDesignationFilterActive ||
          selectedDesignations.has(row.designation);

        return matchesName && matchesDesignation;
      }),
    [isDesignationFilterActive, isNameFilterActive, rows, selectedDesignations, selectedNames],
  );

  const isLoading = isStatisticsLoading || isRosterLoading;
  const hasError = isStatisticsError || isRosterError;

  const handleToday = () => {
    setCurrentStartDate(
      moment(currentPeriod?.startDate ?? moment().startOf("isoWeek")).toDate(),
    );
  };

  const handleBack = () => {
    if (!canGoBack) {
      return;
    }
    setCurrentStartDate((previousDate) =>
      moment(previousDate).subtract(7, "days").toDate(),
    );
  };

  const handleNext = () => {
    if (!canGoNext) {
      return;
    }
    setCurrentStartDate((previousDate) =>
      moment(previousDate).add(7, "days").toDate(),
    );
  };

  const toggleName = (name: string) => {
    setSelectedNames((previousNames) => {
      const nextNames = new Set(previousNames);
      if (nextNames.has(name)) {
        nextNames.delete(name);
      } else {
        nextNames.add(name);
      }
      return nextNames;
    });
  };

  const toggleDesignation = (designation: string) => {
    setSelectedDesignations((previousDesignations) => {
      const nextDesignations = new Set(previousDesignations);
      if (nextDesignations.has(designation)) {
        nextDesignations.delete(designation);
      } else {
        nextDesignations.add(designation);
      }
      return nextDesignations;
    });
  };

  const selectAllNames = () => {
    setSelectedNames(new Set(allNames));
  };

  const selectAllDesignations = () => {
    setSelectedDesignations(new Set(allDesignations));
  };

  const clearNameFilter = () => {
    setSelectedNames(new Set());
    setNameFilterSearch("");
  };

  const clearDesignationFilter = () => {
    setSelectedDesignations(new Set());
    setDesignationFilterSearch("");
  };

  const weekEnd = moment(currentStartDate).add(6, "days");
  const dateRangeLabel = `${moment(currentStartDate).format("Do MMMM YYYY")} - ${weekEnd.format(
    "Do MMMM YYYY",
  )}`;

  return (
    <Flex
      minH="100vh"
      w="full"
      direction={{ base: "column" }}
      bgColor="background2"
      p={5}
    >
      <VStack
        gap={6}
        w="full"
        bgColor="white"
        rounded="lg"
        p={{ base: 5, md: 7 }}
        align="stretch"
        boxShadow="sm"
      >
        <VStack gap={1} textAlign="center">
          <Text color="primary" fontWeight="semibold" fontSize="lg">
            Staff Roster Schedule
          </Text>
          <HStack justify="center" gap={2} flexWrap="wrap" align="center" minH="32px">
            <Text color="foreground" fontWeight="light" whiteSpace="nowrap">
              {dateRangeLabel}
            </Text>
            {isViewingCurrentPeriod ? (
              <Badge variant="currentPeriod">
                Current
              </Badge>
            ) : null}
            {isViewingUpcomingPeriod ? (
              <Badge variant="upcomingPeriod">
                Upcoming
              </Badge>
            ) : null}
          </HStack>
        </VStack>

        <Flex justify="flex-end" align="center" minH="32px">
          <HStack gap={0}>
            <Button
              variant="outline"
              size="sm"
              roundedLeft="full"
              roundedRight="none"
              onClick={handleToday}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              rounded="none"
              borderLeftWidth="0"
              onClick={handleBack}
              disabled={!canGoBack}
            >
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              roundedLeft="none"
              roundedRight="full"
              borderLeftWidth="0"
              onClick={handleNext}
              disabled={!canGoNext}
            >
              Next
            </Button>
          </HStack>
        </Flex>

        <Box
          w="full"
          overflowX="auto"
          borderWidth="1px"
          borderColor="blackAlpha.100"
          rounded="md"
        >
          {isLoading ? (
            <Flex justify="center" align="center" minH="320px">
              <Spinner color="primary" size="lg" />
            </Flex>
          ) : hasError ? (
            <Flex justify="center" align="center" minH="320px" px={6}>
              <Text color="foreground" textAlign="center">
                Unable to load roster data right now.
              </Text>
            </Flex>
          ) : (
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="white">
                  <Table.ColumnHeader
                    minW="160px"
                    py={4}
                    px={4}
                    borderBottom="1px solid"
                    borderColor="blackAlpha.100"
                    color="foreground"
                    fontWeight="medium"
                  >
                    <HStack gap={2}>
                      <Text fontSize="sm">Name</Text>
                      <Box position="relative" display="inline-flex" ref={nameFilterAnchorRef}>
                        <Box
                          as="button"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          p={1}
                          borderRadius="md"
                          cursor="pointer"
                          color={isNameFilterActive ? "primary" : "foreground"}
                          bg={isNameFilterActive ? "#e0f2fe" : "transparent"}
                          _hover={{ bg: "#e0f2fe", color: "primary" }}
                          _active={{ bg: "#bae6fd", color: "#0e7490" }}
                          transition="all 0.15s ease"
                          onClick={(event) => {
                            event.stopPropagation();
                            setNameFilterOpen((open) => !open);
                            setDesignationFilterOpen(false);
                          }}
                          title="Filter by name"
                        >
                          <Filter size={14} />
                        </Box>
                        {isNameFilterActive && (
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
                    <Popover.Root
                      open={nameFilterOpen}
                      onOpenChange={(details) => {
                        if (!details.open) {
                          setNameFilterOpen(false);
                          setNameFilterSearch("");
                        }
                      }}
                      positioning={{
                        getAnchorRect: () =>
                          nameFilterAnchorRef.current?.getBoundingClientRect() ?? null,
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
                          <Popover.Header
                            p={2}
                            bg="gray.50"
                            borderBottom="1px solid"
                            borderColor="gray.100"
                          >
                            <Flex justify="space-between" align="center" mb={2}>
                              <Text fontSize="xs" fontWeight="semibold" color="primary">
                                Filter by Name
                              </Text>
                              <Box
                                as="button"
                                cursor="pointer"
                                color="gray.400"
                                _hover={{ color: "gray.600" }}
                                onClick={() => {
                                  setNameFilterOpen(false);
                                  setNameFilterSearch("");
                                }}
                              >
                                <X size={13} />
                              </Box>
                            </Flex>
                            <Input
                              placeholder="Search name..."
                              size="xs"
                              value={nameFilterSearch}
                              onChange={(event) => setNameFilterSearch(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              autoFocus
                              borderColor="gray.200"
                              _focus={{
                                borderColor: "#4B8798",
                                boxShadow: "0 0 0 1px #4B8798",
                              }}
                            />
                          </Popover.Header>
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
                              _hover={{ color: "primary", textDecoration: "underline" }}
                              onClick={selectAllNames}
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
                              _hover={{ color: "primary", textDecoration: "underline" }}
                              onClick={clearNameFilter}
                            >
                              Clear
                            </Box>
                            {isNameFilterActive && (
                              <Text fontSize="xs" color="gray.400" ml="auto">
                                {selectedNames.size} selected
                              </Text>
                            )}
                          </Flex>
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
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleName(name);
                                  }}
                                >
                                  <Checkbox
                                    size="sm"
                                    checked={selectedNames.has(name)}
                                    onCheckedChange={() => toggleName(name)}
                                    onClick={(event) => event.stopPropagation()}
                                    colorPalette="cyan"
                                  />
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
                  <Table.ColumnHeader
                    minW="220px"
                    py={4}
                    px={4}
                    borderBottom="1px solid"
                    borderColor="blackAlpha.100"
                    color="foreground"
                    fontWeight="medium"
                  >
                    <HStack gap={2}>
                      <Text fontSize="sm">Designation</Text>
                      <Box
                        position="relative"
                        display="inline-flex"
                        ref={designationFilterAnchorRef}
                      >
                        <Box
                          as="button"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          p={1}
                          borderRadius="md"
                          cursor="pointer"
                          color={isDesignationFilterActive ? "primary" : "foreground"}
                          bg={isDesignationFilterActive ? "#e0f2fe" : "transparent"}
                          _hover={{ bg: "#e0f2fe", color: "primary" }}
                          _active={{ bg: "#bae6fd", color: "#0e7490" }}
                          transition="all 0.15s ease"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDesignationFilterOpen((open) => !open);
                            setNameFilterOpen(false);
                          }}
                          title="Filter by designation"
                        >
                          <Filter size={14} />
                        </Box>
                        {isDesignationFilterActive && (
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
                    <Popover.Root
                      open={designationFilterOpen}
                      onOpenChange={(details) => {
                        if (!details.open) {
                          setDesignationFilterOpen(false);
                          setDesignationFilterSearch("");
                        }
                      }}
                      positioning={{
                        getAnchorRect: () =>
                          designationFilterAnchorRef.current?.getBoundingClientRect() ?? null,
                        placement: "bottom-start",
                      }}
                    >
                      <Popover.Positioner zIndex={49}>
                        <Popover.Content
                          w="240px"
                          borderRadius="lg"
                          boxShadow="lg"
                          overflow="hidden"
                        >
                          <Popover.Header
                            p={2}
                            bg="gray.50"
                            borderBottom="1px solid"
                            borderColor="gray.100"
                          >
                            <Flex justify="space-between" align="center" mb={2}>
                              <Text fontSize="xs" fontWeight="semibold" color="primary">
                                Filter by Designation
                              </Text>
                              <Box
                                as="button"
                                cursor="pointer"
                                color="gray.400"
                                _hover={{ color: "gray.600" }}
                                onClick={() => {
                                  setDesignationFilterOpen(false);
                                  setDesignationFilterSearch("");
                                }}
                              >
                                <X size={13} />
                              </Box>
                            </Flex>
                            <Input
                              placeholder="Search designation..."
                              size="xs"
                              value={designationFilterSearch}
                              onChange={(event) =>
                                setDesignationFilterSearch(event.target.value)
                              }
                              onClick={(event) => event.stopPropagation()}
                              borderColor="gray.200"
                              _focus={{
                                borderColor: "#4B8798",
                                boxShadow: "0 0 0 1px #4B8798",
                              }}
                            />
                          </Popover.Header>
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
                              _hover={{ color: "primary", textDecoration: "underline" }}
                              onClick={selectAllDesignations}
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
                              _hover={{ color: "primary", textDecoration: "underline" }}
                              onClick={clearDesignationFilter}
                            >
                              Clear
                            </Box>
                            {isDesignationFilterActive && (
                              <Text fontSize="xs" color="gray.400" ml="auto">
                                {selectedDesignations.size} selected
                              </Text>
                            )}
                          </Flex>
                          <Popover.Body p={0} maxH="220px" overflowY="auto">
                            {filteredDesignationOptions.length === 0 ? (
                              <Flex px={3} py={3} align="center">
                                <Text fontSize="xs" color="gray.400">
                                  No designations found
                                </Text>
                              </Flex>
                            ) : (
                              filteredDesignationOptions.map((designation) => (
                                <Flex
                                  key={designation}
                                  align="center"
                                  gap={2}
                                  px={3}
                                  py={1.5}
                                  cursor="pointer"
                                  bg={
                                    selectedDesignations.has(designation)
                                      ? "#f0f9ff"
                                      : "white"
                                  }
                                  _hover={{ bg: "#f0f9ff" }}
                                  transition="background 0.1s ease"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleDesignation(designation);
                                  }}
                                >
                                  <Checkbox
                                    size="sm"
                                    checked={selectedDesignations.has(designation)}
                                    onCheckedChange={() => toggleDesignation(designation)}
                                    onClick={(event) => event.stopPropagation()}
                                    colorPalette="cyan"
                                  />
                                  <Text fontSize="xs" color="gray.700" userSelect="none">
                                    {designation}
                                  </Text>
                                </Flex>
                              ))
                            )}
                          </Popover.Body>
                        </Popover.Content>
                      </Popover.Positioner>
                    </Popover.Root>
                  </Table.ColumnHeader>
                  {dayColumns.map((column) => (
                    <Table.ColumnHeader
                      key={column.field}
                      minW="160px"
                      py={4}
                      px={2}
                      textAlign="center"
                      borderBottom="1px solid"
                      borderColor="blackAlpha.100"
                      color="foreground"
                      fontWeight="medium"
                    >
                      <VStack gap={0}>
                        <Text fontSize="sm">{column.title}</Text>
                        <Text fontSize="xs" color="foreground" fontWeight="light">
                          {moment(column.date).format("D/M/YYYY")}
                        </Text>
                      </VStack>
                    </Table.ColumnHeader>
                  ))}
                </Table.Row>
              </Table.Header>

              <Table.Body>
                {filteredRows.length === 0 ? (
                  <Table.Row>
                    <Table.Cell
                      colSpan={2 + dayColumns.length}
                      textAlign="center"
                      py={12}
                      color="foreground"
                    >
                      {rows.length === 0
                        ? "No roster data available for this week."
                        : "No staff match the selected filters."}
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  filteredRows.map((row) => {
                    const isCurrentUser = row.nurseId === user?.nurseid;

                    return (
                      <Table.Row
                        key={row.nurseId}
                        bg={isCurrentUser ? "#D9E6EA" : "white"}
                        _hover={{ bg: isCurrentUser ? "#D1E0E5" : "gray.50" }}
                      >
                        <Table.Cell
                          py={3}
                          px={4}
                          borderBottom="1px solid"
                          borderColor="blackAlpha.100"
                        >
                          <Text fontSize="sm" color="black" fontWeight={isCurrentUser ? "medium" : "normal"}>
                            {row.name}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          py={3}
                          px={4}
                          borderBottom="1px solid"
                          borderColor="blackAlpha.100"
                        >
                          <Text fontSize="sm" color="black" textTransform="uppercase">
                            {row.designation}
                          </Text>
                        </Table.Cell>
                        {dayColumns.map((column) => {
                          const dateKey = moment(column.date).format("YYYY-MM-DD");
                          const shift = row.shifts[dateKey];

                          return (
                            <Table.Cell
                              key={column.field}
                              py={2}
                              px={2}
                              textAlign="center"
                              borderBottom="1px solid"
                              borderColor="blackAlpha.100"
                            >
                              {shift?.shiftCode ? (
                                <Flex justify="center">
                                  <ShiftBadge
                                    shiftCode={shift.shiftCode}
                                    isEditable={false}
                                    viewMode="week"
                                    comment={shift.comment}
                                  />
                                </Flex>
                              ) : (
                                <Box w="140px" h="44px" mx="auto" />
                              )}
                            </Table.Cell>
                          );
                        })}
                      </Table.Row>
                    );
                  })
                )}
              </Table.Body>
            </Table.Root>
          )}
        </Box>
      </VStack>
    </Flex>
  );
}

export default StaffRosterSchedule;
