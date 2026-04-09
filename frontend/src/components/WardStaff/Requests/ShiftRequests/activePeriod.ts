import type { RosterPeriodPublic } from "@/client";

function getTodayIsoDate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;
}

export function getActiveShiftRequestPeriod(
  periods: RosterPeriodPublic[] | undefined,
): RosterPeriodPublic | undefined {
  if (!periods?.length) {
    return undefined;
  }

  const today = getTodayIsoDate();

  // TODO: Re-enable the RequestOpen-only gate after the request-window lock is restored.
  // For now, use the period containing today and fall back to the first available period.
  // This MUST match the logic in NewShiftRequest so created requests appear in the correct period.
  return (
    periods.find((period) => period.startdate <= today && period.enddate >= today) ?? periods[0]
  );
}
