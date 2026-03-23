import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ShiftRequestsService } from "@/client";
import type { RosterPeriodPublic } from "@/client/types.gen";

// ─── Mock toggle ──────────────────────────────────────────────────────────────
// Set MOCK_LOCKED = true to simulate a locked period (no backend needed).
// Set MOCK_LOCKED = false to use real backend data.
const MOCK_LOCKED = true;

const MOCK_PERIODS: RosterPeriodPublic[] = [
  {
    periodid: 99,
    name: "Mock Closed Period",
    startdate: "2026-03-20",
    enddate: "2026-04-02",
    status: "RequestClosed",
    requestopendate: "2026-04-22",
    requestclosedate: "2026-04-28",
  },
];
// ─────────────────────────────────────────────────────────────────────────────

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
    enabled: !MOCK_LOCKED,
  });

  const periods = MOCK_LOCKED ? MOCK_PERIODS : (fetchedPeriods ?? []);

  return useMemo(() => {
    if (!MOCK_LOCKED && isLoading) {
      return { isLocked: false, nextWindowStart: undefined, nextWindowEnd: undefined, isLoading: true };
    }

    const today = new Date().toISOString().slice(0, 10);

    // Same logic as RequestCalendar: prefer today-containing open period, then any open period
    const activePeriod =
      periods.find(
        (p) =>
          p.status === "RequestOpen" &&
          p.startdate <= today &&
          p.enddate >= today,
      ) ?? periods.find((p) => p.status === "RequestOpen");

    const isLocked = !activePeriod;

    // Find the next period that has a future requestopendate
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
