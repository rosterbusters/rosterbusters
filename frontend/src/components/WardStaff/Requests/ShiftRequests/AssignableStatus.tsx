import { Text, Badge, HStack } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { ShiftRequestsService } from "@/client";
import { useMemo } from "react";
import { useRosterPeriodWindow } from "@/components/NurseManager/RosterTable/useRosterData";

const MAX_REQUESTS = 3;

export function AssignableStatus() {
  const { data: periods } = useQuery({
    queryKey: ["roster-periods"],
    queryFn: () => ShiftRequestsService.getRosterPeriods(),
  });

  const activePeriod = useMemo(() => {
    if (!periods) return undefined;
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    // TODO: Re-enable the RequestOpen-only gate after the request-window lock is restored.
    return (
      periods.find(
        (p) =>
          p.startdate <= todayStr &&
          p.enddate >= todayStr,
      ) ?? periods[0]
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
          r.periodid === activePeriod.periodId &&
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
