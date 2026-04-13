import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Flex,
  HStack,
  Input,
  Popover,
  Portal,
  Select,
  Spinner,
  Table,
  Text,
  VStack,
  createListCollection,
} from "@chakra-ui/react";
import { Filter, X } from "lucide-react";

import { WardsService, type Ward } from "@/client";
import {
  useWardStatistics,
  useUpdateNurseShiftPattern,
} from "@/components/NurseManager/RosterTable/useRosterData";
import type { ShiftPattern } from "@/components/NurseManager/RosterTable/types";
import { Checkbox } from "@/components/ui/checkbox";
import { showErrorToast, showSuccessToast } from "@/components/ui/toast";

export const Route = createFileRoute("/nurse-manager/ward-staff-directory")({
  component: WardStaffDirectoryPage,
});

type DirectoryRow = {
  nurseId: number;
  name: string;
  designation: string;
  email: string;
  contactNumber: string;
  employmentType: string;
  shiftPattern: "A_ONLY" | "P_ONLY" | null;
  isActive: boolean;
};

type DirectoryShiftPattern = DirectoryRow["shiftPattern"];

type FilterMenuProps = {
  title: string;
  placeholder: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  options: string[];
  selectedValues: Set<string>;
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  anchorRef: RefObject<HTMLDivElement | null>;
};

const SHIFT_PATTERN_OPTIONS = [
  { label: "No permanent pattern", value: "NONE" },
  { label: "A only (4 on / 3 off)", value: "A_ONLY" },
  { label: "P only (4 on / 3 off)", value: "P_ONLY" },
];

const shiftPatternCollection = createListCollection({
  items: SHIFT_PATTERN_OPTIONS,
  itemToString: (item) => item.label,
  itemToValue: (item) => item.value,
});

function FilterMenu({
  title,
  placeholder,
  open,
  onOpenChange,
  search,
  onSearchChange,
  options,
  selectedValues,
  onToggle,
  onSelectAll,
  onClear,
  anchorRef,
}: FilterMenuProps) {
  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) {
          onOpenChange(false);
          onSearchChange("");
        }
      }}
      positioning={{
        getAnchorRect: () =>
          anchorRef.current?.getBoundingClientRect() ?? null,
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
                {title}
              </Text>
              <Box
                as="button"
                cursor="pointer"
                color="gray.400"
                _hover={{ color: "gray.600" }}
                onClick={() => {
                  onOpenChange(false);
                  onSearchChange("");
                }}
              >
                <X size={13} />
              </Box>
            </Flex>
            <Input
              placeholder={placeholder}
              size="xs"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
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
              _hover={{ color: "primary", textDecoration: "underline" }}
              onClick={onClear}
            >
              Clear
            </Box>
            {selectedValues.size > 0 && (
              <Text fontSize="xs" color="gray.400" ml="auto">
                {selectedValues.size} selected
              </Text>
            )}
          </Flex>
          <Popover.Body p={0} maxH="220px" overflowY="auto">
            {options.length === 0 ? (
              <Flex px={3} py={3} align="center">
                <Text fontSize="xs" color="gray.400">
                  No matches found
                </Text>
              </Flex>
            ) : (
              options.map((option) => (
                <Flex
                  key={option}
                  align="center"
                  gap={2}
                  px={3}
                  py={1.5}
                  cursor="pointer"
                  bg={selectedValues.has(option) ? "#f0f9ff" : "white"}
                  _hover={{ bg: "#f0f9ff" }}
                  transition="background 0.1s ease"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(option);
                  }}
                >
                  <Checkbox
                    size="sm"
                    checked={selectedValues.has(option)}
                    onCheckedChange={() => onToggle(option)}
                    onClick={(event: MouseEvent) => event.stopPropagation()}
                    colorPalette="cyan"
                  />
                  <Text fontSize="xs" color="gray.700" userSelect="none">
                    {option}
                  </Text>
                </Flex>
              ))
            )}
          </Popover.Body>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Please try again.";
}

function normalizeShiftPatternForDirectory(value: unknown): DirectoryShiftPattern {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "AM_ONLY" || normalized === "A_ONLY") {
    return "A_ONLY";
  }
  if (normalized === "PM_ONLY" || normalized === "P_ONLY") {
    return "P_ONLY";
  }
  return null;
}

function toApiShiftPattern(value: string | undefined): ShiftPattern {
  if (!value || value === "NONE") {
    return null;
  }
  if (value === "A_ONLY") {
    return "AM_ONLY";
  }
  if (value === "P_ONLY") {
    return "PM_ONLY";
  }
  return value as ShiftPattern;
}

function WardStaffDirectoryPage() {
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null);
  const [nameFilterOpen, setNameFilterOpen] = useState(false);
  const [designationFilterOpen, setDesignationFilterOpen] = useState(false);
  const [nameFilterSearch, setNameFilterSearch] = useState("");
  const [designationFilterSearch, setDesignationFilterSearch] = useState("");
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [selectedDesignations, setSelectedDesignations] = useState<Set<string>>(
    new Set(),
  );
  const [savingPatternNurseId, setSavingPatternNurseId] = useState<number | null>(
    null,
  );
  const nameFilterAnchorRef = useRef<HTMLDivElement>(null);
  const designationFilterAnchorRef = useRef<HTMLDivElement>(null);

  const { data: wards = [], isLoading: wardsLoading } = useQuery<Ward[]>({
    queryKey: ["wards"],
    queryFn: WardsService.getWards,
  });

  const {
    data: statistics,
    isLoading: isStatisticsLoading,
    isError: isStatisticsError,
  } = useWardStatistics(selectedWard?.wardid ?? null);
  const updateShiftPattern = useUpdateNurseShiftPattern();

  useEffect(() => {
    if (wards.length === 0 || selectedWard) {
      return;
    }

    const savedId = localStorage.getItem("selectedWardId");
    const restoredWard = savedId
      ? wards.find((ward) => String(ward.wardid) === savedId)
      : null;

    setSelectedWard(restoredWard ?? wards[0]);
  }, [selectedWard, wards]);

  const wardCollection = useMemo(
    () =>
      createListCollection({
        items: wards,
        itemToString: (ward) => ward.wardname,
        itemToValue: (ward) => String(ward.wardid),
      }),
    [wards],
  );

  const rows = useMemo<DirectoryRow[]>(
    () =>
      (statistics?.nurses ?? []).map((nurse) => ({
        nurseId: nurse.nurseId,
        name: nurse.name,
        designation: nurse.designation,
        email: nurse.email,
        contactNumber: nurse.contactNumber,
        employmentType: nurse.employmentType,
        shiftPattern: normalizeShiftPatternForDirectory(
          nurse.shiftPattern ??
            (nurse as { shift_pattern?: unknown }).shift_pattern ??
            (nurse as { shiftpattern?: unknown }).shiftpattern,
        ),
        isActive: nurse.isActive,
      })),
    [statistics],
  );

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
    [
      isDesignationFilterActive,
      isNameFilterActive,
      rows,
      selectedDesignations,
      selectedNames,
    ],
  );

  const handleWardChange = (ward: Ward) => {
    setSelectedWard(ward);
    localStorage.setItem("selectedWardId", String(ward.wardid));
    setSelectedNames(new Set());
    setSelectedDesignations(new Set());
    setNameFilterSearch("");
    setDesignationFilterSearch("");
    setNameFilterOpen(false);
    setDesignationFilterOpen(false);
  };

  const toggleName = (name: string) => {
    setSelectedNames((previous) => {
      const next = new Set(previous);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const toggleDesignation = (designation: string) => {
    setSelectedDesignations((previous) => {
      const next = new Set(previous);
      if (next.has(designation)) {
        next.delete(designation);
      } else {
        next.add(designation);
      }
      return next;
    });
  };

  const handleShiftPatternChange = async (
    nurseId: number,
    nextValue: string | undefined,
  ) => {
    const shiftPattern = toApiShiftPattern(nextValue);
    setSavingPatternNurseId(nurseId);
    try {
      await updateShiftPattern.mutateAsync({ nurseId, shiftPattern });
      showSuccessToast("Permanent shift pattern updated.");
    } catch (error) {
      showErrorToast(getErrorMessage(error));
    } finally {
      setSavingPatternNurseId(null);
    }
  };

  const isLoading = wardsLoading || isStatisticsLoading;

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
            Ward Staff Directory
          </Text>
          <Text color="foreground" fontWeight="light">
            Review live nurse records by ward and set permanent A-only or P-only
            patterns for permanent staff.
          </Text>
        </VStack>

        <Flex
          direction={{ base: "column", lg: "row" }}
          justify="space-between"
          align={{ base: "stretch", lg: "center" }}
          gap={4}
        >
          <HStack gap={3} flexWrap="wrap" color="foreground">
            <Text fontSize="sm" fontWeight="medium">
              Ward
            </Text>
            <Select.Root
              collection={wardCollection}
              size="sm"
              width={{ base: "full", md: "220px" }}
              value={selectedWard ? [String(selectedWard.wardid)] : []}
              onValueChange={(details) => {
                const ward = wards.find(
                  (item) => String(item.wardid) === details.value[0],
                );
                if (ward) {
                  handleWardChange(ward);
                }
              }}
            >
              <Select.HiddenSelect />
              <Select.Control>
                <Select.Trigger>
                  <Select.ValueText placeholder="Select ward" />
                </Select.Trigger>
                <Select.IndicatorGroup>
                  <Select.Indicator />
                </Select.IndicatorGroup>
              </Select.Control>
              <Portal>
                <Select.Positioner zIndex={1500}>
                  <Select.Content>
                    {wardCollection.items.map((ward) => (
                      <Select.Item key={ward.wardid} item={ward}>
                        {ward.wardname}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>

          </HStack>

          <HStack gap={3} color="foreground" flexWrap="wrap">
            <Text fontSize="sm">
              Nurses:{" "}
              <Box as="span" color="primary" fontWeight="semibold">
                {statistics?.total_nurses ?? rows.length}
              </Box>
            </Text>
            <Text fontSize="sm">
              Showing:{" "}
              <Box as="span" color="primary" fontWeight="semibold">
                {filteredRows.length}
              </Box>
            </Text>
          </HStack>
        </Flex>

        <Box
          px={4}
          py={3}
          rounded="md"
          bg="#f8fafc"
          borderWidth="1px"
          borderColor="blackAlpha.100"
        >
          <Text fontSize="sm" color="foreground">
            Permanent A-only and P-only patterns are configured here. Temporary
            no-night settings are now managed from roster planning for the selected
            roster period.
          </Text>
        </Box>

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
          ) : isStatisticsError ? (
            <Flex justify="center" align="center" minH="320px" px={6}>
              <Text color="foreground" textAlign="center">
                Unable to load ward staff data right now.
              </Text>
            </Flex>
          ) : (
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="white">
                  <Table.ColumnHeader
                    minW="180px"
                    py={4}
                    px={4}
                    borderBottom="1px solid"
                    borderColor="blackAlpha.100"
                    color="foreground"
                    fontWeight="medium"
                  >
                    <HStack gap={2}>
                      <Text fontSize="sm">Name</Text>
                      <Box
                        position="relative"
                        display="inline-flex"
                        ref={nameFilterAnchorRef}
                      >
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
                    <FilterMenu
                      title="Filter by Name"
                      placeholder="Search name..."
                      open={nameFilterOpen}
                      onOpenChange={setNameFilterOpen}
                      search={nameFilterSearch}
                      onSearchChange={setNameFilterSearch}
                      options={filteredNameOptions}
                      selectedValues={selectedNames}
                      onToggle={toggleName}
                      onSelectAll={() => setSelectedNames(new Set(allNames))}
                      onClear={() => {
                        setSelectedNames(new Set());
                        setNameFilterSearch("");
                      }}
                      anchorRef={nameFilterAnchorRef}
                    />
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
                          color={
                            isDesignationFilterActive ? "primary" : "foreground"
                          }
                          bg={
                            isDesignationFilterActive
                              ? "#e0f2fe"
                              : "transparent"
                          }
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
                    <FilterMenu
                      title="Filter by Designation"
                      placeholder="Search designation..."
                      open={designationFilterOpen}
                      onOpenChange={setDesignationFilterOpen}
                      search={designationFilterSearch}
                      onSearchChange={setDesignationFilterSearch}
                      options={filteredDesignationOptions}
                      selectedValues={selectedDesignations}
                      onToggle={toggleDesignation}
                      onSelectAll={() =>
                        setSelectedDesignations(new Set(allDesignations))
                      }
                      onClear={() => {
                        setSelectedDesignations(new Set());
                        setDesignationFilterSearch("");
                      }}
                      anchorRef={designationFilterAnchorRef}
                    />
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
                    Permanent Pattern
                  </Table.ColumnHeader>
                  <Table.ColumnHeader
                    minW="240px"
                    py={4}
                    px={4}
                    borderBottom="1px solid"
                    borderColor="blackAlpha.100"
                    color="foreground"
                    fontWeight="medium"
                  >
                    Email
                  </Table.ColumnHeader>
                  <Table.ColumnHeader
                    minW="150px"
                    py={4}
                    px={4}
                    borderBottom="1px solid"
                    borderColor="blackAlpha.100"
                    color="foreground"
                    fontWeight="medium"
                  >
                    Contact
                  </Table.ColumnHeader>
                  <Table.ColumnHeader
                    minW="140px"
                    py={4}
                    px={4}
                    borderBottom="1px solid"
                    borderColor="blackAlpha.100"
                    color="foreground"
                    fontWeight="medium"
                  >
                    Employment
                  </Table.ColumnHeader>
                  <Table.ColumnHeader
                    minW="120px"
                    py={4}
                    px={4}
                    borderBottom="1px solid"
                    borderColor="blackAlpha.100"
                    color="foreground"
                    fontWeight="medium"
                  >
                    Status
                  </Table.ColumnHeader>
                </Table.Row>
              </Table.Header>

              <Table.Body>
                {!selectedWard ? (
                  <Table.Row>
                    <Table.Cell colSpan={7} textAlign="center" py={12} color="foreground">
                      Select a ward to view staff.
                    </Table.Cell>
                  </Table.Row>
                ) : filteredRows.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={7} textAlign="center" py={12} color="foreground">
                      {rows.length === 0
                        ? "No nurses were found for this ward."
                        : "No staff match the selected filters."}
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  filteredRows.map((row) => {
                    const isSavingPattern = savingPatternNurseId === row.nurseId;

                    return (
                      <Table.Row key={row.nurseId} bg="white" _hover={{ bg: "gray.50" }}>
                        <Table.Cell py={3} px={4} borderBottom="1px solid" borderColor="blackAlpha.100">
                          <Text fontSize="sm" color="black" fontWeight="medium">
                            {row.name}
                          </Text>
                        </Table.Cell>
                        <Table.Cell py={3} px={4} borderBottom="1px solid" borderColor="blackAlpha.100">
                          <Text fontSize="sm" color="black">
                            {row.designation}
                          </Text>
                        </Table.Cell>
                        <Table.Cell py={3} px={4} borderBottom="1px solid" borderColor="blackAlpha.100">
                          <Select.Root
                            collection={shiftPatternCollection}
                            size="sm"
                            width="220px"
                            value={[row.shiftPattern ?? "NONE"]}
                            disabled={isSavingPattern}
                            onValueChange={(details) =>
                              handleShiftPatternChange(row.nurseId, details.value[0])
                            }
                          >
                            <Select.HiddenSelect />
                            <Select.Control>
                              <Select.Trigger>
                                <Select.ValueText placeholder="Select pattern" />
                              </Select.Trigger>
                              <Select.IndicatorGroup>
                                <Select.Indicator />
                              </Select.IndicatorGroup>
                            </Select.Control>
                            <Portal>
                              <Select.Positioner zIndex={1500}>
                                <Select.Content>
                                  {shiftPatternCollection.items.map((pattern) => (
                                    <Select.Item key={pattern.value} item={pattern}>
                                      {pattern.label}
                                    </Select.Item>
                                  ))}
                                </Select.Content>
                              </Select.Positioner>
                            </Portal>
                          </Select.Root>
                        </Table.Cell>
                        <Table.Cell py={3} px={4} borderBottom="1px solid" borderColor="blackAlpha.100">
                          <Text fontSize="sm" color="black">
                            {row.email || "Not available"}
                          </Text>
                        </Table.Cell>
                        <Table.Cell py={3} px={4} borderBottom="1px solid" borderColor="blackAlpha.100">
                          <Text fontSize="sm" color="black">
                            {row.contactNumber || "Not available"}
                          </Text>
                        </Table.Cell>
                        <Table.Cell py={3} px={4} borderBottom="1px solid" borderColor="blackAlpha.100">
                          <Text fontSize="sm" color="black">
                            {row.employmentType || "Not available"}
                          </Text>
                        </Table.Cell>
                        <Table.Cell py={3} px={4} borderBottom="1px solid" borderColor="blackAlpha.100">
                          <Box
                            display="inline-flex"
                            px={2.5}
                            py={1}
                            borderRadius="full"
                            bg={row.isActive ? "#dcfce7" : "#f3f4f6"}
                            color={row.isActive ? "#166534" : "#6b7280"}
                            fontSize="xs"
                            fontWeight="semibold"
                          >
                            {row.isActive ? "Active" : "Inactive"}
                          </Box>
                        </Table.Cell>
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

export default WardStaffDirectoryPage;
