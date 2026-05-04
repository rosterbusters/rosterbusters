import { useQuery } from "@tanstack/react-query"
import { format, parseISO } from "date-fns"
import { useMemo } from "react"
import type { RosterPeriodPublic } from "@/client"

const API_BASE = import.meta.env.VITE_API_URL || ""

export interface RequestPeriodWindow {
  current_period?: RosterPeriodPublic | null
  upcoming_period?: RosterPeriodPublic | null
  request_open_period?: RosterPeriodPublic | null
}

export interface ApplicationLockStatus {
  isLocked: boolean
  nextWindowStart: string | undefined
  nextWindowEnd: string | undefined
  selectedPeriod: RosterPeriodPublic | undefined
  isLoading: boolean
}

function formatWindowDate(dateStr: string): string {
  return format(parseISO(dateStr), "d MMM")
}

function getTodayIsoDate(): string {
  return format(new Date(), "yyyy-MM-dd")
}

function isWithinInclusiveRange(
  date: string,
  start: string | undefined,
  end: string | undefined,
): boolean {
  return !!start && !!end && start <= date && date <= end
}

export function getRequestTargetPeriod(
  periodWindow: RequestPeriodWindow | undefined,
): RosterPeriodPublic | undefined {
  return (
    periodWindow?.upcoming_period ??
    periodWindow?.current_period ??
    periodWindow?.request_open_period ??
    undefined
  )
}

export function useRequestPeriodWindow() {
  return useQuery<RequestPeriodWindow>({
    queryKey: ["roster-period-window"],
    queryFn: async () => {
      const token = localStorage.getItem("access_token") || ""
      const response = await fetch(
        `${API_BASE}/api/v1/shift-requests/periods/current-upcoming`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )

      if (!response.ok) {
        throw new Error("Failed to load roster period window.")
      }

      return response.json() as Promise<RequestPeriodWindow>
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useApplicationLockStatus(): ApplicationLockStatus {
  const { data: periodWindow, isLoading } = useRequestPeriodWindow()

  return useMemo(() => {
    if (isLoading) {
      return {
        isLocked: false,
        nextWindowStart: undefined,
        nextWindowEnd: undefined,
        selectedPeriod: undefined,
        isLoading: true,
      }
    }

    const today = getTodayIsoDate()
    const selectedPeriod = getRequestTargetPeriod(periodWindow)
    const isLocked = !isWithinInclusiveRange(
      today,
      selectedPeriod?.requestopendate,
      selectedPeriod?.requestclosedate,
    )

    const nextWindowStart =
      selectedPeriod?.requestopendate && selectedPeriod.requestopendate > today
        ? formatWindowDate(selectedPeriod.requestopendate)
        : undefined
    const nextWindowEnd =
      selectedPeriod?.requestclosedate &&
      selectedPeriod.requestclosedate > today
        ? formatWindowDate(selectedPeriod.requestclosedate)
        : undefined

    return {
      isLocked,
      nextWindowStart,
      nextWindowEnd,
      selectedPeriod,
      isLoading: false,
    }
  }, [isLoading, periodWindow])
}
