import type { RosterPeriodPublic } from "@/client";

export function getTodayIsoDate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;
}

export function getActiveRequestPeriod(
  periods: RosterPeriodPublic[] | undefined,
): RosterPeriodPublic | undefined {
  if (!periods?.length) {
    return undefined;
  }

  const today = getTodayIsoDate();
  const sorted = [...periods].sort((a, b) => a.startdate.localeCompare(b.startdate));

  return (
    sorted.find(
      (period) =>
        !!period.requestopendate &&
        !!period.requestclosedate &&
        period.requestopendate <= today &&
        period.requestclosedate >= today,
    ) ??
    sorted.find((period) => period.status === "RequestOpen") ??
    sorted.find((period) => period.startdate > today) ??
    sorted.find((period) => period.startdate <= today && period.enddate >= today) ??
    sorted[0]
  );
}

export function getActiveShiftRequestPeriod(
  periods: RosterPeriodPublic[] | undefined,
): RosterPeriodPublic | undefined {
  return getActiveRequestPeriod(periods);
}
