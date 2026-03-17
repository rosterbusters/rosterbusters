import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import moment from "moment";
import type {
  Ward,
  RosterPeriod,
  RosterPeriodWindow,
  RosterRow,
  ShiftCode,
  WardRosterResponse,
  WardStatisticsResponse,
  ShiftAssignment,
} from "./types";
import { SHIFT_CODE_MAP } from "./types";

const API_BASE = import.meta.env.VITE_API_URL || "";

// Fetch helper with auth
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

function mapApiPeriod(data: Record<string, unknown>): RosterPeriod {
  return {
    periodId: data.periodid as number,
    name: data.name as string,
    startDate: data.startdate as string,
    endDate: data.enddate as string,
    status: data.status as RosterPeriod["status"],
  };
}

// Hook to fetch accessible wards
export function useWards() {
  return useQuery<Ward[]>({
    queryKey: ["roster", "wards"],
    queryFn: async () => {
      const data = await fetchWithAuth("/api/v1/wards/");
      return data.map((w: Record<string, unknown>) => ({
        wardId: w.wardid,
        wardName: w.wardname,
        wardType: w.wardtype ?? "",
        campus: w.campus ?? "",
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook to fetch roster periods from the API
export function useRosterPeriods() {
  return useQuery<RosterPeriod[]>({
    queryKey: ["roster", "periods"],
    queryFn: async () => {
      const data = await fetchWithAuth("/api/v1/shift-requests/periods");
      return data.map((p: Record<string, unknown>) => mapApiPeriod(p));
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useRosterPeriodWindow() {
  return useQuery<RosterPeriodWindow>({
    queryKey: ["roster", "period-window"],
    queryFn: async () => {
      const data = await fetchWithAuth("/api/v1/shift-requests/periods/current-upcoming");
      return {
        currentPeriod: data.current_period
          ? mapApiPeriod(data.current_period as Record<string, unknown>)
          : null,
        upcomingPeriod: data.upcoming_period
          ? mapApiPeriod(data.upcoming_period as Record<string, unknown>)
          : null,
        requestOpenPeriod: data.request_open_period
          ? mapApiPeriod(data.request_open_period as Record<string, unknown>)
          : null,
      };
    },
    staleTime: 10 * 60 * 1000,
  });
}

// Hook to fetch ward statistics (nurses list)
export function useWardStatistics(wardId: number | null) {
  return useQuery<WardStatisticsResponse>({
    queryKey: ["roster", "statistics", wardId],
    queryFn: async () => {
      if (!wardId) throw new Error("Ward ID required");
      return fetchWithAuth(`/api/v1/roster/manager/statistics?ward_id=${wardId}`);
    },
    enabled: !!wardId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Hook to fetch ward roster data
export function useWardRoster(wardId: number | null, periodId: number | null) {
  return useQuery<WardRosterResponse>({
    queryKey: ["roster", "ward", wardId, periodId],
    queryFn: async () => {
      if (!wardId || !periodId) throw new Error("Ward ID and Period ID required");
      return fetchWithAuth(`/api/v1/roster/ward/${wardId}?period_id=${periodId}`);
    },
    enabled: !!wardId && !!periodId,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

// Hook to fetch shift codes with duration hours from the API
export function useShiftCodes() {
  return useQuery<Map<string, number>>({
    queryKey: ["shiftCodes"],
    queryFn: async () => {
      const data: Array<{ shiftcode: string; shiftdurationhours: number | null }> =
        await fetchWithAuth("/api/v1/shift-requests/shift-codes");
      const map = new Map<string, number>();
      data.forEach((sc) => {
        if (sc.shiftdurationhours != null) {
          map.set(sc.shiftcode, sc.shiftdurationhours);
        }
      });
      return map;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

// Get duration hours for a shift code, falling back to the static SHIFT_CODE_MAP
export function getShiftDurationHours(
  shiftCode: string,
  apiDurationMap?: Map<string, number>,
): number {
  if (apiDurationMap?.has(shiftCode)) {
    return apiDurationMap.get(shiftCode)!;
  }
  return SHIFT_CODE_MAP[shiftCode as ShiftCode]?.durationHours ?? 0;
}

// Hook to update a roster entry
export function useUpdateRoster() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      wardId,
      nurseId,
      periodId,
      shiftDate,
      shiftCode,
    }: {
      wardId: number;
      nurseId: number;
      periodId: number;
      shiftDate: string;
      shiftCode: ShiftCode;
    }) => {
      return fetchWithAuth("/api/v1/roster/create", {
        method: "POST",
        body: JSON.stringify({
          ward_id: wardId,
          nurse_id: nurseId,
          period_id: periodId,
          shift_date: shiftDate,
          shift_code: shiftCode,
        }),
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate roster queries to refetch
      queryClient.invalidateQueries({
        queryKey: ["roster", "ward", variables.wardId, variables.periodId],
      });
    },
  });
}

// Transform API data to grid format
export function transformRosterData(
  nurses: WardStatisticsResponse["nurses"],
  rosterEntries: WardRosterResponse["roster_entries"],
  shiftDurationMap?: Map<string, number>,
): RosterRow[] {
  // Create a map of nurse roster entries
  const rosterMap = new Map<number, Map<string, ShiftAssignment>>();

  for (const entry of rosterEntries) {
    if (!rosterMap.has(entry.nurse_id)) {
      rosterMap.set(entry.nurse_id, new Map());
    }

    const dateKey = moment(entry.shift_date).format("YYYY-MM-DD");
    rosterMap.get(entry.nurse_id)!.set(dateKey, {
      rosterId: entry.roster_id,
      nurseId: entry.nurse_id,
      shiftDate: entry.shift_date,
      shiftCode: entry.shift_code as ShiftCode,
      status: entry.status as ShiftAssignment["status"],
      comment: entry.comment ?? undefined,
    });
  }

  // Transform nurses to roster rows
  return nurses.map((nurse) => {
    const nurseRoster = rosterMap.get(nurse.nurseId) || new Map();

    // Calculate hours using API shift durations, falling back to static map
    let workedHours = 0;
    nurseRoster.forEach((shift) => {
      workedHours += getShiftDurationHours(shift.shiftCode, shiftDurationMap);
    });

    const contractedHours = nurse.employmentType === "FullTime" ? 44 : 22;

    return {
      nurseId: nurse.nurseId,
      name: nurse.name,
      designation: nurse.designation,
      hours: {
        worked: workedHours,
        contracted: contractedHours,
      },
      shifts: Object.fromEntries(nurseRoster),
      hasOvertime: workedHours > contractedHours,
      hasWarning: workedHours > contractedHours * 1.2,
    };
  });
}

// Combined hook for roster page data
export function useRosterPageData(wardId: number | null, periodId: number | null) {
  const { data: statistics, isLoading: statsLoading } = useWardStatistics(wardId);
  const { data: rosterData, isLoading: rosterLoading } = useWardRoster(wardId, periodId);
  
  const rows = useMemo(() => {
    if (!statistics?.nurses || !rosterData?.roster_entries) {
      return [];
    }
    return transformRosterData(statistics.nurses, rosterData.roster_entries);
  }, [statistics?.nurses, rosterData?.roster_entries]);
  
  return {
    rows,
    isLoading: statsLoading || rosterLoading,
    ward: rosterData?.ward,
    period: rosterData?.period,
  };
}

// Hook to publish a roster (change Draft entries to Confirmed)
export function usePublishRoster() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      wardId,
      periodId,
    }: {
      wardId: number;
      periodId: number;
    }) => {
      return fetchWithAuth(`/api/v1/roster/ward/${wardId}/publish?period_id=${periodId}`, {
        method: "POST",
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate roster queries to refetch
      queryClient.invalidateQueries({
        queryKey: ["roster", "ward", variables.wardId, variables.periodId],
      });
      // Also invalidate periods as PublishedAt may have changed
      queryClient.invalidateQueries({
        queryKey: ["roster", "periods"],
      });
    },
  });
}

// Algorithm roster generation response type
export interface AlgorithmRosterResponse {
  wardId: number;
  periodId: number;
  generatedAt: string;
  rosterData: RosterRow[];
}


// Hook to generate algorithm-based roster
export function useGenerateAlgorithmRoster() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      wardId,
      periodId,
      startDate,
      onProgress,
    }: {
      wardId: number;
      periodId: number;
      startDate: Date;
      onProgress?: (percent: number, generation: number, total: number, bestScore: number) => void;
    }) => {
      // 1. Stream the SSE endpoint to get real-time progress + final result
      const token = localStorage.getItem("access_token") || "";
      const response = await fetch(`${API_BASE}/api/v1/roster/generate-algorithm-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ward_id: wardId, period_id: periodId }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let algorithmResult: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === "progress") {
            onProgress?.(event.percent, event.generation, event.total, event.best_score);
          } else if (event.type === "complete") {
            algorithmResult = event;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }

      if (!algorithmResult) throw new Error("Algorithm did not return a result");

      // 2. Fetch shift codes for accurate duration calculation
      let shiftDurationMap: Map<string, number> = new Map();
      try {
        const shiftCodes: Array<{ shiftcode: string; shiftdurationhours: number | null }> =
          await fetchWithAuth("/api/v1/shift-requests/shift-codes");
        shiftCodes.forEach((sc) => {
          if (sc.shiftdurationhours != null) {
            shiftDurationMap.set(sc.shiftcode, sc.shiftdurationhours);
          }
        });
      } catch {
        // Fall back to static SHIFT_CODE_MAP via getShiftDurationHours
      }

      // 3. Transform backend format → RosterRow[]
      const rosterData: RosterRow[] = algorithmResult.roster.nurses.map((nurse: any) => {
        const shiftsObject: Record<string, any> = {};

        nurse.schedule.forEach((shiftCode: string, index: number) => {
          const dateKey = moment(startDate).add(index, "days").format("YYYY-MM-DD");
          shiftsObject[dateKey] = {
            nurseId: nurse.id,
            shiftDate: dateKey,
            shiftCode: shiftCode,
            status: "Pending",
          };
        });

        const workedHours = nurse.schedule.reduce(
          (sum: number, shiftCode: string) =>
            sum + getShiftDurationHours(shiftCode, shiftDurationMap),
          0,
        );
        const contractedHours = 44;

        return {
          nurseId: nurse.id,
          name: nurse.name,
          designation: nurse.rank === "A" ? "RN" : nurse.rank === "B" ? "EN" : "HCA",
          hours: { worked: workedHours, contracted: contractedHours },
          shifts: shiftsObject,
          hasOvertime: workedHours > contractedHours,
          hasWarning: workedHours > contractedHours * 1.2,
        };
      });

      return {
        rosterData,
        algorithm: algorithmResult.method,
      };
    },
    onSuccess: (data, variables) => {
      // Invalidate roster queries to refetch
      queryClient.invalidateQueries({
        queryKey: ["roster", "ward", variables.wardId, variables.periodId],
      });
      
      // Optionally show success notification
      // toast.success(`Roster generated using ${data.algorithm}`);
    },
    onError: (error: any) => {
      // Handle errors
      console.error("Algorithm generation failed:", error);
      // toast.error(error.message || "Failed to generate roster");
    },
  });
}

// Helper function to calculate day index from date
function calculateDayIndex(targetDate: string, startDate: string): number {
  const target = new Date(targetDate);
  const start = new Date(startDate);
  const diffTime = target.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Helper function to add days to a date
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

// Map full designation strings to short acronyms for Excel export
function designationToAcronym(designation: string): string {
  const d = designation.toLowerCase().trim();

  if (d.includes('senior nursing aide'))   return 'SNA';
  if (d.includes('senior staff nurse'))    return 'SSN';
  if (d.includes('senior enrolled nurse')) return 'SEN';
  if (d.includes('staff nurse'))           return 'SN';
  if (d.includes('enrolled nurse'))        return 'EN';
  if (d.includes('registered nurse'))      return 'RN';
  if (d.includes('nursing aide'))          return 'NA';
  if (d.includes('healthcare assistant'))  return 'HCA';
  if (d.includes('nurse clinician'))       return 'NC';
  if (d.includes('nurse manager'))         return 'NM';
  if (d.includes('assistant nurse'))       return 'ANC';

  // Already an acronym (RN, EN, HCA, etc.) – return as-is
  return designation;
}

// ─────────────────────────────────────────────
// Roster Changelog
// ─────────────────────────────────────────────

export interface ChangelogEntry {
  changeid: number;
  rosterid: number | null;
  changedat: string;
  changetype: string;
  oldshiftcode: string | null;
  newshiftcode: string | null;
  reason: string | null;
  changesource: string;
  shiftdate: string | null;
  nursename: string;
  modifiedby: string;
}

export interface ChangelogCreatePayload {
  rosterid?: number | null;
  oldnurseid?: number | null;
  oldshiftcode?: string | null;
  newshiftcode?: string | null;
  changetype: string;
  reason?: string | null;
  changesource?: string;
}

/** Fetch all changelog entries for a ward + period. */
export function useRosterChangelog(wardId: number | null, periodId: number | null) {
  return useQuery<ChangelogEntry[]>({
    queryKey: ["roster", "changelog", wardId, periodId],
    queryFn: async () => {
      if (!wardId || !periodId) return [];
      return fetchWithAuth(
        `/api/v1/roster/changelog?ward_id=${wardId}&period_id=${periodId}`
      );
    },
    enabled: !!wardId && !!periodId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/** PATCH the comment on a single roster entry. */
export function useUpdateRosterComment() {
  return useMutation({
    mutationFn: async ({
      rosterId,
      comment,
    }: {
      rosterId: number;
      comment: string | null;
    }) => {
      return fetchWithAuth(`/api/v1/roster/roster/${rosterId}/comment`, {
        method: "PATCH",
        body: JSON.stringify({ comment }),
      });
    },
  });
}

/** Post a new changelog entry when a manager edits a shift or adds a comment. */
export function useCreateChangelog(wardId: number | null, periodId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ChangelogCreatePayload) => {
      return fetchWithAuth("/api/v1/roster/changelog", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["roster", "changelog", wardId, periodId],
      });
    },
  });
}

// Hook for Excel export
export function useRosterExport() {
  return {
    exportToXLSX: async (data: RosterRow[], startDate: Date, viewMode: "week" | "twoWeeks") => {
      const XLSX = await import("xlsx");
      const days = viewMode === "week" ? 7 : 14;

      // Header row: 2 blank cells + date strings in YYYY-MM-DD
      const header = [
        "",
        "",
        ...Array.from({ length: days }, (_, i) =>
          moment(startDate).add(i, "days").format("YYYY-MM-DD")
        ),
      ];

      // Data rows: designation (acronym), name, then shift code per day
      const rows = data.map((row) => [
        designationToAcronym(row.designation),
        row.name,
        ...Array.from({ length: days }, (_, i) => {
          const dateKey = moment(startDate).add(i, "days").format("YYYY-MM-DD");
          return row.shifts[dateKey]?.shiftCode ?? "";
        }),
      ]);

      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

      ws["!cols"] = [
        { wch: 10 }, // designation (acronym – narrower)
        { wch: 20 }, // name
        ...Array(days).fill({ wch: 12 }), // date columns
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Roster");
      XLSX.writeFile(wb, `roster_${moment(startDate).format("YYYY-MM-DD")}.xlsx`);
    },
  };
}



