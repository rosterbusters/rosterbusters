import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ShiftRequestsService } from "@/client";

export interface ApplicationLockStatus {
  isLocked: boolean;
  nextWindowStart: string | undefined;
  nextWindowEnd: string | undefined;
  isLoading: boolean;
}

function formatWindowDate(dateStr: string): string {
  return format(parseISO(dateStr), "d MMM");
}

export function useApplicationLockStatus(): ApplicationLockStatus {
  const { data: fetchedPeriods, isLoading } = useQuery({
    queryKey: ["roster-periods"],
    queryFn: () => ShiftRequestsService.getRosterPeriods(),
    staleTime: 5 * 60 * 1000,
  });

  const periods = fetchedPeriods ?? [];

  return useMemo(() => {
    if (isLoading) {
      return {
        isLocked: false,
        nextWindowStart: undefined,
        nextWindowEnd: undefined,
        isLoading: true,
      };
    }

    const today = new Date().toISOString().slice(0, 10);

    const activePeriod =
      periods.find(
        (p) =>
          p.status === "RequestOpen" &&
          p.startdate <= today &&
          p.enddate >= today,
      ) ?? periods.find((p) => p.status === "RequestOpen");

    const isLocked = !activePeriod;

    const nextPeriod = periods
      .filter((p) => p.requestopendate && p.requestopendate > today)
      .sort((a, b) => a.requestopendate!.localeCompare(b.requestopendate!))[0];

    const nextWindowStart = nextPeriod?.requestopendate
      ? formatWindowDate(nextPeriod.requestopendate)
      : undefined;
    const nextWindowEnd = nextPeriod?.requestclosedate
      ? formatWindowDate(nextPeriod.requestclosedate)
      : undefined;

    return { isLocked, nextWindowStart, nextWindowEnd, isLoading: false };
  }, [periods, isLoading]);
}
