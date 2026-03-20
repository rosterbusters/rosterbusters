import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ShiftRequestsService } from "@/client";
import type { RosterPeriodPublic } from "@/client/types.gen";

// ─── Mock toggle ──────────────────────────────────────────────────────────────
// Set MOCK_LOCKED = true to simulate a locked planning period (no backend needed).
// Set MOCK_LOCKED = false to use real backend data.
const MOCK_LOCKED = false;

const MOCK_PERIODS: RosterPeriodPublic[] = [
  {
    periodid: 99,
    name: "Mock Closed Period",
    startdate: "2026-03-20",
    enddate: "2026-04-30",
    status: "RequestClosed",
    requestopendate: "2026-03-20",
    requestclosedate: "2026-04-30",
  },
  {
    periodid: 100,
    name: "Mock Next Period",
    startdate: "2026-05-12",
    enddate: "2026-05-22",
    status: "RequestOpen",
    requestopendate: "2026-05-12",
    requestclosedate: "2026-05-22",
  },
];
// ─────────────────────────────────────────────────────────────────────────────

export interface RosterPlanningLockStatus {
  isLocked: boolean;
  nextWindowStart: string | undefined;
  nextWindowEnd: string | undefined;
  isLoading: boolean;
}

function formatWindowDate(dateStr: string): string {
  return format(parseISO(dateStr), "d MMM");
}

export function useRosterPlanningLockStatus(): RosterPlanningLockStatus {
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

    // Locked when no RequestOpen period contains today
    const activePeriod =
      periods.find(
        (p) =>
          p.status === "RequestOpen" &&
          p.startdate <= today &&
          p.enddate >= today,
      ) ?? periods.find((p) => p.status === "RequestOpen" && p.startdate > today);

    const isLocked = !periods.find(
      (p) =>
        p.status === "RequestOpen" &&
        p.startdate <= today &&
        p.enddate >= today,
    );

    // Next planning period: next RequestOpen period with a future startdate
    const nextPeriod = periods
      .filter((p) => p.status === "RequestOpen" && p.startdate > today)
      .sort((a, b) => a.startdate.localeCompare(b.startdate))[0] ?? activePeriod;

    const nextWindowStart = nextPeriod?.startdate
      ? formatWindowDate(nextPeriod.startdate)
      : undefined;
    const nextWindowEnd = nextPeriod?.enddate
      ? formatWindowDate(nextPeriod.enddate)
      : undefined;

    return { isLocked, nextWindowStart, nextWindowEnd, isLoading: false };
  }, [periods, isLoading]);
}
