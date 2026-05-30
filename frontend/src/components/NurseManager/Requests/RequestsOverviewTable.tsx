import {
  Badge,
  Box,
  Button,
  CloseButton,
  Dialog,
  Flex,
  HStack,
  Portal,
  Spinner,
  Table,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { ShiftRequestsService } from "@/client"
import { LeaveRequestsService } from "@/client/LeaveRequestsService"
import { getShiftColor } from "@/components/NurseManager/RosterTable/types"
import { Checkbox } from "@/components/ui/checkbox"
import { showErrorToast, showSuccessToast } from "@/components/ui/toast"
import { NMReviewLeaveRequest } from "./LeaveRequests/NMReviewLeaveRequest"
import type { RequestStatus, UnifiedRequest } from "./RequestReviewModal"
import { ReviewShiftRequest } from "./ShiftRequests/ReviewShiftRequest"

// ─── Tab definitions ──────────────────────────────────────────────────────────
type TabFilter = "all" | "shift" | "leave"

const TABS: { id: TabFilter; label: string }[] = [
  { id: "all", label: "All Types" },
  { id: "shift", label: "Shift Requests" },
  { id: "leave", label: "Leave Requests" },
]

const PAGE_SIZE = 30
const LOCKED_PERIOD_STATUSES = new Set(["Finalized", "Published"])

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  const day = d.getDate()
  const month = d.getMonth() + 1
  const year = d.getFullYear()
  return `${day}/${month < 10 ? `0${month}` : month}/${year}`
}

function parseLocalDate(value?: string | null): Date | null {
  if (!value) return null
  const [year, month, day] = value.split("-")
  if (year && month && day) {
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function requestKey(request: UnifiedRequest): string {
  return `${request.type}-${request.id}`
}

// ─── Status cell ─────────────────────────────────────────────────────────────
function StatusCell({ status }: { status: RequestStatus }) {
  if (status === "Pending") {
    return (
      <Flex justify="center">
        <Badge
          bg="#FEF3C7"
          color="#D97706"
          fontWeight="medium"
          fontSize="xs"
          px={3}
          py={0.5}
          rounded="full"
          textTransform="none"
          display="inline-flex"
        >
          Pending
        </Badge>
      </Flex>
    )
  }
  if (status === "Approved") {
    return (
      <Flex justify="center">
        <Badge
          bg="#DDF2D1"
          color="#14532d"
          fontWeight="medium"
          fontSize="xs"
          px={3}
          py={0.5}
          rounded="full"
          textTransform="none"
          display="inline-flex"
        >
          Approved
        </Badge>
      </Flex>
    )
  }
  if (status === "Rejected") {
    return (
      <Flex justify="center">
        <Badge
          bg="#F3cFce"
          color="#7f1d1d"
          fontWeight="medium"
          fontSize="xs"
          px={3}
          py={0.5}
          rounded="full"
          textTransform="none"
          display="inline-flex"
        >
          Rejected
        </Badge>
      </Flex>
    )
  }
  return (
    <Text fontSize="xs" color="gray.400">
      {status}
    </Text>
  )
}

// ─── Type label cell ─────────────────────────────────────────────────────────
function TypeCell({ type }: { type: "ShiftRequest" | "LeaveRequest" }) {
  return (
    <Text
      fontSize="sm"
      color="#4B8798"
      fontWeight="medium"
      whiteSpace="nowrap"
      cursor="pointer"
    >
      {type === "ShiftRequest" ? "Shift Request" : "Leave Request"}
    </Text>
  )
}

// Fallback: resolve code from full name (covers both shift and leave)
const NAME_TO_CODE: Record<string, string> = {
  // Shift
  "Day Shift": "D",
  "AM Shift": "A",
  "PM Shift": "P",
  "Night Shift": "N",
  "Night 12h": "N-12",
  // Leave
  "Annual Leave": "AL",
  "Medical Certificate": "MC",
  "Urgent Leave": "URG",
  "Birthday Leave": "BCL",
  "Childcare Leave": "CCL",
  "Marriage Leave": "ML",
  "Compassionate Leave": "CL",
  "Extended Marriage Leave": "EML",
  "Day Off": "DO",
}

// ─── Request type badge ───────────────────────────────────────────────────────
function RequestTypeBadge({
  name,
  shiftCode,
}: {
  name: string
  shiftCode?: string | null
}) {
  const code = shiftCode ?? NAME_TO_CODE[name] ?? null
  const color = code ? getShiftColor(code) : null

  if (code && color) {
    return (
      <HStack gap={2} align="center">
        <Badge
          bg={color}
          color="white"
          fontWeight="bold"
          fontSize="xs"
          px={2}
          py={0.5}
          rounded="md"
          minW="22px"
          textAlign="center"
          textTransform="none"
        >
          {code}
        </Badge>
        <Text fontSize="sm" color="#4A4A4A" whiteSpace="nowrap">
          {name}
        </Text>
      </HStack>
    )
  }

  // Unknown type fallback
  return (
    <Badge
      bg="#9db8c0"
      color="white"
      fontWeight="medium"
      fontSize="xs"
      px={3}
      py={0.5}
      rounded="md"
      textTransform="none"
      whiteSpace="nowrap"
    >
      {name}
    </Badge>
  )
}

// ─── Sort icon ────────────────────────────────────────────────────────────────
function SortIcon({ direction }: { direction: "asc" | "desc" | null }) {
  if (direction === "asc")
    return <ChevronUp className="h-3.5 w-3.5 inline ml-0.5" />
  if (direction === "desc")
    return <ChevronDown className="h-3.5 w-3.5 inline ml-0.5" />
  return <ChevronsUpDown className="h-3.5 w-3.5 inline ml-0.5 opacity-40" />
}

// ─── Main component ───────────────────────────────────────────────────────────
interface RequestsOverviewTableProps {
  wardId?: number | null
  wardSelector?: ReactNode
}

export function RequestsOverviewTable({
  wardId,
  wardSelector,
}: RequestsOverviewTableProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabFilter>("all")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [page, setPage] = useState(1)
  const [selectedRequestKeys, setSelectedRequestKeys] = useState<Set<string>>(
    new Set(),
  )
  const [isDenyDialogOpen, setIsDenyDialogOpen] = useState(false)
  const [bulkDenyReason, setBulkDenyReason] = useState("")
  const [selectedShiftRequest, setSelectedShiftRequest] =
    useState<UnifiedRequest | null>(null)
  const [selectedLeaveRequest, setSelectedLeaveRequest] =
    useState<UnifiedRequest | null>(null)
  const [expandedComments, setExpandedComments] = useState<Set<number>>(
    new Set(),
  )

  const toggleComment = (id: number) =>
    setExpandedComments((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // Local overrides for optimistic status updates
  // ── Fetch shift requests ──────────────────────────────────────────────────
  const { data: shiftRequests = [], isLoading: shiftLoading } = useQuery({
    queryKey: ["shift-requests", "ward", wardId],
    queryFn: () =>
      ShiftRequestsService.getShiftRequestsByWard({ wardId: wardId! }),
    enabled: !!wardId,
    staleTime: 30_000,
  })

  const { data: leaveRequests = [], isLoading: leaveLoading } = useQuery({
    queryKey: ["ward-leave-requests", wardId],
    queryFn: () =>
      LeaveRequestsService.getWardLeaveRequests({ wardId: wardId! }),
    enabled: !!wardId,
    staleTime: 30_000,
  })

  // ── Fetch shift codes for display names ──────────────────────────────────
  const { data: shiftCodes = [] } = useQuery({
    queryKey: ["shift-codes", "all"],
    queryFn: () => ShiftRequestsService.getAllShiftCodes(),
    staleTime: 5 * 60_000,
  })

  // ── Fetch ward nurses for nurse name display ──────────────────────────────
  const { data: wardNurses = [] } = useQuery({
    queryKey: ["ward-nurses", wardId],
    queryFn: () => ShiftRequestsService.getWardNurses({ wardId: wardId! }),
    enabled: !!wardId,
    staleTime: 5 * 60_000,
  })

  const { data: rosterPeriods = [] } = useQuery({
    queryKey: ["roster-periods"],
    queryFn: () => ShiftRequestsService.getRosterPeriods(),
    staleTime: 5 * 60_000,
  })

  const shiftCodeMap = useMemo(() => {
    const map = new Map<string, string>()
    shiftCodes.forEach((sc) => {
      map.set(sc.shiftcode, sc.description)
    })
    return map
  }, [shiftCodes])

  const nurseMap = useMemo(() => {
    const map = new Map<number, string>()
    wardNurses.forEach((n) => {
      map.set(n.nurseid, n.name)
    })
    return map
  }, [wardNurses])

  // ── Build unified list ────────────────────────────────────────────────────
  const allRequests: UnifiedRequest[] = useMemo(() => {
    const fromShift: UnifiedRequest[] = wardId
      ? shiftRequests.map((sr) => ({
          id: sr.requestid,
          type: "ShiftRequest" as const,
          periodId: sr.periodid,
          requestTypeName:
            shiftCodeMap.get(sr.preferredshifttype) || sr.preferredshifttype,
          shiftCode: sr.preferredshifttype,
          requestedDates: formatDate(sr.preferreddate),
          rawPreferredDate: sr.preferreddate,
          status: sr.status as RequestStatus,
          applicationDate: formatDate(sr.timestamp),
          rawApplicationDate: sr.timestamp,
          comments: sr.reason,
          nurseName: nurseMap.get(sr.nurseid) ?? null,
        }))
      : []

    const fromLeave: UnifiedRequest[] = wardId
      ? leaveRequests.map((lr) => ({
          id: lr.leaveid,
          type: "LeaveRequest" as const,
          requestTypeName: lr.leavetype,
          requestedDates:
            lr.startdate === lr.enddate
              ? formatDate(lr.startdate)
              : `${formatDate(lr.startdate)} – ${formatDate(lr.enddate)}`,
          rawStartDate: lr.startdate,
          rawEndDate: lr.enddate,
          status: lr.status as RequestStatus,
          applicationDate: formatDate(lr.requestedat),
          rawApplicationDate: lr.requestedat,
          comments: lr.reason,
          nurseName: nurseMap.get(lr.nurseid) ?? null,
        }))
      : []

    return [...fromShift, ...fromLeave]
  }, [wardId, shiftRequests, leaveRequests, shiftCodeMap, nurseMap])

  // ── Filter by tab ─────────────────────────────────────────────────────────
  const filteredRequests = useMemo(() => {
    if (activeTab === "shift")
      return allRequests.filter((r) => r.type === "ShiftRequest")
    if (activeTab === "leave")
      return allRequests.filter((r) => r.type === "LeaveRequest")
    return allRequests
  }, [allRequests, activeTab])

  // ── Sort by application date (Pending always first) ──────────────────────
  const sortedRequests = useMemo(() => {
    return [...filteredRequests].sort((a, b) => {
      // Pending items always float to the top
      const pendingFirst = (s: RequestStatus) => (s === "Pending" ? 0 : 1)
      const statusDiff = pendingFirst(a.status) - pendingFirst(b.status)
      if (statusDiff !== 0) return statusDiff

      const parse = (d: string) => {
        // d may be "D/MM/YYYY" or "D/MM/YYYY – D/MM/YYYY"
        const first = d.split("–")[0].trim()
        const parts = first.split("/")
        if (parts.length === 3) {
          return new Date(
            parseInt(parts[2], 10),
            parseInt(parts[1], 10) - 1,
            parseInt(parts[0], 10),
          ).getTime()
        }
        return new Date(d).getTime()
      }
      const leftDate = a.rawApplicationDate ?? a.applicationDate
      const rightDate = b.rawApplicationDate ?? b.applicationDate
      const diff = parse(leftDate) - parse(rightDate)
      return sortDir === "asc" ? diff : -diff
    })
  }, [filteredRequests, sortDir])

  // ── Paginate ──────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sortedRequests.length / PAGE_SIZE))
  const currentPageData = sortedRequests.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  )

  const lockedPeriods = useMemo(
    () =>
      rosterPeriods.filter((period) =>
        LOCKED_PERIOD_STATUSES.has(period.status),
      ),
    [rosterPeriods],
  )

  const lockedShiftPeriodIds = useMemo(
    () =>
      new Set(
        lockedPeriods
          .map((period) => period.periodid)
          .filter((periodId): periodId is number => periodId != null),
      ),
    [lockedPeriods],
  )

  const isRequestEligible = useCallback(
    (request: UnifiedRequest) => {
      if (request.type === "ShiftRequest") {
        return !(
          request.periodId != null && lockedShiftPeriodIds.has(request.periodId)
        )
      }

      const requestStart = parseLocalDate(request.rawStartDate)
      const requestEnd = parseLocalDate(
        request.rawEndDate ?? request.rawStartDate,
      )
      if (!requestStart || !requestEnd) return true

      return !lockedPeriods.some((period) => {
        const periodStart = parseLocalDate(period.startdate)
        const periodEnd = parseLocalDate(period.enddate)
        if (!periodStart || !periodEnd) return false
        return requestStart <= periodEnd && requestEnd >= periodStart
      })
    },
    [lockedPeriods, lockedShiftPeriodIds],
  )

  const visibleEligibleRequests = currentPageData.filter(isRequestEligible)
  const selectedRequests = filteredRequests.filter(
    (request) =>
      selectedRequestKeys.has(requestKey(request)) &&
      isRequestEligible(request),
  )
  const selectedCount = selectedRequests.length
  const allVisibleEligibleSelected =
    visibleEligibleRequests.length > 0 &&
    visibleEligibleRequests.every((request) =>
      selectedRequestKeys.has(requestKey(request)),
    )
  const someVisibleEligibleSelected = visibleEligibleRequests.some((request) =>
    selectedRequestKeys.has(requestKey(request)),
  )
  const headerSelectionState = allVisibleEligibleSelected
    ? true
    : someVisibleEligibleSelected
      ? "indeterminate"
      : false

  const handleTabChange = (tab: TabFilter) => {
    setActiveTab(tab)
    setPage(1)
  }

  const handleSortToggle = () => {
    setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    setPage(1)
  }

  const toggleRequestSelection = (request: UnifiedRequest) => {
    if (!isRequestEligible(request)) return

    setSelectedRequestKeys((prev) => {
      const next = new Set(prev)
      const key = requestKey(request)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleVisibleSelection = () => {
    setSelectedRequestKeys((prev) => {
      const next = new Set(prev)
      if (allVisibleEligibleSelected) {
        visibleEligibleRequests.forEach((request) => {
          next.delete(requestKey(request))
        })
      } else {
        visibleEligibleRequests.forEach((request) => {
          next.add(requestKey(request))
        })
      }
      return next
    })
  }

  const clearSelection = () => setSelectedRequestKeys(new Set())

  const bulkReviewMutation = useMutation({
    mutationFn: async ({
      action,
      reason,
    }: {
      action: "Approved" | "Rejected"
      reason?: string
    }) => {
      const targets = selectedRequests
      const settled = await Promise.allSettled(
        targets.map(async (request) => {
          if (request.type === "ShiftRequest") {
            await ShiftRequestsService.reviewShiftRequest({
              requestId: request.id,
              requestBody: {
                status: action,
                rejectionreason:
                  action === "Rejected" && reason?.trim()
                    ? reason.trim()
                    : undefined,
              },
            })
          } else {
            await LeaveRequestsService.reviewLeaveRequest({
              leaveId: request.id,
              status: action,
            })
          }

          return requestKey(request)
        }),
      )

      const successKeys: string[] = []
      let failed = 0

      settled.forEach((result) => {
        if (result.status === "fulfilled") {
          successKeys.push(result.value)
        } else {
          failed += 1
        }
      })

      return { action, failed, successKeys, total: targets.length }
    },
    onSuccess: ({ action, failed, successKeys, total }) => {
      setSelectedRequestKeys((prev) => {
        const next = new Set(prev)
        successKeys.forEach((key) => {
          next.delete(key)
        })
        return next
      })

      queryClient.invalidateQueries({ queryKey: ["shift-requests"] })
      queryClient.invalidateQueries({ queryKey: ["ward-leave-requests"] })

      const actionText = action === "Approved" ? "approved" : "denied"
      if (failed > 0) {
        showErrorToast(
          `${total - failed} request${total - failed === 1 ? "" : "s"} ${actionText}; ${failed} failed.`,
        )
      } else {
        showSuccessToast(
          `${total} request${total === 1 ? "" : "s"} ${actionText}.`,
        )
      }
    },
    onError: (error: unknown) => {
      const detail = (error as { body?: { detail?: string } })?.body?.detail
      showErrorToast(detail || "Failed to update selected requests")
    },
  })

  const handleBulkApprove = () => {
    if (selectedCount === 0) return
    bulkReviewMutation.mutate({ action: "Approved" })
  }

  const handleBulkDeny = () => {
    if (selectedCount === 0) return
    bulkReviewMutation.mutate({
      action: "Rejected",
      reason: bulkDenyReason,
    })
    setIsDenyDialogOpen(false)
    setBulkDenyReason("")
  }

  useEffect(() => {
    void wardId
    setSelectedRequestKeys(new Set())
  }, [wardId])

  useEffect(() => {
    const eligibleKeys = new Set(
      filteredRequests.filter(isRequestEligible).map(requestKey),
    )
    setSelectedRequestKeys((prev) => {
      const next = new Set([...prev].filter((key) => eligibleKeys.has(key)))
      return next.size === prev.size ? prev : next
    })
  }, [filteredRequests, isRequestEligible])

  const handleOpenModal = (request: UnifiedRequest) => {
    if (request.type === "ShiftRequest") {
      setSelectedShiftRequest(request)
    } else {
      setSelectedLeaveRequest(request)
    }
  }

  const competingLeaveRequests = useMemo(() => {
    if (!selectedLeaveRequest || !wardId) return []
    const selectedStart = selectedLeaveRequest.rawStartDate
    const selectedEnd =
      selectedLeaveRequest.rawEndDate ?? selectedLeaveRequest.rawStartDate
    if (!selectedStart || !selectedEnd) return []

    const toDate = (value: string) => new Date(value)
    const selStart = toDate(selectedStart)
    const selEnd = toDate(selectedEnd)

    return leaveRequests
      .filter((lr) => {
        const lrStart = toDate(lr.startdate)
        const lrEnd = toDate(lr.enddate)
        return lrStart <= selEnd && lrEnd >= selStart
      })
      .map((lr) => ({
        requestId: lr.leaveid,
        nurseName: nurseMap.get(lr.nurseid) ?? "",
        leaveType: lr.leavetype,
        startDate: lr.startdate,
        endDate: lr.enddate,
        status: lr.status as RequestStatus,
      }))
  }, [leaveRequests, nurseMap, selectedLeaveRequest, wardId])

  const isLoading = shiftLoading || leaveLoading

  return (
    <VStack align="stretch" gap={4} w="full" maxW="1200px" mx="auto">
      {/* Title */}
      <Text
        color="primary"
        fontWeight="semibold"
        fontSize="lg"
        textAlign="center"
      >
        Leave and Shift Request Overview
      </Text>

      {/* Tabs */}
      <Flex
        w="full"
        align="center"
        justify="space-between"
        gap={4}
        wrap={{ base: "wrap", md: "nowrap" }}
      >
        <Box
          minW={{ base: "0", md: "160px" }}
          flex={{ base: "1 1 auto", md: "0 0 160px" }}
        />
        <HStack
          gap={0}
          rounded="full"
          borderWidth="1px"
          borderColor="border"
          overflow="hidden"
          justify="center"
          flexShrink={0}
        >
          {TABS.map((tab, idx) => {
            const isFirst = idx === 0
            const isLast = idx === TABS.length - 1
            const isActive = activeTab === tab.id
            return (
              <Button
                key={tab.id}
                size="sm"
                variant={isActive ? "solid" : "ghost"}
                bg={isActive ? "#4B8798" : "transparent"}
                color={isActive ? "white" : "#4A4A4A"}
                _hover={isActive ? { bg: "#3d6f7e" } : { bg: "#DDE8EA" }}
                onClick={() => handleTabChange(tab.id)}
                roundedLeft={isFirst ? "full" : "none"}
                roundedRight={isLast ? "full" : "none"}
                px={4}
                fontWeight="medium"
                fontSize="sm"
                h="9"
                borderRightWidth={isLast ? "0" : "1px"}
                borderColor="border"
              >
                {tab.label}
              </Button>
            )
          })}
        </HStack>
        <Box
          minW={{ base: "100%", md: "160px" }}
          display="flex"
          justifyContent={{ base: "center", md: "flex-end" }}
          flex={{ base: "1 1 100%", md: "0 0 160px" }}
        >
          {wardSelector ?? <Box />}
        </Box>
      </Flex>

      {selectedCount > 0 && (
        <Flex
          w="full"
          align="center"
          justify="space-between"
          gap={3}
          wrap={{ base: "wrap", md: "nowrap" }}
          bg="#F0F7F9"
          borderWidth="1px"
          borderColor="#B7D4DC"
          rounded="md"
          px={4}
          py={3}
        >
          <Text fontSize="sm" color="#4A4A4A" fontWeight="medium">
            {selectedCount} selected
          </Text>
          <HStack
            gap={2}
            wrap="wrap"
            justify={{ base: "flex-start", md: "end" }}
          >
            <Button
              size="xs"
              bg="#4B8798"
              color="white"
              _hover={{ bg: "#3d6f7e" }}
              disabled={bulkReviewMutation.isPending}
              loading={
                bulkReviewMutation.isPending &&
                bulkReviewMutation.variables?.action === "Approved"
              }
              onClick={handleBulkApprove}
              fontWeight="medium"
            >
              Approve selected
            </Button>
            <Button
              size="xs"
              variant="outline"
              colorPalette="red"
              disabled={bulkReviewMutation.isPending}
              onClick={() => setIsDenyDialogOpen(true)}
              fontWeight="medium"
            >
              Deny selected
            </Button>
            <Button
              size="xs"
              variant="ghost"
              color="#4A4A4A"
              disabled={bulkReviewMutation.isPending}
              onClick={clearSelection}
              fontWeight="medium"
            >
              Clear selection
            </Button>
          </HStack>
        </Flex>
      )}

      {/* Table */}
      {isLoading ? (
        <Flex justify="center" py={10}>
          <Spinner color="#4B8798" />
        </Flex>
      ) : (
        <Box overflowX="auto" w="full">
          <Table.Root size="sm" w="full">
            <Table.Header>
              <Table.Row bg="gray.50">
                <Table.ColumnHeader py={3} px={4} w="44px">
                  <Checkbox
                    aria-label="Select visible requests"
                    checked={headerSelectionState}
                    disabled={visibleEligibleRequests.length === 0}
                    onCheckedChange={toggleVisibleSelection}
                    css={{
                      "&[data-state=checked] [data-part=control], &[data-state=indeterminate] [data-part=control]":
                        {
                          backgroundColor: "rgb(75, 135, 152)",
                          borderColor: "rgb(75, 135, 152)",
                        },
                    }}
                  />
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  fontSize="xs"
                  color="gray.500"
                  fontWeight="semibold"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  py={3}
                  px={4}
                >
                  Type
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  fontSize="xs"
                  color="gray.500"
                  fontWeight="semibold"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  py={3}
                  px={4}
                >
                  Ward Staff
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  fontSize="xs"
                  color="gray.500"
                  fontWeight="semibold"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  py={3}
                  px={4}
                >
                  Request Type
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  fontSize="xs"
                  color="gray.500"
                  fontWeight="semibold"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  py={3}
                  px={4}
                >
                  Requested Dates
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  fontSize="xs"
                  color="gray.500"
                  fontWeight="semibold"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  py={3}
                  px={4}
                  textAlign="center"
                >
                  Status
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  fontSize="xs"
                  color="gray.500"
                  fontWeight="semibold"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  py={3}
                  px={4}
                  cursor="pointer"
                  userSelect="none"
                  onClick={handleSortToggle}
                  _hover={{ color: "#4B8798" }}
                  whiteSpace="nowrap"
                >
                  Application Date
                  <SortIcon direction={sortDir} />
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  fontSize="xs"
                  color="gray.500"
                  fontWeight="semibold"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  py={3}
                  px={4}
                >
                  Comments
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  fontSize="xs"
                  color="gray.500"
                  fontWeight="semibold"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  py={3}
                  px={4}
                >
                  Edit
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>

            <Table.Body>
              {currentPageData.length === 0 ? (
                <Table.Row>
                  <Table.Cell
                    colSpan={9}
                    textAlign="center"
                    py={10}
                    color="gray.400"
                  >
                    No requests found.
                  </Table.Cell>
                </Table.Row>
              ) : (
                currentPageData.map((req) => {
                  const eligible = isRequestEligible(req)
                  const key = requestKey(req)
                  return (
                    <Table.Row
                      key={key}
                      bg={req.type === "ShiftRequest" ? "#f0f7f9" : "white"}
                      _hover={{ bg: "#e4f2f5" }}
                      opacity={eligible ? 1 : 0.7}
                      transition="background 0.1s"
                    >
                      <Table.Cell py={2} px={4}>
                        <Checkbox
                          aria-label={`Select ${req.type === "ShiftRequest" ? "shift" : "leave"} request`}
                          checked={selectedRequestKeys.has(key)}
                          disabled={!eligible || bulkReviewMutation.isPending}
                          onCheckedChange={() => toggleRequestSelection(req)}
                          css={{
                            "&[data-state=checked] [data-part=control]": {
                              backgroundColor: "rgb(75, 135, 152)",
                              borderColor: "rgb(75, 135, 152)",
                            },
                          }}
                        />
                      </Table.Cell>

                      {/* Type */}
                      <Table.Cell py={2} px={4}>
                        <TypeCell type={req.type} />
                      </Table.Cell>

                      {/* Ward Staff */}
                      <Table.Cell py={2} px={4}>
                        <Text fontSize="sm" color="#4A4A4A" whiteSpace="nowrap">
                          {req.nurseName ?? "–"}
                        </Text>
                      </Table.Cell>

                      {/* Request Type badge */}
                      <Table.Cell py={2} px={4}>
                        <Flex justify="flex-start">
                          <RequestTypeBadge
                            name={req.requestTypeName}
                            shiftCode={req.shiftCode}
                          />
                        </Flex>
                      </Table.Cell>

                      {/* Requested Dates */}
                      <Table.Cell py={2} px={4}>
                        <Text fontSize="sm" color="#4A4A4A" whiteSpace="nowrap">
                          {req.requestedDates}
                        </Text>
                      </Table.Cell>

                      {/* Status */}
                      <Table.Cell py={2} px={4} textAlign="center">
                        <StatusCell status={req.status} />
                      </Table.Cell>

                      {/* Application Date */}
                      <Table.Cell py={2} px={4}>
                        <Text fontSize="sm" color="#4A4A4A" whiteSpace="nowrap">
                          {req.applicationDate}
                        </Text>
                      </Table.Cell>

                      {/* Comments */}
                      <Table.Cell py={2} px={4} maxW="160px">
                        {(() => {
                          const displayComment = req.comments ?? null
                          return displayComment ? (
                            <Text
                              fontSize="sm"
                              color="#4A4A4A"
                              cursor="pointer"
                              whiteSpace={
                                expandedComments.has(req.id)
                                  ? "normal"
                                  : "nowrap"
                              }
                              overflow={
                                expandedComments.has(req.id)
                                  ? "visible"
                                  : "hidden"
                              }
                              textOverflow={
                                expandedComments.has(req.id)
                                  ? "clip"
                                  : "ellipsis"
                              }
                              onClick={() => toggleComment(req.id)}
                              title={
                                expandedComments.has(req.id)
                                  ? "Click to collapse"
                                  : "Click to expand"
                              }
                              _hover={{ color: "#4B8798" }}
                            >
                              {expandedComments.has(req.id)
                                ? displayComment
                                : displayComment.length > 10
                                  ? `${displayComment.slice(0, 10)}...`
                                  : displayComment}
                            </Text>
                          ) : (
                            <Text fontSize="sm" color="gray.300">
                              –
                            </Text>
                          )
                        })()}
                      </Table.Cell>

                      {/* Action */}
                      <Table.Cell py={2} px={4}>
                        {req.status === "Pending" ? (
                          <Button
                            size="xs"
                            variant="outline"
                            borderColor="#4B8798"
                            color="#4B8798"
                            _hover={{ bg: "#DDE8EA" }}
                            onClick={() => handleOpenModal(req)}
                            fontWeight="medium"
                          >
                            Approve
                          </Button>
                        ) : (
                          <Button
                            size="xs"
                            variant="outline"
                            borderColor="gray.300"
                            color="#4A4A4A"
                            _hover={{ bg: "gray.50" }}
                            onClick={() => handleOpenModal(req)}
                            fontWeight="medium"
                          >
                            Edit
                          </Button>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  )
                })
              )}
            </Table.Body>
          </Table.Root>
        </Box>
      )}

      {/* Pagination */}
      {!isLoading && sortedRequests.length > 0 && (
        <Flex justify="flex-end" pt={2}>
          <HStack gap={1}>
            <Button
              size="xs"
              variant="outline"
              borderColor="gray.300"
              color="#4A4A4A"
              _hover={{ bg: "gray.50" }}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              fontWeight="medium"
            >
              Back
            </Button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map(
              (pageNum) => (
                <Button
                  key={pageNum}
                  size="xs"
                  variant={page === pageNum ? "solid" : "outline"}
                  bg={page === pageNum ? "#4B8798" : "transparent"}
                  color={page === pageNum ? "white" : "#4A4A4A"}
                  borderColor={page === pageNum ? "#4B8798" : "gray.300"}
                  _hover={
                    page === pageNum ? { bg: "#3d6f7e" } : { bg: "gray.50" }
                  }
                  onClick={() => setPage(pageNum)}
                  minW="7"
                  fontWeight="medium"
                >
                  {pageNum}
                </Button>
              ),
            )}

            <Button
              size="xs"
              variant="outline"
              borderColor="gray.300"
              color="#4A4A4A"
              _hover={{ bg: "gray.50" }}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              fontWeight="medium"
            >
              Next
            </Button>
          </HStack>
        </Flex>
      )}

      <Dialog.Root
        placement="center"
        motionPreset="slide-in-bottom"
        lazyMount
        unmountOnExit
        open={isDenyDialogOpen}
        onOpenChange={(e) => !e.open && setIsDenyDialogOpen(false)}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content tabIndex={-1} maxW="480px">
              <Dialog.Header>
                <Dialog.Title color="primary" fontWeight="bold">
                  Deny selected requests
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <VStack align="stretch" gap={3}>
                  <Text fontSize="sm" color="#4A4A4A">
                    Deny {selectedCount} selected request
                    {selectedCount === 1 ? "" : "s"}? You can add an optional
                    reason for shift requests.
                  </Text>
                  <Textarea
                    value={bulkDenyReason}
                    onChange={(e) => setBulkDenyReason(e.target.value)}
                    placeholder="Optional rejection reason"
                    size="sm"
                    borderRadius="md"
                    borderColor="gray.200"
                    resize="none"
                    rows={3}
                    fontSize="sm"
                  />
                </VStack>
              </Dialog.Body>
              <Dialog.Footer>
                <HStack gap={2}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDenyDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    colorPalette="red"
                    size="sm"
                    onClick={handleBulkDeny}
                    loading={
                      bulkReviewMutation.isPending &&
                      bulkReviewMutation.variables?.action === "Rejected"
                    }
                    disabled={selectedCount === 0}
                  >
                    Deny selected
                  </Button>
                </HStack>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      {/* Shift review dialog */}
      {selectedShiftRequest && (
        <ReviewShiftRequest
          isOpen={!!selectedShiftRequest}
          onClose={() => setSelectedShiftRequest(null)}
          requestId={selectedShiftRequest.id}
          nurseName={selectedShiftRequest.nurseName ?? null}
          shiftCode={
            selectedShiftRequest.shiftCode ??
            selectedShiftRequest.requestTypeName
          }
          date={
            selectedShiftRequest.rawPreferredDate ??
            selectedShiftRequest.requestedDates
          }
          status={selectedShiftRequest.status}
          comment={selectedShiftRequest.comments}
          wardId={wardId}
        />
      )}

      {/* Leave review dialog */}
      {selectedLeaveRequest && (
        <NMReviewLeaveRequest
          isOpen={!!selectedLeaveRequest}
          onClose={() => setSelectedLeaveRequest(null)}
          requestId={selectedLeaveRequest.id}
          nurseName={selectedLeaveRequest.nurseName ?? ""}
          leaveType={selectedLeaveRequest.requestTypeName}
          startDate={
            selectedLeaveRequest.rawStartDate ??
            selectedLeaveRequest.requestedDates
          }
          endDate={
            selectedLeaveRequest.rawEndDate ??
            selectedLeaveRequest.rawStartDate ??
            selectedLeaveRequest.requestedDates
          }
          currentStatus={selectedLeaveRequest.status}
          requests={competingLeaveRequests}
        />
      )}
    </VStack>
  )
}
