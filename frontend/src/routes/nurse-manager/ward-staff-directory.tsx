import {
  Box,
  createListCollection,
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
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Filter, KeyRound, Mail, Pencil, Plus, Trash2, X } from "lucide-react"
import {
  type MouseEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { type Ward, WardsService } from "@/client"
import {
  type NurseManagerDesignationOption,
  type NurseManagerStaffCreate,
  NurseManagerStaffService,
  type NurseManagerStaffUpdate,
  type NurseManagerStaffUser,
} from "@/client/nurseManagerStaffService"
import type { ShiftPattern } from "@/components/NurseManager/RosterTable/types"
import {
  useUpdateNurseShiftPattern,
  useWardStatistics,
} from "@/components/NurseManager/RosterTable/useRosterData"
import { Checkbox } from "@/components/ui/checkbox"
import { showErrorToast, showSuccessToast } from "@/components/ui/toast"

export const Route = createFileRoute("/nurse-manager/ward-staff-directory")({
  component: WardStaffDirectoryPage,
})

type DirectoryRow = {
  userId: number | null
  nurseId: number
  name: string
  username: string
  employeeId: string
  joinDate: string
  designation: string
  email: string
  shiftPattern: "A_ONLY" | "P_ONLY" | null
  isActive: boolean
  mustChangePassword: boolean
}

type StaffFormState = {
  name: string
  username: string
  employeeId: string
  joinDate: string
  designation: string
  email: string
  password: string
  isActive: boolean
}

type GeneratedPasswordInfo = {
  userId?: number
  username: string
  generatedPassword: string
}

type DirectoryShiftPattern = DirectoryRow["shiftPattern"]

type FilterMenuProps = {
  title: string
  placeholder: string
  open: boolean
  onOpenChange: (open: boolean) => void
  search: string
  onSearchChange: (value: string) => void
  options: string[]
  selectedValues: Set<string>
  onToggle: (value: string) => void
  onSelectAll: () => void
  onClear: () => void
  anchorRef: RefObject<HTMLDivElement | null>
}

const SHIFT_PATTERN_OPTIONS = [
  { label: "No permanent pattern", value: "NONE" },
  { label: "A only (4 on / 3 off)", value: "A_ONLY" },
  { label: "P only (4 on / 3 off)", value: "P_ONLY" },
]

const shiftPatternCollection = createListCollection({
  items: SHIFT_PATTERN_OPTIONS,
  itemToString: (item) => item.label,
  itemToValue: (item) => item.value,
})

const joinDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

function formatJoinDate(value: string | null | undefined) {
  if (!value) return "Not available"
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return value
  return joinDateFormatter.format(parsed)
}

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
          onOpenChange(false)
          onSearchChange("")
        }
      }}
      positioning={{
        getAnchorRect: () => anchorRef.current?.getBoundingClientRect() ?? null,
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
                  onOpenChange(false)
                  onSearchChange("")
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
                    event.stopPropagation()
                    onToggle(option)
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
  )
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return "Please try again."
}

function normalizeShiftPatternForDirectory(
  value: unknown,
): DirectoryShiftPattern {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : ""
  if (normalized === "AM_ONLY" || normalized === "A_ONLY") {
    return "A_ONLY"
  }
  if (normalized === "PM_ONLY" || normalized === "P_ONLY") {
    return "P_ONLY"
  }
  return null
}

function toApiShiftPattern(value: string | undefined): ShiftPattern {
  if (!value || value === "NONE") {
    return null
  }
  if (value === "A_ONLY") {
    return "AM_ONLY"
  }
  if (value === "P_ONLY") {
    return "PM_ONLY"
  }
  return value as ShiftPattern
}

function WardStaffDirectoryPage() {
  const queryClient = useQueryClient()
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null)
  const [nameFilterOpen, setNameFilterOpen] = useState(false)
  const [employeeIdFilterOpen, setEmployeeIdFilterOpen] = useState(false)
  const [designationFilterOpen, setDesignationFilterOpen] = useState(false)
  const [nameFilterSearch, setNameFilterSearch] = useState("")
  const [employeeIdFilterSearch, setEmployeeIdFilterSearch] = useState("")
  const [designationFilterSearch, setDesignationFilterSearch] = useState("")
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(
    new Set(),
  )
  const [selectedDesignations, setSelectedDesignations] = useState<Set<string>>(
    new Set(),
  )
  const [savingPatternNurseId, setSavingPatternNurseId] = useState<
    number | null
  >(null)
  const [isStaffFormOpen, setIsStaffFormOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<DirectoryRow | null>(null)
  const [deletingStaff, setDeletingStaff] = useState<DirectoryRow | null>(null)
  const [resetPasswordStaff, setResetPasswordStaff] =
    useState<DirectoryRow | null>(null)
  const [generatedPasswordInfo, setGeneratedPasswordInfo] =
    useState<GeneratedPasswordInfo | null>(null)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [staffForm, setStaffForm] = useState<StaffFormState>({
    name: "",
    username: "",
    employeeId: "",
    joinDate: "",
    designation: "",
    email: "",
    password: "",
    isActive: true,
  })
  const nameFilterAnchorRef = useRef<HTMLDivElement>(null)
  const employeeIdFilterAnchorRef = useRef<HTMLDivElement>(null)
  const designationFilterAnchorRef = useRef<HTMLDivElement>(null)

  const { data: wards = [], isLoading: wardsLoading } = useQuery<Ward[]>({
    queryKey: ["wards"],
    queryFn: WardsService.getWards,
  })

  const {
    data: staffUsers = [],
    isLoading: isStaffLoading,
    isError: isStaffError,
  } = useQuery<NurseManagerStaffUser[]>({
    queryKey: ["nurse-manager", "staff-directory", selectedWard?.wardid],
    queryFn: () =>
      NurseManagerStaffService.listStaff(selectedWard?.wardid ?? 0),
    enabled: selectedWard?.wardid != null,
  })

  const { data: designations = [] } = useQuery<NurseManagerDesignationOption[]>(
    {
      queryKey: ["nurse-manager", "designations"],
      queryFn: NurseManagerStaffService.listDesignations,
      staleTime: 60_000,
    },
  )

  const designationOptions = useMemo(
    () => designations.map((designation) => designation.designation),
    [designations],
  )

  const {
    data: statistics,
    isLoading: isStatisticsLoading,
    isError: isStatisticsError,
  } = useWardStatistics(selectedWard?.wardid ?? null)

  const updateShiftPattern = useUpdateNurseShiftPattern()

  const invalidateDirectoryData = () => {
    queryClient.invalidateQueries({
      queryKey: ["nurse-manager", "staff-directory", selectedWard?.wardid],
    })
    queryClient.invalidateQueries({
      queryKey: ["roster", "statistics", selectedWard?.wardid ?? null],
    })
  }

  const createStaffMutation = useMutation({
    mutationFn: (payload: NurseManagerStaffCreate) =>
      NurseManagerStaffService.createStaff(payload),
    onSuccess: (result) => {
      showSuccessToast("User created successfully.")
      if (result.generated_password) {
        setGeneratedPasswordInfo({
          userId: result.userid,
          username: result.username,
          generatedPassword: result.generated_password,
        })
      }
      setIsStaffFormOpen(false)
      setEditingStaff(null)
      setStaffForm({
        name: "",
        username: "",
        employeeId: "",
        joinDate: "",
        designation: "",
        email: "",
        password: "",
        isActive: true,
      })
      invalidateDirectoryData()
    },
    onError: (error: unknown) => {
      showErrorToast(getErrorMessage(error))
    },
  })

  const updateStaffMutation = useMutation({
    mutationFn: ({
      userId,
      payload,
    }: {
      userId: number
      payload: NurseManagerStaffUpdate
    }) => NurseManagerStaffService.updateStaff(userId, payload),
    onSuccess: () => {
      showSuccessToast("User updated successfully.")
      setIsStaffFormOpen(false)
      setEditingStaff(null)
      setStaffForm({
        name: "",
        username: "",
        employeeId: "",
        joinDate: "",
        designation: "",
        email: "",
        password: "",
        isActive: true,
      })
      invalidateDirectoryData()
    },
    onError: (error: unknown) => {
      showErrorToast(getErrorMessage(error))
    },
  })

  const deleteStaffMutation = useMutation({
    mutationFn: (userId: number) =>
      NurseManagerStaffService.deleteStaff(userId),
    onSuccess: () => {
      showSuccessToast("User deleted successfully.")
      setDeletingStaff(null)
      invalidateDirectoryData()
    },
    onError: (error: unknown) => {
      showErrorToast(getErrorMessage(error))
    },
  })

  const resetStaffPasswordMutation = useMutation({
    mutationFn: (userId: number) =>
      NurseManagerStaffService.resetStaffPassword(userId),
    onSuccess: (result) => {
      if (resetPasswordStaff?.userId) {
        setGeneratedPasswordInfo({
          userId: resetPasswordStaff.userId,
          username: result.username,
          generatedPassword: result.generated_password,
        })
      }
      setResetPasswordStaff(null)
      showSuccessToast("Temporary password generated.")
      invalidateDirectoryData()
    },
    onError: (error: unknown) => {
      showErrorToast(getErrorMessage(error))
    },
  })

  const resendFirstLoginSetupMutation = useMutation({
    mutationFn: (userId: number) =>
      NurseManagerStaffService.resendFirstLoginSetup(userId),
    onSuccess: () => {
      showSuccessToast("First-login setup email sent.")
    },
    onError: (error: unknown) => {
      showErrorToast(getErrorMessage(error))
    },
  })

  useEffect(() => {
    if (wards.length === 0 || selectedWard) {
      return
    }

    const savedId = localStorage.getItem("selectedWardId")
    const restoredWard = savedId
      ? wards.find((ward) => String(ward.wardid) === savedId)
      : null

    setSelectedWard(restoredWard ?? wards[0])
  }, [selectedWard, wards])

  const wardCollection = useMemo(
    () =>
      createListCollection({
        items: wards,
        itemToString: (ward) => ward.wardname,
        itemToValue: (ward) => String(ward.wardid),
      }),
    [wards],
  )

  const rows = useMemo<DirectoryRow[]>(() => {
    const staffByNurseId = new Map<number, NurseManagerStaffUser>(
      staffUsers.map((staff) => [staff.nurseid, staff]),
    )
    const statisticsByNurseId = new Map(
      (statistics?.nurses ?? []).map(
        (nurse) => [nurse.nurseId, nurse] as const,
      ),
    )
    const nurseIds = new Set<number>([
      ...staffUsers.map((staff) => staff.nurseid),
      ...(statistics?.nurses ?? []).map((nurse) => nurse.nurseId),
    ])

    return Array.from(nurseIds)
      .map((nurseId) => {
        const linkedStaff = staffByNurseId.get(nurseId)
        const nurse = statisticsByNurseId.get(nurseId)
        if (!linkedStaff && !nurse) {
          return null
        }
        const statisticsUserId =
          nurse?.userId ??
          (nurse as { userid?: number | null } | undefined)?.userid ??
          null
        const statisticsMustChangePassword =
          nurse?.mustChangePassword ??
          (nurse as { must_change_password?: boolean } | undefined)
            ?.must_change_password ??
          false
        return {
          userId: linkedStaff?.userid ?? statisticsUserId,
          nurseId,
          name: linkedStaff?.name ?? nurse?.name ?? "",
          username:
            linkedStaff?.username?.trim() || nurse?.username?.trim() || "",
          employeeId:
            linkedStaff?.employee_id?.trim() ||
            nurse?.employeeId?.trim() ||
            ((
              nurse as { employee_id?: string | null } | undefined
            )?.employee_id?.trim() ??
              ""),
          joinDate:
            linkedStaff?.join_date ??
            (nurse as { joinDate?: string | null } | undefined)?.joinDate ??
            "",
          designation: linkedStaff?.designation ?? nurse?.designation ?? "",
          email: linkedStaff?.email ?? nurse?.email ?? "",
          mustChangePassword:
            linkedStaff?.must_change_password ?? statisticsMustChangePassword,
          shiftPattern: normalizeShiftPatternForDirectory(
            linkedStaff?.shift_pattern ??
              nurse?.shiftPattern ??
              (nurse as { shift_pattern?: unknown } | undefined)
                ?.shift_pattern ??
              (nurse as { shiftpattern?: unknown } | undefined)?.shiftpattern,
          ),
          isActive: linkedStaff?.isactive ?? nurse?.isActive ?? true,
        }
      })
      .filter((row): row is DirectoryRow => row !== null)
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) || left.nurseId - right.nurseId,
      )
  }, [staffUsers, statistics])

  const allNames = useMemo(
    () => Array.from(new Set(rows.map((row) => row.name))).sort(),
    [rows],
  )
  const allDesignations = useMemo(
    () => Array.from(new Set(rows.map((row) => row.designation))).sort(),
    [rows],
  )
  const allEmployeeIds = useMemo(
    () =>
      Array.from(
        new Set(rows.map((row) => row.employeeId).filter(Boolean)),
      ).sort(),
    [rows],
  )
  const filteredNameOptions = useMemo(
    () =>
      allNames.filter((name) =>
        name.toLowerCase().includes(nameFilterSearch.toLowerCase()),
      ),
    [allNames, nameFilterSearch],
  )
  const filteredEmployeeIdOptions = useMemo(
    () =>
      allEmployeeIds.filter((employeeId) =>
        employeeId.toLowerCase().includes(employeeIdFilterSearch.toLowerCase()),
      ),
    [allEmployeeIds, employeeIdFilterSearch],
  )
  const filteredDesignationOptions = useMemo(
    () =>
      allDesignations.filter((designation) =>
        designation
          .toLowerCase()
          .includes(designationFilterSearch.toLowerCase()),
      ),
    [allDesignations, designationFilterSearch],
  )

  const isNameFilterActive = selectedNames.size > 0
  const isEmployeeIdFilterActive = selectedEmployeeIds.size > 0
  const isDesignationFilterActive = selectedDesignations.size > 0

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesName = !isNameFilterActive || selectedNames.has(row.name)
        const matchesEmployeeId =
          !isEmployeeIdFilterActive || selectedEmployeeIds.has(row.employeeId)
        const matchesDesignation =
          !isDesignationFilterActive ||
          selectedDesignations.has(row.designation)

        return matchesName && matchesEmployeeId && matchesDesignation
      }),
    [
      isDesignationFilterActive,
      isEmployeeIdFilterActive,
      isNameFilterActive,
      rows,
      selectedDesignations,
      selectedEmployeeIds,
      selectedNames,
    ],
  )

  const handleWardChange = (ward: Ward) => {
    setSelectedWard(ward)
    localStorage.setItem("selectedWardId", String(ward.wardid))
    setSelectedNames(new Set())
    setSelectedEmployeeIds(new Set())
    setSelectedDesignations(new Set())
    setNameFilterSearch("")
    setEmployeeIdFilterSearch("")
    setDesignationFilterSearch("")
    setNameFilterOpen(false)
    setEmployeeIdFilterOpen(false)
    setDesignationFilterOpen(false)
    setIsStaffFormOpen(false)
    setEditingStaff(null)
    setDeletingStaff(null)
  }

  const resetStaffForm = () => {
    setStaffForm({
      name: "",
      username: "",
      employeeId: "",
      joinDate: "",
      designation: "",
      email: "",
      password: "",
      isActive: true,
    })
  }

  const openAddStaffDialog = () => {
    setEditingStaff(null)
    resetStaffForm()
    setIsStaffFormOpen(true)
  }

  const openEditStaffDialog = (row: DirectoryRow) => {
    setEditingStaff(row)
    setStaffForm({
      name: row.name,
      username: row.username,
      employeeId: row.employeeId,
      joinDate: row.joinDate,
      designation: row.designation,
      email: row.email,
      password: "",
      isActive: row.isActive,
    })
    setIsStaffFormOpen(true)
  }

  const closeStaffDialog = () => {
    setIsStaffFormOpen(false)
    setEditingStaff(null)
    resetStaffForm()
  }

  const submitStaffForm = () => {
    if (!selectedWard || selectedWard.wardid == null) {
      showErrorToast("Please select a ward first.")
      return
    }
    const selectedWardId = selectedWard.wardid
    if (!staffForm.name.trim()) {
      showErrorToast("Name is required.")
      return
    }
    if (editingStaff && !staffForm.username.trim()) {
      showErrorToast("Username is required.")
      return
    }
    if (!staffForm.designation.trim()) {
      showErrorToast("Designation is required.")
      return
    }

    const employeeId = staffForm.employeeId.trim()

    if (editingStaff) {
      const payload: NurseManagerStaffUpdate = {
        name: staffForm.name.trim(),
        username: staffForm.username.trim(),
        join_date: staffForm.joinDate || null,
        designation: staffForm.designation.trim(),
        email: staffForm.email.trim() || null,
        is_active: staffForm.isActive,
        ward_id: selectedWardId,
      }
      if (employeeId) {
        payload.employee_id = employeeId
      }
      if (staffForm.password.trim()) {
        payload.password = staffForm.password.trim()
      }
      if (!editingStaff.userId) {
        showErrorToast("No linked user account was found for this nurse.")
        return
      }
      updateStaffMutation.mutate({ userId: editingStaff.userId, payload })
      return
    }

    const payload: NurseManagerStaffCreate = {
      name: staffForm.name.trim(),
      join_date: staffForm.joinDate || undefined,
      designation: staffForm.designation.trim(),
      email: staffForm.email.trim() || undefined,
      is_active: staffForm.isActive,
      ward_id: selectedWardId,
    }
    if (employeeId) {
      payload.employee_id = employeeId
    }
    if (staffForm.username.trim()) {
      payload.username = staffForm.username.trim()
    }
    if (staffForm.password.trim()) {
      payload.password = staffForm.password.trim()
    }
    createStaffMutation.mutate(payload)
  }

  const toggleName = (name: string) => {
    setSelectedNames((previous) => {
      const next = new Set(previous)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const toggleEmployeeId = (employeeId: string) => {
    setSelectedEmployeeIds((previous) => {
      const next = new Set(previous)
      if (next.has(employeeId)) {
        next.delete(employeeId)
      } else {
        next.add(employeeId)
      }
      return next
    })
  }

  const toggleDesignation = (designation: string) => {
    setSelectedDesignations((previous) => {
      const next = new Set(previous)
      if (next.has(designation)) {
        next.delete(designation)
      } else {
        next.add(designation)
      }
      return next
    })
  }

  const handleShiftPatternChange = async (
    nurseId: number,
    nextValue: string | undefined,
  ) => {
    const shiftPattern = toApiShiftPattern(nextValue)
    setSavingPatternNurseId(nurseId)
    try {
      await updateShiftPattern.mutateAsync({ nurseId, shiftPattern })
      showSuccessToast("Permanent shift pattern updated.")
      queryClient.invalidateQueries({
        queryKey: ["nurse-manager", "staff-directory", selectedWard?.wardid],
      })
    } catch (error) {
      showErrorToast(getErrorMessage(error))
    } finally {
      setSavingPatternNurseId(null)
    }
  }

  const copyPassword = async (password: string, onCopied: () => void) => {
    if (!password) {
      showErrorToast("No password available to copy.")
      return
    }

    try {
      await navigator.clipboard.writeText(password)
      onCopied()
      showSuccessToast("Password copied to clipboard.")
    } catch {
      showErrorToast("Unable to copy password. Please copy it manually.")
    }
  }

  const handleCopyGeneratedPassword = () => {
    const password = generatedPasswordInfo?.generatedPassword
    if (!password) {
      showErrorToast("No password available to copy.")
      return
    }

    copyPassword(password, () => {
      setPasswordCopied(true)
      setTimeout(() => setPasswordCopied(false), 1500)
    })
  }

  const isLoading =
    wardsLoading || (!!selectedWard && (isStaffLoading || isStatisticsLoading))

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
                )
                if (ward) {
                  handleWardChange(ward)
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
            <Box
              as="button"
              display="inline-flex"
              alignItems="center"
              gap={2}
              px={3}
              py={2}
              rounded="md"
              bg="primary"
              color="white"
              fontSize="sm"
              fontWeight="medium"
              _hover={{ opacity: 0.9 }}
              aria-disabled={!selectedWard}
              opacity={!selectedWard ? 0.6 : 1}
              cursor={!selectedWard ? "not-allowed" : "pointer"}
              onClick={() => {
                if (!selectedWard) {
                  return
                }
                openAddStaffDialog()
              }}
            >
              <Plus size={14} />
              Add User
            </Box>
            <Text fontSize="sm">
              Nurses:{" "}
              <Box as="span" color="primary" fontWeight="semibold">
                {rows.length}
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
            no-night settings are now managed from roster planning for the
            selected roster period.
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
          ) : isStaffError ? (
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
                            event.stopPropagation()
                            setNameFilterOpen((open) => !open)
                            setEmployeeIdFilterOpen(false)
                            setDesignationFilterOpen(false)
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
                        setSelectedNames(new Set())
                        setNameFilterSearch("")
                      }}
                      anchorRef={nameFilterAnchorRef}
                    />
                  </Table.ColumnHeader>

                  <Table.ColumnHeader
                    minW="160px"
                    py={4}
                    px={4}
                    borderBottom="1px solid"
                    borderColor="blackAlpha.100"
                    color="foreground"
                    fontWeight="medium"
                  >
                    Username
                  </Table.ColumnHeader>
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
                      <Text fontSize="sm">Employee ID</Text>
                      <Box
                        position="relative"
                        display="inline-flex"
                        ref={employeeIdFilterAnchorRef}
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
                            isEmployeeIdFilterActive ? "primary" : "foreground"
                          }
                          bg={
                            isEmployeeIdFilterActive ? "#e0f2fe" : "transparent"
                          }
                          _hover={{ bg: "#e0f2fe", color: "primary" }}
                          _active={{ bg: "#bae6fd", color: "#0e7490" }}
                          transition="all 0.15s ease"
                          onClick={(event) => {
                            event.stopPropagation()
                            setEmployeeIdFilterOpen((open) => !open)
                            setNameFilterOpen(false)
                            setDesignationFilterOpen(false)
                          }}
                          title="Filter by employee ID"
                        >
                          <Filter size={14} />
                        </Box>
                        {isEmployeeIdFilterActive && (
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
                      title="Filter by Employee ID"
                      placeholder="Search employee ID..."
                      open={employeeIdFilterOpen}
                      onOpenChange={setEmployeeIdFilterOpen}
                      search={employeeIdFilterSearch}
                      onSearchChange={setEmployeeIdFilterSearch}
                      options={filteredEmployeeIdOptions}
                      selectedValues={selectedEmployeeIds}
                      onToggle={toggleEmployeeId}
                      onSelectAll={() =>
                        setSelectedEmployeeIds(new Set(allEmployeeIds))
                      }
                      onClear={() => {
                        setSelectedEmployeeIds(new Set())
                        setEmployeeIdFilterSearch("")
                      }}
                      anchorRef={employeeIdFilterAnchorRef}
                    />
                  </Table.ColumnHeader>
                  <Table.ColumnHeader
                    minW="160px"
                    py={4}
                    px={4}
                    borderBottom="1px solid"
                    borderColor="blackAlpha.100"
                    color="foreground"
                    fontWeight="medium"
                  >
                    Join Date
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
                            event.stopPropagation()
                            setDesignationFilterOpen((open) => !open)
                            setNameFilterOpen(false)
                            setEmployeeIdFilterOpen(false)
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
                        setSelectedDesignations(new Set())
                        setDesignationFilterSearch("")
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
                  <Table.ColumnHeader
                    minW="160px"
                    py={4}
                    px={4}
                    borderBottom="1px solid"
                    borderColor="blackAlpha.100"
                    color="foreground"
                    fontWeight="medium"
                  >
                    Actions
                  </Table.ColumnHeader>
                </Table.Row>
              </Table.Header>

              <Table.Body>
                {!selectedWard ? (
                  <Table.Row>
                    <Table.Cell
                      colSpan={9}
                      textAlign="center"
                      py={12}
                      color="foreground"
                    >
                      Select a ward to view staff.
                    </Table.Cell>
                  </Table.Row>
                ) : filteredRows.length === 0 ? (
                  <Table.Row>
                    <Table.Cell
                      colSpan={9}
                      textAlign="center"
                      py={12}
                      color="foreground"
                    >
                      {rows.length === 0
                        ? "No nurses were found for this ward."
                        : "No staff match the selected filters."}
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  filteredRows.map((row) => {
                    const isSavingPattern = savingPatternNurseId === row.nurseId
                    const hasLinkedAccount = row.userId != null
                    const canResendFirstLoginSetup =
                      hasLinkedAccount &&
                      row.mustChangePassword &&
                      Boolean(row.email) &&
                      !resendFirstLoginSetupMutation.isPending

                    return (
                      <Table.Row
                        key={row.nurseId}
                        bg="white"
                        _hover={{ bg: "gray.50" }}
                      >
                        <Table.Cell
                          py={3}
                          px={4}
                          borderBottom="1px solid"
                          borderColor="blackAlpha.100"
                        >
                          <Text fontSize="sm" color="black" fontWeight="medium">
                            {row.name}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          py={3}
                          px={4}
                          borderBottom="1px solid"
                          borderColor="blackAlpha.100"
                        >
                          <Text fontSize="sm" color="black">
                            {row.username}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          py={3}
                          px={4}
                          borderBottom="1px solid"
                          borderColor="blackAlpha.100"
                        >
                          <Text fontSize="sm" color="black">
                            {row.employeeId}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          py={3}
                          px={4}
                          borderBottom="1px solid"
                          borderColor="blackAlpha.100"
                        >
                          <Text fontSize="sm" color="black">
                            {formatJoinDate(row.joinDate)}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          py={3}
                          px={4}
                          borderBottom="1px solid"
                          borderColor="blackAlpha.100"
                        >
                          <Text fontSize="sm" color="black">
                            {row.designation}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          py={3}
                          px={4}
                          borderBottom="1px solid"
                          borderColor="blackAlpha.100"
                        >
                          <Select.Root
                            collection={shiftPatternCollection}
                            size="sm"
                            width="220px"
                            value={[row.shiftPattern ?? "NONE"]}
                            disabled={isSavingPattern}
                            onValueChange={(details) =>
                              handleShiftPatternChange(
                                row.nurseId,
                                details.value[0],
                              )
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
                                  {shiftPatternCollection.items.map(
                                    (pattern) => (
                                      <Select.Item
                                        key={pattern.value}
                                        item={pattern}
                                      >
                                        {pattern.label}
                                      </Select.Item>
                                    ),
                                  )}
                                </Select.Content>
                              </Select.Positioner>
                            </Portal>
                          </Select.Root>
                        </Table.Cell>
                        <Table.Cell
                          py={3}
                          px={4}
                          borderBottom="1px solid"
                          borderColor="blackAlpha.100"
                        >
                          <Text fontSize="sm" color="black">
                            {row.email || "Not available"}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          py={3}
                          px={4}
                          borderBottom="1px solid"
                          borderColor="blackAlpha.100"
                        >
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
                        <Table.Cell
                          py={3}
                          px={4}
                          borderBottom="1px solid"
                          borderColor="blackAlpha.100"
                        >
                          <HStack justify="flex-end" gap={1}>
                            {hasLinkedAccount &&
                            row.mustChangePassword &&
                            row.email ? (
                              <Box
                                as="button"
                                p={2}
                                rounded="md"
                                color="gray.500"
                                opacity={
                                  resendFirstLoginSetupMutation.isPending
                                    ? 0.6
                                    : 1
                                }
                                cursor={
                                  resendFirstLoginSetupMutation.isPending
                                    ? "not-allowed"
                                    : "pointer"
                                }
                                _hover={
                                  resendFirstLoginSetupMutation.isPending
                                    ? undefined
                                    : { color: "teal.600", bg: "teal.50" }
                                }
                                onClick={() => {
                                  if (!canResendFirstLoginSetup) {
                                    return
                                  }
                                  resendFirstLoginSetupMutation.mutate(
                                    row.userId!,
                                  )
                                }}
                                title="Resend first-login setup email"
                              >
                                <Mail size={14} />
                              </Box>
                            ) : null}
                            <Box
                              as="button"
                              p={2}
                              rounded="md"
                              color="gray.500"
                              opacity={hasLinkedAccount ? 1 : 0.4}
                              cursor={
                                hasLinkedAccount ? "pointer" : "not-allowed"
                              }
                              _hover={
                                hasLinkedAccount
                                  ? { color: "orange.600", bg: "orange.50" }
                                  : undefined
                              }
                              onClick={() => {
                                if (!hasLinkedAccount) {
                                  return
                                }
                                setResetPasswordStaff(row)
                              }}
                              title="Generate temporary password"
                            >
                              <KeyRound size={14} />
                            </Box>
                            <Box
                              as="button"
                              p={2}
                              rounded="md"
                              color="gray.500"
                              opacity={hasLinkedAccount ? 1 : 0.4}
                              cursor={
                                hasLinkedAccount ? "pointer" : "not-allowed"
                              }
                              _hover={
                                hasLinkedAccount
                                  ? { color: "blue.600", bg: "blue.50" }
                                  : undefined
                              }
                              onClick={() => {
                                if (!hasLinkedAccount) {
                                  return
                                }
                                openEditStaffDialog(row)
                              }}
                              title="Edit user"
                            >
                              <Pencil size={14} />
                            </Box>
                            <Box
                              as="button"
                              p={2}
                              rounded="md"
                              color="gray.500"
                              opacity={hasLinkedAccount ? 1 : 0.4}
                              cursor={
                                hasLinkedAccount ? "pointer" : "not-allowed"
                              }
                              _hover={
                                hasLinkedAccount
                                  ? { color: "red.600", bg: "red.50" }
                                  : undefined
                              }
                              onClick={() => {
                                if (!hasLinkedAccount) {
                                  return
                                }
                                setDeletingStaff(row)
                              }}
                              title="Delete user"
                            >
                              <Trash2 size={14} />
                            </Box>
                          </HStack>
                        </Table.Cell>
                      </Table.Row>
                    )
                  })
                )}
              </Table.Body>
            </Table.Root>
          )}
        </Box>
      </VStack>

      {isStaffFormOpen && (
        <Box
          position="fixed"
          inset={0}
          bg="blackAlpha.600"
          zIndex={1500}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={4}
        >
          <Box bg="white" rounded="lg" w="full" maxW="lg" boxShadow="xl">
            <Flex
              align="center"
              justify="space-between"
              p={5}
              borderBottomWidth="1px"
            >
              <Text fontSize="lg" fontWeight="semibold">
                {editingStaff ? "Edit User" : "Add User"}
              </Text>
              <Box
                as="button"
                onClick={closeStaffDialog}
                color="gray.500"
                _hover={{ color: "gray.700" }}
              >
                <X size={16} />
              </Box>
            </Flex>

            <VStack align="stretch" gap={3} p={5}>
              <Box>
                <Text fontSize="sm" mb={1} color="gray.700">
                  Name
                </Text>
                <Input
                  value={staffForm.name}
                  onChange={(event) =>
                    setStaffForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Staff name"
                />
              </Box>

              {editingStaff ? (
                <Box>
                  <Text fontSize="sm" mb={1} color="gray.700">
                    Username
                  </Text>
                  <Input
                    value={staffForm.username}
                    onChange={(event) =>
                      setStaffForm((prev) => ({
                        ...prev,
                        username: event.target.value,
                      }))
                    }
                    placeholder="username"
                  />
                </Box>
              ) : (
                <Text fontSize="xs" color="gray.500">
                  Username will be auto-generated from Name.
                </Text>
              )}

              <HStack gap={3} align="start">
                <Box flex="1">
                  <Text fontSize="sm" mb={1} color="gray.700">
                    Employee ID (optional)
                  </Text>
                  <Input
                    value={staffForm.employeeId}
                    onChange={(event) =>
                      setStaffForm((prev) => ({
                        ...prev,
                        employeeId: event.target.value,
                      }))
                    }
                    placeholder="Employee can enter on first login"
                  />
                </Box>
                <Box flex="1">
                  <Text fontSize="sm" mb={1} color="gray.700">
                    Join Date
                  </Text>
                  <Input
                    type="date"
                    value={staffForm.joinDate}
                    onChange={(event) =>
                      setStaffForm((prev) => ({
                        ...prev,
                        joinDate: event.target.value,
                      }))
                    }
                  />
                </Box>
              </HStack>

              <HStack gap={3} align="start">
                <Box flex="1">
                  <Text fontSize="sm" mb={1} color="gray.700">
                    Designation
                  </Text>
                  <select
                    value={staffForm.designation}
                    onChange={(event) =>
                      setStaffForm((prev) => ({
                        ...prev,
                        designation: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 focus:border-[#4B8798] focus:shadow-[0_0_0_1px_#4B8798] focus:outline-none"
                    style={{
                      color: staffForm.designation ? "#111827" : "#6B7280",
                    }}
                  >
                    <option value="">Select designation</option>
                    {designationOptions.map((designation) => (
                      <option key={designation} value={designation}>
                        {designation}
                      </option>
                    ))}
                    {editingStaff &&
                      staffForm.designation &&
                      !designationOptions.includes(staffForm.designation) && (
                        <option value={staffForm.designation}>
                          {staffForm.designation}
                        </option>
                      )}
                  </select>
                </Box>
              </HStack>

              <Box>
                <Text fontSize="sm" mb={1} color="gray.700">
                  Email (optional)
                </Text>
                <Input
                  value={staffForm.email}
                  onChange={(event) =>
                    setStaffForm((prev) => ({
                      ...prev,
                      email: event.target.value,
                    }))
                  }
                  placeholder="user@example.com"
                />
              </Box>

              <Box>
                <Text fontSize="sm" mb={1} color="gray.700">
                  Password{" "}
                  {editingStaff
                    ? "(leave blank to keep current)"
                    : "(leave blank to auto-generate)"}
                </Text>
                <Input
                  type="password"
                  value={staffForm.password}
                  onChange={(event) =>
                    setStaffForm((prev) => ({
                      ...prev,
                      password: event.target.value,
                    }))
                  }
                  placeholder="********"
                />
              </Box>

              <HStack gap={2}>
                <input
                  id="staff-active"
                  type="checkbox"
                  checked={staffForm.isActive}
                  onChange={(event) =>
                    setStaffForm((prev) => ({
                      ...prev,
                      isActive: event.target.checked,
                    }))
                  }
                />
                <label
                  htmlFor="staff-active"
                  style={{
                    color: "#374151",
                    fontSize: "0.875rem",
                  }}
                >
                  Active
                </label>
              </HStack>
            </VStack>

            <Flex justify="end" gap={3} p={5} borderTopWidth="1px">
              <Box
                as="button"
                px={4}
                py={2}
                rounded="md"
                borderWidth="1px"
                borderColor="gray.200"
                color="gray.700"
                onClick={closeStaffDialog}
              >
                Cancel
              </Box>
              <Box
                as="button"
                px={4}
                py={2}
                rounded="md"
                bg="primary"
                color="white"
                onClick={submitStaffForm}
                aria-disabled={
                  createStaffMutation.isPending || updateStaffMutation.isPending
                }
                opacity={
                  createStaffMutation.isPending || updateStaffMutation.isPending
                    ? 0.6
                    : 1
                }
                cursor={
                  createStaffMutation.isPending || updateStaffMutation.isPending
                    ? "not-allowed"
                    : "pointer"
                }
              >
                {createStaffMutation.isPending || updateStaffMutation.isPending
                  ? "Saving..."
                  : editingStaff
                    ? "Update"
                    : "Create"}
              </Box>
            </Flex>
          </Box>
        </Box>
      )}

      {resetPasswordStaff && (
        <Box
          position="fixed"
          inset={0}
          bg="blackAlpha.600"
          zIndex={1500}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={4}
        >
          <Box bg="white" rounded="lg" w="full" maxW="md" boxShadow="xl" p={6}>
            <Text fontSize="lg" fontWeight="semibold" mb={2}>
              Reset Password
            </Text>
            <Text fontSize="sm" color="gray.600" mb={6}>
              Generate a new temporary password for{" "}
              <Box as="span" fontWeight="semibold">
                {resetPasswordStaff.username || resetPasswordStaff.name}
              </Box>
              ? The current password will stop working immediately.
            </Text>
            <Flex justify="end" gap={3}>
              <Box
                as="button"
                px={4}
                py={2}
                rounded="md"
                borderWidth="1px"
                borderColor="gray.200"
                color="gray.700"
                onClick={() => setResetPasswordStaff(null)}
              >
                Cancel
              </Box>
              <Box
                as="button"
                px={4}
                py={2}
                rounded="md"
                bg="orange.600"
                color="white"
                onClick={() => {
                  if (resetStaffPasswordMutation.isPending) {
                    return
                  }
                  if (!resetPasswordStaff.userId) {
                    showErrorToast(
                      "No linked user account was found for this nurse.",
                    )
                    return
                  }
                  resetStaffPasswordMutation.mutate(resetPasswordStaff.userId)
                }}
                aria-disabled={resetStaffPasswordMutation.isPending}
                opacity={resetStaffPasswordMutation.isPending ? 0.6 : 1}
                cursor={
                  resetStaffPasswordMutation.isPending
                    ? "not-allowed"
                    : "pointer"
                }
              >
                {resetStaffPasswordMutation.isPending
                  ? "Resetting..."
                  : "Reset Password"}
              </Box>
            </Flex>
          </Box>
        </Box>
      )}

      {deletingStaff && (
        <Box
          position="fixed"
          inset={0}
          bg="blackAlpha.600"
          zIndex={1500}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={4}
        >
          <Box bg="white" rounded="lg" w="full" maxW="md" boxShadow="xl" p={6}>
            <Text fontSize="lg" fontWeight="semibold" mb={2}>
              Delete User
            </Text>
            <Text fontSize="sm" color="gray.600" mb={6}>
              Are you sure you want to delete {deletingStaff.username}? This
              action cannot be undone.
            </Text>
            <Flex justify="end" gap={3}>
              <Box
                as="button"
                px={4}
                py={2}
                rounded="md"
                borderWidth="1px"
                borderColor="gray.200"
                color="gray.700"
                onClick={() => setDeletingStaff(null)}
              >
                Cancel
              </Box>
              <Box
                as="button"
                px={4}
                py={2}
                rounded="md"
                bg="red.600"
                color="white"
                onClick={() => {
                  if (deleteStaffMutation.isPending) {
                    return
                  }
                  if (!deletingStaff.userId) {
                    showErrorToast(
                      "No linked user account was found for this nurse.",
                    )
                    return
                  }
                  deleteStaffMutation.mutate(deletingStaff.userId)
                }}
                aria-disabled={deleteStaffMutation.isPending}
                opacity={deleteStaffMutation.isPending ? 0.6 : 1}
                cursor={
                  deleteStaffMutation.isPending ? "not-allowed" : "pointer"
                }
              >
                {deleteStaffMutation.isPending ? "Deleting..." : "Delete"}
              </Box>
            </Flex>
          </Box>
        </Box>
      )}

      {generatedPasswordInfo && (
        <Box
          position="fixed"
          inset={0}
          bg="blackAlpha.600"
          zIndex={1500}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={4}
        >
          <Box bg="white" rounded="lg" w="full" maxW="md" boxShadow="xl" p={6}>
            <Text fontSize="lg" fontWeight="semibold" mb={2}>
              Temporary Password
            </Text>
            <Text fontSize="sm" color="gray.600" mb={4}>
              Share these credentials with{" "}
              <Box as="span" fontWeight="semibold">
                {generatedPasswordInfo.username}
              </Box>
              .
            </Text>
            <Box
              borderWidth="1px"
              borderColor="gray.200"
              rounded="md"
              p={3}
              mb={5}
            >
              <Flex justify="space-between" gap={3} mb={2}>
                <Text fontSize="sm" color="gray.500">
                  Username:
                </Text>
                <Text fontSize="sm" color="gray.900" fontWeight="medium">
                  {generatedPasswordInfo.username}
                </Text>
              </Flex>
              <Flex justify="space-between" gap={3}>
                <Text fontSize="sm" color="gray.500">
                  Password:
                </Text>
                <Text
                  fontSize="sm"
                  color="gray.900"
                  fontFamily="mono"
                  fontWeight="medium"
                >
                  {generatedPasswordInfo.generatedPassword}
                </Text>
              </Flex>
            </Box>
            <Flex justify="end" gap={3}>
              <Box
                as="button"
                px={4}
                py={2}
                rounded="md"
                borderWidth="1px"
                borderColor="gray.200"
                color="gray.700"
                onClick={handleCopyGeneratedPassword}
              >
                {passwordCopied ? "Copied!" : "Copy Password"}
              </Box>
              <Box
                as="button"
                px={4}
                py={2}
                rounded="md"
                bg="primary"
                color="white"
                onClick={() => {
                  setPasswordCopied(false)
                  setGeneratedPasswordInfo(null)
                }}
              >
                Done
              </Box>
            </Flex>
          </Box>
        </Box>
      )}
    </Flex>
  )
}

export default WardStaffDirectoryPage
