import { Text, Badge, HStack } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { ShiftRequestsService } from "@/client";
import { useMemo } from "react";

const MAX_REQUESTS = 3;

export function AssignableStatus() {
  const { data: periods } = useQuery({
    queryKey: ["roster-periods"],
    queryFn: () => ShiftRequestsService.getRosterPeriods(),
  });

  const activePeriod = useMemo(() => {
    if (!periods) return undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (
      periods.find(
        (p) =>
          p.status === "RequestOpen" &&
          new Date(p.startdate) <= today &&
          new Date(p.enddate) >= today,
      ) ?? periods.find((p) => p.status === "RequestOpen")
    );
  }, [periods]);

  const { data: userRequests } = useQuery({
    queryKey: ["shift-requests", "user"],
    queryFn: () => ShiftRequestsService.getUserShiftRequests(),
    staleTime: 0,
  });

  const { data: workingCodes } = useQuery({
    queryKey: ["shift-codes", "working"],
    queryFn: () => ShiftRequestsService.getWorkingShiftCodes(),
  });

  const workingCodeSet = useMemo(
    () => new Set([...(workingCodes ?? []).map((c) => c.shiftcode), "DO", "RD"]),
    [workingCodes],
  );

  const count = activePeriod && userRequests
    ? userRequests.filter(
        (r) =>
          r.periodid === activePeriod.periodid &&
          workingCodeSet.has(r.preferredshifttype),
      ).length
    : 0;

  return (
    <>
      <HStack>
        <Text color="foreground" fontWeight="light">
          Assignable:
        </Text>
        <Badge variant="requests">Requests: {MAX_REQUESTS-count}/{MAX_REQUESTS}</Badge>
      </HStack>
    </>
  );
}
