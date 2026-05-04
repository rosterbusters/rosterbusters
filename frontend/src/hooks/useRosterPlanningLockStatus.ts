import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  clearAlgorithmTask,
  loadAlgorithmTask,
} from "@/components/NurseManager/RosterTable"

const API_BASE = import.meta.env.VITE_API_URL || ""

type AlgorithmTaskStatus =
  | { task_id: string; status: "pending" | "started" | "in_progress" }
  | { task_id: string; status: "complete" | "failed"; error?: string }

export interface RosterPlanningLockStatus {
  isLocked: boolean
  nextWindowStart: string | undefined
  nextWindowEnd: string | undefined
  isLoading: boolean
}

async function fetchWithAuth<T>(url: string): Promise<T> {
  const token = localStorage.getItem("access_token") || ""
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

interface RosterPeriodApi {
  periodid: number
  startdate: string
  enddate: string
  planninglockdate?: string
}

function resolveLockWindow(period: RosterPeriodApi | null) {
  if (!period) return { lockStart: undefined, lockEnd: undefined }
  if (!period.planninglockdate) {
    return { lockStart: undefined, lockEnd: undefined }
  }
  const lockStart = new Date(period.planninglockdate)
  const lockEnd = new Date(period.startdate)
  return {
    lockStart,
    lockEnd,
  }
}

export function useRosterPlanningLockStatus(
  wardId: number | null,
  periodId: number | null,
): RosterPlanningLockStatus {
  const storedTask = useMemo(() => {
    if (!wardId || !periodId) return null
    return loadAlgorithmTask(wardId, periodId)
  }, [wardId, periodId])

  const taskId = storedTask?.taskId ?? null

  const { data: taskData, isLoading: isLoadingTask } = useQuery({
    queryKey: ["roster", "algorithm-task-status", wardId, periodId, taskId],
    queryFn: async () => {
      if (!taskId) throw new Error("Task ID required")
      return fetchWithAuth<AlgorithmTaskStatus>(
        `/api/v1/roster/task/${taskId}/status`,
      )
    },
    enabled: !!taskId,
    refetchInterval: taskId ? 3000 : false,
    staleTime: 0,
  })

  const { data: periodData, isLoading: isLoadingPeriod } = useQuery({
    queryKey: ["roster", "periods", periodId],
    queryFn: async () => {
      const periods = await fetchWithAuth<RosterPeriodApi[]>(
        "/api/v1/shift-requests/periods",
      )
      return periods.find((period) => period.periodid === periodId) ?? null
    },
    enabled: !!periodId,
    staleTime: 10 * 60 * 1000,
  })

  return useMemo(() => {
    if (!taskId) {
      const { lockStart, lockEnd } = resolveLockWindow(periodData ?? null)
      const now = new Date()
      const isLockedByPeriod = !!lockStart && now >= lockStart
      return {
        isLocked: isLockedByPeriod,
        nextWindowStart: lockStart?.toISOString(),
        nextWindowEnd: lockEnd?.toISOString(),
        isLoading: isLoadingPeriod,
      }
    }

    if (isLoadingTask || isLoadingPeriod) {
      return {
        isLocked: false,
        nextWindowStart: undefined,
        nextWindowEnd: undefined,
        isLoading: true,
      }
    }

    const status = taskData?.status
    const isLockedByTask =
      status === "pending" || status === "started" || status === "in_progress"
    const { lockStart, lockEnd } = resolveLockWindow(periodData ?? null)
    const now = new Date()
    const isLockedByPeriod = !!lockStart && now >= lockStart
    const isLocked = isLockedByTask || isLockedByPeriod

    if ((status === "complete" || status === "failed") && wardId && periodId) {
      clearAlgorithmTask(wardId, periodId)
    }

    return {
      isLocked,
      nextWindowStart: lockStart?.toISOString(),
      nextWindowEnd: lockEnd?.toISOString(),
      isLoading: false,
    }
  }, [
    isLoadingPeriod,
    isLoadingTask,
    periodData,
    periodId,
    taskData?.status,
    taskId,
    wardId,
  ])
}
