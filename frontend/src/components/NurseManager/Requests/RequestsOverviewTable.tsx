import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Button,
  Flex,
  HStack,
  Table,
  Text,
  Badge,
  VStack,
  Spinner,
} from "@chakra-ui/react";
import { Check, X, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { ShiftRequestsService } from "@/client";
import { type UnifiedRequest, type RequestStatus } from "./RequestReviewModal";
import { ReviewShiftRequest } from "./ShiftRequests/ReviewShiftRequest";
import { ReviewLeaveRequest } from "./LeaveRequests/ReviewLeaveRequest";

// ─── Mock shift request data (used when no wardId / no API data) ─────────────
const MOCK_SHIFT_REQUESTS: UnifiedRequest[] = [
  {
    id: -101,
    type: "ShiftRequest",
    requestTypeName: "Night Shift",
    requestedDates: "31/10/2025",
    status: "Pending",
    applicationDate: "1/09/2025",
    comments: null,
  },
  {
    id: -102,
    type: "ShiftRequest",
    requestTypeName: "Rest Day",
    requestedDates: "31/10/2025",
    status: "Approved",
    applicationDate: "1/09/2025",
    comments: null,
  },
  {
    id: -103,
    type: "ShiftRequest",
    requestTypeName: "Day Shift",
    requestedDates: "31/10/2025",
    status: "Rejected",
    applicationDate: "1/09/2025",
    comments: null,
  },
  {
    id: -104,
    type: "ShiftRequest",
    requestTypeName: "PM Shift",
    requestedDates: "31/10/2025",
    status: "Approved",
    applicationDate: "1/09/2025",
    comments: null,
  },
  {
    id: -105,
    type: "ShiftRequest",
    requestTypeName: "AM Shift",
    requestedDates: "31/10/2025",
    status: "Approved",
    applicationDate: "1/09/2025",
    comments: null,
  },
];

// ─── Mock leave request data ──────────────────────────────────────────────────
const MOCK_LEAVE_REQUESTS: UnifiedRequest[] = [
  {
    id: -1,
    type: "LeaveRequest",
    requestTypeName: "Annual Leave",
    requestedDates: "1/10/2025 – 10/11/2025",
    status: "Approved",
    applicationDate: "1/09/2025",
    comments: "mom's birthday",
  },
  {
    id: -2,
    type: "LeaveRequest",
    requestTypeName: "Birthday Leave",
    requestedDates: "1/10/2025 – 10/11/2025",
    status: "Approved",
    applicationDate: "1/09/2025",
    comments: null,
  },
  {
    id: -3,
    type: "LeaveRequest",
    requestTypeName: "Annual Leave",
    requestedDates: "1/10/2025 – 10/11/2025",
    status: "Approved",
    applicationDate: "1/09/2025",
    comments: null,
  },
  {
    id: -4,
    type: "LeaveRequest",
    requestTypeName: "Annual Leave",
    requestedDates: "1/10/2025 – 10/11/2025",
    status: "Approved",
    applicationDate: "1/09/2025",
    comments: null,
  },
  {
    id: -5,
    type: "LeaveRequest",
    requestTypeName: "Annual Leave",
    requestedDates: "1/10/2025 – 10/11/2025",
    status: "Approved",
    applicationDate: "1/09/2025",
    comments: null,
  },
  {
    id: -6,
    type: "LeaveRequest",
    requestTypeName: "Annual Leave",
    requestedDates: "1/10/2025 – 10/11/2025",
    status: "Approved",
    applicationDate: "1/09/2025",
    comments: null,
  },
];

// ─── Tab definitions ──────────────────────────────────────────────────────────
type TabFilter = "all" | "shift" | "leave";

const TABS: { id: TabFilter; label: string }[] = [
  { id: "all", label: "All Types" },
  { id: "shift", label: "Shift Requests" },
  { id: "leave", label: "Leave Requests" },
];

const PAGE_SIZE = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return `${day}/${month < 10 ? "0" + month : month}/${year}`;
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
    );
  }
  if (status === "Approved") {
    return <Check className="h-4 w-4 text-green-500 mx-auto" />;
  }
  if (status === "Rejected") {
    return <X className="h-4 w-4 text-red-500 mx-auto" />;
  }
  return (
    <Text fontSize="xs" color="gray.400">
      {status}
    </Text>
  );
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
  );
}

// ─── Code → badge colour (mirrors SHIFT_COLOR_MAP in RosterTable/types) ──────
const ALL_BADGE_COLORS: Record<string, string> = {
  // Shift types
  D: "#0891b2",
  A: "#06b6d4",
  P: "#0e7490",
  N: "#164e63",
  "N-12": "#164e63",
  // Leave types
  AL: "#94a3b8",
  MC: "#fbbf24",
  URG: "#f87171",
  BCL: "#a78bfa",
  CCL: "#34d399",
  ML: "#f472b6",
  CL: "#60a5fa",
  EML: "#c084fc",
  DO: "#a3a3a3",
};

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
};

// ─── Request type badge ───────────────────────────────────────────────────────
function RequestTypeBadge({
  name,
  shiftCode,
}: {
  name: string;
  shiftCode?: string | null;
}) {
  const code = shiftCode ?? NAME_TO_CODE[name] ?? null;
  const color = code ? ALL_BADGE_COLORS[code] : null;

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
    );
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
  );
}

// ─── Sort icon ────────────────────────────────────────────────────────────────
function SortIcon({ direction }: { direction: "asc" | "desc" | null }) {
  if (direction === "asc")
    return <ChevronUp className="h-3.5 w-3.5 inline ml-0.5" />;
  if (direction === "desc")
    return <ChevronDown className="h-3.5 w-3.5 inline ml-0.5" />;
  return <ChevronsUpDown className="h-3.5 w-3.5 inline ml-0.5 opacity-40" />;
}

// ─── Main component ───────────────────────────────────────────────────────────
interface RequestsOverviewTableProps {
  wardId?: number | null;
}

export function RequestsOverviewTable({ wardId }: RequestsOverviewTableProps) {
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selectedShiftRequest, setSelectedShiftRequest] =
    useState<UnifiedRequest | null>(null);
  const [selectedLeaveRequest, setSelectedLeaveRequest] =
    useState<UnifiedRequest | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<number>>(
    new Set(),
  );

  const toggleComment = (id: number) =>
    setExpandedComments((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Local overrides for optimistic status updates
  const [statusOverrides, setStatusOverrides] = useState<
    Record<number, RequestStatus>
  >({});

  // Local overrides for comments written in the review modal
  const [commentOverrides, setCommentOverrides] = useState<
    Record<number, string>
  >({});

  // ── Fetch shift requests ──────────────────────────────────────────────────
  const { data: shiftRequests = [], isLoading: shiftLoading } = useQuery({
    queryKey: ["shift-requests", "ward", wardId],
    queryFn: () =>
      ShiftRequestsService.getShiftRequestsByWard({ wardId: wardId! }),
    enabled: !!wardId,
    staleTime: 30_000,
  });

  // ── Fetch shift codes for display names ──────────────────────────────────
  const { data: shiftCodes = [] } = useQuery({
    queryKey: ["shift-codes", "all"],
    queryFn: () => ShiftRequestsService.getAllShiftCodes(),
    staleTime: 5 * 60_000,
  });

  // ── Fetch ward nurses for nurse name display ──────────────────────────────
  const { data: wardNurses = [] } = useQuery({
    queryKey: ["ward-nurses", wardId],
    queryFn: () => ShiftRequestsService.getWardNurses({ wardId: wardId! }),
    enabled: !!wardId,
    staleTime: 5 * 60_000,
  });

  const shiftCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    shiftCodes.forEach((sc) => map.set(sc.shiftcode, sc.description));
    return map;
  }, [shiftCodes]);

  const nurseMap = useMemo(() => {
    const map = new Map<number, string>();
    wardNurses.forEach((n) => map.set(n.nurseid, n.name));
    return map;
  }, [wardNurses]);

  // ── Build unified list ────────────────────────────────────────────────────
  const allRequests: UnifiedRequest[] = useMemo(() => {
    // Use real API shift data when wardId is set, otherwise fall back to mock
    const fromShift: UnifiedRequest[] = wardId
      ? shiftRequests.map((sr) => ({
          id: sr.requestid,
          type: "ShiftRequest" as const,
          requestTypeName:
            shiftCodeMap.get(sr.preferredshifttype) || sr.preferredshifttype,
          shiftCode: sr.preferredshifttype,
          requestedDates: formatDate(sr.preferreddate),
          status: (statusOverrides[sr.requestid] ?? sr.status) as RequestStatus,
          applicationDate: formatDate(sr.preferreddate),
          comments: sr.reason,
          nurseName: nurseMap.get(sr.nurseid) ?? null,
        }))
      : MOCK_SHIFT_REQUESTS.map((sr) => ({
          ...sr,
          status: (statusOverrides[sr.id] ?? sr.status) as RequestStatus,
        }));

    const fromLeave: UnifiedRequest[] = MOCK_LEAVE_REQUESTS.map((lr) => ({
      ...lr,
      status: (statusOverrides[lr.id] ?? lr.status) as RequestStatus,
    }));

    return [...fromShift, ...fromLeave];
  }, [wardId, shiftRequests, shiftCodeMap, nurseMap, statusOverrides]);

  // ── Filter by tab ─────────────────────────────────────────────────────────
  const filteredRequests = useMemo(() => {
    if (activeTab === "shift")
      return allRequests.filter((r) => r.type === "ShiftRequest");
    if (activeTab === "leave")
      return allRequests.filter((r) => r.type === "LeaveRequest");
    return allRequests;
  }, [allRequests, activeTab]);

  // ── Sort by application date (Pending always first) ──────────────────────
  const sortedRequests = useMemo(() => {
    return [...filteredRequests].sort((a, b) => {
      // Pending items always float to the top
      const pendingFirst = (s: RequestStatus) => (s === "Pending" ? 0 : 1);
      const statusDiff = pendingFirst(a.status) - pendingFirst(b.status);
      if (statusDiff !== 0) return statusDiff;

      const parse = (d: string) => {
        // d may be "D/MM/YYYY" or "D/MM/YYYY – D/MM/YYYY"
        const first = d.split("–")[0].trim();
        const parts = first.split("/");
        if (parts.length === 3) {
          return new Date(
            parseInt(parts[2]),
            parseInt(parts[1]) - 1,
            parseInt(parts[0]),
          ).getTime();
        }
        return new Date(d).getTime();
      };
      const diff = parse(a.applicationDate) - parse(b.applicationDate);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [filteredRequests, sortDir]);

  // ── Paginate ──────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sortedRequests.length / PAGE_SIZE));
  const currentPageData = sortedRequests.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const handleTabChange = (tab: TabFilter) => {
    setActiveTab(tab);
    setPage(1);
  };

  const handleSortToggle = () => {
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    setPage(1);
  };

  const handleOpenModal = (request: UnifiedRequest) => {
    if (request.type === "ShiftRequest") {
      setSelectedShiftRequest(request);
    } else {
      setSelectedLeaveRequest(request);
    }
  };

  const handleAction = (
    requestId: number,
    action: "Approved" | "Rejected",
    comment: string,
  ) => {
    setStatusOverrides((prev) => ({ ...prev, [requestId]: action }));
    if (comment.trim()) {
      setCommentOverrides((prev) => ({ ...prev, [requestId]: comment.trim() }));
    }
  };

  const isLoading = shiftLoading;

  return (
    <VStack align="stretch" gap={4} w="full" maxW="1000px" mx="auto">
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
      <Flex justify="center">
        <HStack
          gap={0}
          rounded="full"
          borderWidth="1px"
          borderColor="border"
          overflow="hidden"
        >
          {TABS.map((tab, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === TABS.length - 1;
            const isActive = activeTab === tab.id;
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
            );
          })}
        </HStack>
      </Flex>

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
                    colSpan={7}
                    textAlign="center"
                    py={10}
                    color="gray.400"
                  >
                    No requests found.
                  </Table.Cell>
                </Table.Row>
              ) : (
                currentPageData.map((req) => (
                  <Table.Row
                    key={`${req.type}-${req.id}`}
                    bg={req.type === "ShiftRequest" ? "#f0f7f9" : "white"}
                    _hover={{ bg: "#e4f2f5" }}
                    transition="background 0.1s"
                  >
                    {/* Type */}
                    <Table.Cell py={2} px={4}>
                      <TypeCell type={req.type} />
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
                        const displayComment =
                          commentOverrides[req.id] ?? req.comments ?? null;
                        return displayComment ? (
                          <Text
                            fontSize="sm"
                            color="#4A4A4A"
                            cursor="pointer"
                            whiteSpace={
                              expandedComments.has(req.id) ? "normal" : "nowrap"
                            }
                            overflow={
                              expandedComments.has(req.id) ? "visible" : "hidden"
                            }
                            textOverflow={
                              expandedComments.has(req.id) ? "clip" : "ellipsis"
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
                                ? displayComment.slice(0, 10) + "..."
                                : displayComment}
                          </Text>
                        ) : (
                          <Text fontSize="sm" color="gray.300">
                            –
                          </Text>
                        );
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
                ))
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

      {/* Shift review dialog */}
      {selectedShiftRequest && (
        <ReviewShiftRequest
          isOpen={!!selectedShiftRequest}
          onClose={() => setSelectedShiftRequest(null)}
          requestId={selectedShiftRequest.id}
          nurseName={selectedShiftRequest.nurseName ?? null}
          shiftCode={selectedShiftRequest.shiftCode ?? selectedShiftRequest.requestTypeName}
          date={selectedShiftRequest.requestedDates}
          status={selectedShiftRequest.status}
          comment={selectedShiftRequest.comments}
          onAction={handleAction}
        />
      )}

      {/* Leave review dialog */}
      {selectedLeaveRequest && (
        <ReviewLeaveRequest
          isOpen={!!selectedLeaveRequest}
          onClose={() => setSelectedLeaveRequest(null)}
          requestId={selectedLeaveRequest.id}
          nurseName={selectedLeaveRequest.nurseName ?? null}
          leaveType={selectedLeaveRequest.requestTypeName}
          date={selectedLeaveRequest.requestedDates}
          status={selectedLeaveRequest.status}
          comment={selectedLeaveRequest.comments}
          onAction={handleAction}
        />
      )}
    </VStack>
  );
}
