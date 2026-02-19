import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import moment from "moment";
import type {
  Ward,
  RosterPeriod,
  RosterRow,
  ShiftCode,
  WardRosterResponse,
  WardStatisticsResponse,
  ShiftAssignment,
} from "./types";

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

// Hook to fetch accessible wards
export function useWards() {
  return useQuery<Ward[]>({
    queryKey: ["roster", "wards"],
    queryFn: async () => {
      const data = await fetchWithAuth("/api/v1/roster/wards");
      return data.map((w: Record<string, unknown>) => ({
        wardId: w.ward_id,
        wardName: w.ward_name,
        wardType: w.ward_type,
        campus: w.campus,
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook to fetch roster periods
export function useRosterPeriods() {
  return useQuery<RosterPeriod[]>({
    queryKey: ["roster", "periods"],
    queryFn: async () => {
      // For now, generate mock periods since we don't have a dedicated endpoint
      // In production, this would fetch from /api/v1/roster/periods
      const today = moment();
      const periods: RosterPeriod[] = [];
      
      for (let i = -2; i <= 2; i++) {
        const startDate = moment(today).add(i * 14, "days").startOf("isoWeek");
        const endDate = moment(startDate).add(13, "days");
        periods.push({
          periodId: i + 3,
          name: `${startDate.format("MMM DD")} - ${endDate.format("MMM DD YYYY")}`,
          startDate: startDate.format("YYYY-MM-DD"),
          endDate: endDate.format("YYYY-MM-DD"),
          status: i < 0 ? "Finalized" : i === 0 ? "RequestOpen" : "RequestOpen",
        });
      }
      
      return periods;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
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
  rosterEntries: WardRosterResponse["roster_entries"]
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
    });
  }
  
  // Transform nurses to roster rows
  return nurses.map((nurse) => {
    const nurseRoster = rosterMap.get(nurse.nurseId) || new Map();
    
    // Calculate hours (simplified - in production this would be more accurate)
    let workedHours = 0;
    nurseRoster.forEach((shift) => {
      if (["D", "P", "N"].includes(shift.shiftCode)) workedHours += 8;
      else if (shift.shiftCode === "A") workedHours += 6;
      else if (["N-12"].includes(shift.shiftCode)) workedHours += 12;
    });
    
    const contractedHours = nurse.employmentType === "FullTime" ? 42 : 21;
    
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
    }: {
      wardId: number;
      periodId: number;
      startDate: Date; // Keep it as a Date object for easier math
    }) => {
      // 1. Call the algorithm API
      const response = await fetchWithAuth(
        "/api/v1/roster/generate-algorithm",
        {
          method: "POST",
          body: JSON.stringify({
            ward_id: wardId,
            period_id: periodId,
          }),
        }
      );

      // 2. Transform the backend format into the RosterRow format the Grid expects
      // Backend: n.schedule = ["AM", "OFF", ...]
      // Frontend: n.shifts = { "2026-02-16": { ... } }
      const rosterData: RosterRow[] = response.roster.nurses.map((nurse: any) => {
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

        return {
          nurseId: nurse.id,
          name: nurse.name,
          designation: nurse.rank === "A" ? "RN" : nurse.rank === "B" ? "EN" : "HCA",
          // Calculate worked hours so the UI doesn't error on 'worked'
          hours: { 
            worked: (nurse.stats?.total_shifts || 0) * 8, 
            contracted: 42 
          },
          shifts: shiftsObject,
          hasOvertime: false,
          hasWarning: false,
        };
      });

      return {
        rosterData,
        algorithm: response.method,
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

// Hook for CSV export
export function useRosterExport() {
  return {
    exportToCSV: (data: RosterRow[], startDate: Date, viewMode: "week" | "twoWeeks") => {
      const days = viewMode === "week" ? 7 : 14;
      const headers = ["Name", "Designation", "Hours"];
      
      // Add day headers
      for (let i = 0; i < days; i++) {
        const date = moment(startDate).add(i, "days");
        headers.push(date.format("ddd DD/MM"));
      }
      
      const rows = data.map((row) => {
        const rowData = [
          row.name,
          row.designation,
          `${row.hours.worked}/${row.hours.contracted}`,
        ];
        
        for (let i = 0; i < days; i++) {
          const dateKey = moment(startDate).add(i, "days").format("YYYY-MM-DD");
          const shift = row.shifts[dateKey];
          rowData.push(shift?.shiftCode || "");
        }
        
        return rowData;
      });
      
      // Create CSV content
      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
      ].join("\n");
      
      // Download file
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `roster_${moment(startDate).format("YYYY-MM-DD")}.csv`;
      link.click();
    },
  };
}



