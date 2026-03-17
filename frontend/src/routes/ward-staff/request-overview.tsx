import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Spinner,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import { EditShiftRequest } from "@/components/WardStaff/Requests/ShiftRequests/EditShiftRequest";
import { EditLeaveRequest } from "@/components/WardStaff/Requests/LeaveRequests/EditLeaveRequest";
import {
  LeaveRequestsService,
  ShiftRequestsService,
  type LeaveRequestPublic,
} from "@/client";
import type { ShiftRequestPublic } from "@/client/types.gen";
import useAuth from "@/hooks/useAuth";

export const Route = createFileRoute("/ward-staff/request-overview")({
  component: WardStaffRequestOverviewPage,
});

type TabFilter = "all" | "shift" | "leave";
type SortDirection = "asc" | "desc";
type RequestStatus = "Pending" | "Approved" | "Rejected" | string;

type ShiftOverviewRow = {
  id: number;
  type: "ShiftRequest";
  requestTypeCode: string;
  requestTypeName: string;
  requestedDates: string;
  applicationDate: string;
  rawDate: string;
  status: RequestStatus;
};

type LeaveOverviewRow = {
  id: number;
  type: "LeaveRequest";
  requestTypeCode: string;
  requestTypeName: string;
  requestedDates: string;
  applicationDate: string;
  rawDate: string;
  status: RequestStatus;
};

type OverviewRow = ShiftOverviewRow | LeaveOverviewRow;

type LeaveEditRequest = {
  requestId: number;
  nurseName: string;
  initialLeaveType: string;
  startDate: string;
  endDate: string;
};

const TABS: { id: TabFilter; label: string }[] = [
  { id: "all", label: "All Types" },
  { id: "shift", label: "Shift Requests" },
  { id: "leave", label: "Leave Requests" },
];

const PAGE_SIZE = 30;

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  return `${date.getDate()}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function formatDateRange(startDate: string, endDate: string) {
  const formattedStart = formatDate(startDate);
  const formattedEnd = formatDate(endDate);
  return startDate === endDate
    ? formattedStart
    : `${formattedStart} – ${formattedEnd}`;
}

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
        >
          Pending
        </Badge>
      </Flex>
    );
  }

  if (status === "Approved") {
    return (
      <Flex justify="center">
        <Badge
          bg="#DCFCE7"
          color="#15803D"
          fontWeight="medium"
          fontSize="xs"
          px={3}
          py={0.5}
          rounded="full"
          textTransform="none"
        >
          Approved
        </Badge>
      </Flex>
    );
  }

  if (status === "Rejected") {
    return (
      <Flex justify="center">
        <Badge
          bg="#FEE2E2"
          color="#DC2626"
          fontWeight="medium"
          fontSize="xs"
          px={3}
          py={0.5}
          rounded="full"
          textTransform="none"
        >
          Rejected
        </Badge>
      </Flex>
    );
  }

  return (
    <Text fontSize="xs" color="gray.400">
      {status}
    </Text>
  );
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (direction === "asc") {
    return <ChevronUp className="ml-0.5 inline h-3.5 w-3.5" />;
  }
  if (direction === "desc") {
    return <ChevronDown className="ml-0.5 inline h-3.5 w-3.5" />;
  }
  return <ChevronsUpDown className="ml-0.5 inline h-3.5 w-3.5 opacity-40" />;
}

function WardStaffRequestOverviewPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [selectedShiftRequest, setSelectedShiftRequest] =
    useState<ShiftOverviewRow | null>(null);
  const [selectedLeaveRequest, setSelectedLeaveRequest] =
    useState<LeaveEditRequest | null>(null);

  const { data: shiftRequests = [], isLoading: isShiftLoading } = useQuery<
    ShiftRequestPublic[]
  >({
    queryKey: ["shift-requests", "user"],
    queryFn: () => ShiftRequestsService.getUserShiftRequests(),
    staleTime: 0,
  });

  const { data: leaveRequests = [], isLoading: isLeaveLoading } = useQuery<
    LeaveRequestPublic[]
  >({
    queryKey: ["my-leave-requests"],
    queryFn: () => LeaveRequestsService.getMyLeaveRequests(),
    staleTime: 0,
  });

  const { data: shiftCodes = [] } = useQuery({
    queryKey: ["shift-codes", "all"],
    queryFn: () => ShiftRequestsService.getAllShiftCodes(),
    staleTime: 5 * 60_000,
  });

  const { data: leaveCodes = [] } = useQuery({
    queryKey: ["leave-codes"],
    queryFn: () => LeaveRequestsService.getLeaveCodes(),
    staleTime: 5 * 60_000,
  });

  const shiftCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    shiftCodes.forEach((shiftCode) => {
      map.set(shiftCode.shiftcode, shiftCode.description);
    });
    return map;
  }, [shiftCodes]);

  const leaveCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    leaveCodes.forEach((leaveCode) => {
      map.set(leaveCode.shiftcode, leaveCode.description);
    });
    return map;
  }, [leaveCodes]);

  const allRequests = useMemo<OverviewRow[]>(() => {
    const shiftRows: ShiftOverviewRow[] = shiftRequests.map((request) => ({
      id: request.requestid,
      type: "ShiftRequest",
      requestTypeCode: request.preferredshifttype,
      requestTypeName:
        shiftCodeMap.get(request.preferredshifttype) ??
        request.preferredshifttype,
      requestedDates: formatDate(request.preferreddate),
      applicationDate: formatDate(request.preferreddate),
      rawDate: request.preferreddate,
      status: request.status,
    }));

    const leaveRows: LeaveOverviewRow[] = leaveRequests.map((request) => ({
      id: request.leaveid,
      type: "LeaveRequest",
      requestTypeCode: request.leavetype,
      requestTypeName: leaveCodeMap.get(request.leavetype) ?? request.leavetype,
      requestedDates: formatDateRange(request.startdate, request.enddate),
      applicationDate: formatDate(request.requestedat),
      rawDate: request.requestedat,
      status: request.status,
    }));

    return [...shiftRows, ...leaveRows];
  }, [leaveCodeMap, leaveRequests, shiftCodeMap, shiftRequests]);

  const filteredRequests = useMemo(() => {
    if (activeTab === "shift") {
      return allRequests.filter((request) => request.type === "ShiftRequest");
    }
    if (activeTab === "leave") {
      return allRequests.filter((request) => request.type === "LeaveRequest");
    }
    return allRequests;
  }, [activeTab, allRequests]);

  const sortedRequests = useMemo(() => {
    const pendingRank = (status: RequestStatus) => (status === "Pending" ? 0 : 1);

    return [...filteredRequests].sort((left, right) => {
      const statusDiff = pendingRank(left.status) - pendingRank(right.status);
      if (statusDiff !== 0) return statusDiff;

      const timeDiff =
        new Date(left.rawDate).getTime() - new Date(right.rawDate).getTime();
      return sortDir === "asc" ? timeDiff : -timeDiff;
    });
  }, [filteredRequests, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRequests.length / PAGE_SIZE));
  const currentPageData = sortedRequests.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const leaveRequestMap = useMemo(() => {
    const map = new Map<number, LeaveRequestPublic>();
    leaveRequests.forEach((request) => map.set(request.leaveid, request));
    return map;
  }, [leaveRequests]);

  const handleTabChange = (tab: TabFilter) => {
    setActiveTab(tab);
    setPage(1);
  };

  const handleSortToggle = () => {
    setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    setPage(1);
  };

  const handleOpenEdit = (request: OverviewRow) => {
    if (request.type === "ShiftRequest") {
      setSelectedShiftRequest(request);
      return;
    }

    const leaveRequest = leaveRequestMap.get(request.id);
    if (!leaveRequest) return;

    setSelectedLeaveRequest({
      requestId: leaveRequest.leaveid,
      nurseName: user?.name || user?.email || "Ward Staff",
      initialLeaveType: leaveRequest.leavetype,
      startDate: leaveRequest.startdate,
      endDate: leaveRequest.enddate,
    });
  };

  const isLoading = isShiftLoading || isLeaveLoading;

  return (
    <Flex
      minH="100vh"
      w="100vw"
      height="100%"
      direction={{ base: "column" }}
      bgColor="background2"
      p={5}
    >
      <VStack
        gap={4}
        justifyItems="center"
        w="full"
        height="100%"
        bgColor="white"
        rounded="lg"
        p={7}
        textAlign="center"
      >
        <Text color="primary" fontWeight="semibold" fontSize="lg">
          Leave and Shift Request Overview
        </Text>

        <Flex
          w="full"
          align="center"
          justify="center"
          gap={4}
          wrap={{ base: "wrap", md: "nowrap" }}
        >
          <HStack
            gap={0}
            rounded="full"
            borderWidth="1px"
            borderColor="border"
            overflow="hidden"
            justify="center"
            flexShrink={0}
          >
            {TABS.map((tab, index) => {
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
                  roundedLeft={index === 0 ? "full" : "none"}
                  roundedRight={index === TABS.length - 1 ? "full" : "none"}
                  px={4}
                  fontWeight="medium"
                  fontSize="sm"
                  h="9"
                  borderRightWidth={index === TABS.length - 1 ? "0" : "1px"}
                  borderColor="border"
                >
                  {tab.label}
                </Button>
              );
            })}
          </HStack>
        </Flex>

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
                    Edit
                  </Table.ColumnHeader>
                </Table.Row>
              </Table.Header>

              <Table.Body>
                {currentPageData.length === 0 ? (
                  <Table.Row>
                    <Table.Cell
                      colSpan={6}
                      textAlign="center"
                      py={10}
                      color="gray.400"
                    >
                      No requests found.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  currentPageData.map((request) => (
                    <Table.Row
                      key={`${request.type}-${request.id}`}
                      bg={request.type === "ShiftRequest" ? "#f0f7f9" : "white"}
                      _hover={{ bg: "#e4f2f5" }}
                      transition="background 0.1s"
                    >
                      <Table.Cell py={2} px={4}>
                        <Text
                          fontSize="sm"
                          color="#4B8798"
                          fontWeight="medium"
                          whiteSpace="nowrap"
                        >
                          {request.type === "ShiftRequest"
                            ? "Shift Request"
                            : "Leave Request"}
                        </Text>
                      </Table.Cell>

                      <Table.Cell py={2} px={4}>
                        <HStack gap={2} align="center">
                          <Badge
                            bg={request.type === "ShiftRequest" ? "#4B8798" : "#94A3B8"}
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
                            {request.requestTypeCode}
                          </Badge>
                          <Text fontSize="sm" color="#4A4A4A" whiteSpace="nowrap">
                            {request.requestTypeName}
                          </Text>
                        </HStack>
                      </Table.Cell>

                      <Table.Cell py={2} px={4}>
                        <Text fontSize="sm" color="#4A4A4A" whiteSpace="nowrap">
                          {request.requestedDates}
                        </Text>
                      </Table.Cell>

                      <Table.Cell py={2} px={4} textAlign="center">
                        <StatusCell status={request.status} />
                      </Table.Cell>

                      <Table.Cell py={2} px={4}>
                        <Text fontSize="sm" color="#4A4A4A" whiteSpace="nowrap">
                          {request.applicationDate}
                        </Text>
                      </Table.Cell>

                      <Table.Cell py={2} px={4}>
                        <Button
                          size="xs"
                          variant="outline"
                          borderColor="gray.300"
                          color="#4A4A4A"
                          _hover={{ bg: "gray.50" }}
                          onClick={() => handleOpenEdit(request)}
                          fontWeight="medium"
                        >
                          Edit
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>
        )}

        {!isLoading && sortedRequests.length > 0 && (
          <Flex justify="flex-end" pt={2} w="full">
            <HStack gap={1}>
              <Button
                size="xs"
                variant="outline"
                borderColor="gray.300"
                color="#4A4A4A"
                _hover={{ bg: "gray.50" }}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                fontWeight="medium"
              >
                Back
              </Button>

              {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                (pageNumber) => (
                  <Button
                    key={pageNumber}
                    size="xs"
                    variant={page === pageNumber ? "solid" : "outline"}
                    bg={page === pageNumber ? "#4B8798" : "transparent"}
                    color={page === pageNumber ? "white" : "#4A4A4A"}
                    borderColor={page === pageNumber ? "#4B8798" : "gray.300"}
                    _hover={
                      page === pageNumber ? { bg: "#3d6f7e" } : { bg: "gray.50" }
                    }
                    onClick={() => setPage(pageNumber)}
                    minW="7"
                    fontWeight="medium"
                  >
                    {pageNumber}
                  </Button>
                ),
              )}

              <Button
                size="xs"
                variant="outline"
                borderColor="gray.300"
                color="#4A4A4A"
                _hover={{ bg: "gray.50" }}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={page === totalPages}
                fontWeight="medium"
              >
                Next
              </Button>
            </HStack>
          </Flex>
        )}
      </VStack>

      {selectedShiftRequest && (
        <EditShiftRequest
          isOpen={!!selectedShiftRequest}
          onClose={() => setSelectedShiftRequest(null)}
          requestId={selectedShiftRequest.id}
          initialShiftType={selectedShiftRequest.requestTypeCode}
          initialDate={selectedShiftRequest.rawDate}
          wardId={user?.wardid}
        />
      )}

      {selectedLeaveRequest && (
        <EditLeaveRequest
          isOpen={!!selectedLeaveRequest}
          onClose={() => setSelectedLeaveRequest(null)}
          requests={[selectedLeaveRequest]}
          selectedRequestId={selectedLeaveRequest.requestId}
        />
      )}
    </Flex>
  );
}

export default WardStaffRequestOverviewPage;
