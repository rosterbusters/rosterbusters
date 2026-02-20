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

  const activePeriod = useMemo(
    () => periods?.find((p) => p.status === "RequestOpen"),
    [periods],
  );

  const { data: userRequests } = useQuery({
    queryKey: ["shift-requests", "user"],
    queryFn: () => ShiftRequestsService.getUserShiftRequests(),
  });

  const count = activePeriod && userRequests
    ? userRequests.filter((r) => r.periodid === activePeriod.periodid).length
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
