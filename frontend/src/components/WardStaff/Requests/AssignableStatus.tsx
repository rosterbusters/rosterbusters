import { Text, Badge, HStack } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { ShiftRequestsService } from "@/client";
import moment from "moment";

const MAX_REQUESTS = 3;

export function AssignableStatus() {
  const targetDate = moment().format("YYYY-MM-DD");

  const { data: rosterPeriod } = useQuery({
    queryKey: ["roster-period", targetDate],
    queryFn: () => ShiftRequestsService.getRosterPeriod({ targetDate }),
  });

  const { data: userRequests } = useQuery({
    queryKey: ["shift-requests", "user"],
    queryFn: () => ShiftRequestsService.getUserShiftRequests(),
  });

  const count = rosterPeriod && userRequests
    ? userRequests.filter((r) => r.periodid === rosterPeriod.periodid).length
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
