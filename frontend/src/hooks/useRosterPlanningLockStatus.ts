import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { clearAlgorithmTask, loadAlgorithmTask } from "@/components/NurseManager/RosterTable";

const API_BASE = import.meta.env.VITE_API_URL || "";

type AlgorithmTaskStatus =
  | { task_id: string; status: "pending" | "started" | "in_progress" }
  | { task_id: string; status: "complete" | "failed"; error?: string };

export interface RosterPlanningLockStatus {
  isLocked: boolean;
  nextWindowStart: string | undefined;
  nextWindowEnd: string | undefined;
  isLoading: boolean;
}

async function fetchWithAuth(url: string): Promise<AlgorithmTaskStatus> {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export function useRosterPlanningLockStatus(
  wardId: number | null,
  periodId: number | null,
): RosterPlanningLockStatus {
  const storedTask = useMemo(() => {
    if (!wardId || !periodId) return null;
    return loadAlgorithmTask(wardId, periodId);
  }, [wardId, periodId]);

  const taskId = storedTask?.taskId ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["roster", "algorithm-task-status", wardId, periodId, taskId],
    queryFn: async () => {
      if (!taskId) throw new Error("Task ID required");
      return fetchWithAuth(`/api/v1/roster/task/${taskId}/status`);
    },
    enabled: !!taskId,
    refetchInterval: taskId ? 3000 : false,
    staleTime: 0,
  });

  return useMemo(() => {
    if (!taskId) {
      return {
        isLocked: false,
        nextWindowStart: undefined,
        nextWindowEnd: undefined,
        isLoading: false,
      };
    }

    if (isLoading) {
      return {
        isLocked: false,
        nextWindowStart: undefined,
        nextWindowEnd: undefined,
        isLoading: true,
      };
    }

    const status = data?.status;
    const isLocked =
      status === "pending" || status === "started" || status === "in_progress";

    if ((status === "complete" || status === "failed") && wardId && periodId) {
      clearAlgorithmTask(wardId, periodId);
    }

    return {
      isLocked,
      nextWindowStart: undefined,
      nextWindowEnd: undefined,
      isLoading: false,
    };
  }, [data?.status, isLoading, periodId, taskId, wardId]);
}
