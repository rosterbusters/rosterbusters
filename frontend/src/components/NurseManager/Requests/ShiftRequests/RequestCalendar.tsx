import { Badge, Box, Grid, Span } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import cx from "clsx"
import moment from "moment"
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  Calendar,
  type DateLocalizer,
  momentLocalizer,
  Navigate,
  type ToolbarProps,
  type View,
} from "react-big-calendar"
import { ShiftRequestsService } from "@/client"
import type { RosterPeriod } from "@/components/NurseManager/RosterTable/types"
import {
  useRosterPeriods,
  useRosterPeriodWindow,
} from "@/components/NurseManager/RosterTable/useRosterData"
import useAuth from "@/hooks/useAuth"
import CustomWeekView from "./CustomRequestView"

const localizer = momentLocalizer(moment)

interface Event {
  title: string
  start: Date
  end: Date
  allDay?: boolean
  resource?: any
}

interface RequestCalendarToolbarProps extends ToolbarProps {
  isUpcomingPeriod?: boolean
}

export const CustomToolbar: ComponentType<RequestCalendarToolbarProps> = ({
  isUpcomingPeriod = false,
  label,
  localizer,
  onNavigate,
}: RequestCalendarToolbarProps) => {
  return (
    <Grid
      templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}
      className={cx("rbc-toolbar")}
      gap={{ base: "2", md: "0" }}
      position={{ base: "sticky", md: "relative" }}
    >
      <Span
        className={cx("rbc-btn-group")}
        justifySelf={{ base: "center", md: "start" }}
      >
        <button type="button" onClick={() => onNavigate(Navigate.PREVIOUS)}>
          {localizer.messages.previous}
        </button>
      </Span>
      <Span
        className={cx("rbc-toolbar-label")}
        display="flex"
        alignItems="center"
        justifyContent="center"
        gap={2}
      >
        {label}
        {isUpcomingPeriod ? (
          <Badge variant={"upcomingPeriod" as any}>Upcoming</Badge>
        ) : null}
      </Span>
      <Span
        justifySelf={{ base: "center", md: "end" }}
        className={cx("rbc-btn-group")}
      >
        <button type="button" onClick={() => onNavigate(Navigate.NEXT)}>
          {localizer.messages.next}
        </button>
      </Span>
    </Grid>
  )
}

interface RequestCalendarProps {
  wardId: number | null | undefined
  displayedPeriod?: RosterPeriod | null
  onDisplayedPeriodChange?: (period: RosterPeriod | null) => void
}

interface FortnightViewProps {
  date: Date
  localizer: DateLocalizer
  events: Event[]
  [key: string]: unknown
}

/**
 * Calendar that displays shift requests for all nurses in the ward.
 *
 * FIX SUMMARY:
 * - wardId is now properly populated from the backend (see users.py fix).
 *   Without wardId, the query was disabled and stale cache was showing instead.
 * - Added staleTime: 0 on the shift-requests query so invalidation always
 *   triggers an immediate refetch rather than serving cache.
 * - The `enabled` guard now cleanly waits for both wardId AND periodId.
 * - Period selection logic is aligned with NewShiftRequest (today-first, then fallback).
 */
export default function RequestCalendar({
  wardId,
  displayedPeriod,
  onDisplayedPeriodChange,
}: RequestCalendarProps) {
  const { user } = useAuth()
  const currentNurseId = user?.nurseid

  const { data: periodWindow } = useRosterPeriodWindow()
  const { data: periods = [] } = useRosterPeriods()

  // ─── Calendar navigation ──────────────────────────────────────────────────
  const [date, setDate] = useState(() => moment().startOf("isoWeek").toDate())

  useEffect(() => {
    if (displayedPeriod?.startDate) {
      setDate(moment(displayedPeriod.startDate).startOf("isoWeek").toDate())
      return
    }

    if (periodWindow?.currentPeriod?.startDate) {
      setDate(
        moment(periodWindow.currentPeriod.startDate)
          .startOf("isoWeek")
          .toDate(),
      )
    }
  }, [displayedPeriod?.startDate, periodWindow?.currentPeriod?.startDate])

  const onNavigate = useCallback(
    (newDate: Date) => {
      setDate(newDate)
      const navigatedPeriod =
        periods.find((period) =>
          moment(newDate).isBetween(
            moment(period.startDate),
            moment(period.endDate),
            "day",
            "[]",
          ),
        ) ?? null

      onDisplayedPeriodChange?.(navigatedPeriod)
    },
    [onDisplayedPeriodChange, periods],
  )

  const activePeriod = useMemo(
    () =>
      periods.find((period) =>
        moment(date).isBetween(
          moment(period.startDate),
          moment(period.endDate),
          "day",
          "[]",
        ),
      ) ??
      displayedPeriod ??
      periodWindow?.currentPeriod ??
      null,
    [date, displayedPeriod, periodWindow?.currentPeriod, periods],
  )

  const periodId = activePeriod?.periodId
  const isViewingUpcomingPeriod =
    activePeriod?.periodId != null &&
    periodWindow?.upcomingPeriod?.periodId != null &&
    activePeriod.periodId === periodWindow.upcomingPeriod.periodId

  // ─── Shift requests for entire ward ──────────────────────────────────────
  const { data: shiftRequests } = useQuery({
    queryKey: ["shift-requests", "ward", wardId, periodId],
    queryFn: () =>
      ShiftRequestsService.getShiftRequestsByWard({
        wardId: wardId!,
        periodId: periodId,
      }),
    enabled: !!wardId && !!periodId,
    // FIX: staleTime: 0 ensures that after queryClient.invalidateQueries(["shift-requests"])
    // fires in NewShiftRequest/EditShiftRequest, this query immediately refetches
    // rather than serving a cached (stale) result.
    staleTime: 0,
  })

  // ─── Ward nurses (for name lookup in calendar blocks) ─────────────────────
  const { data: wardNurses } = useQuery({
    queryKey: ["ward-nurses", wardId],
    queryFn: () => ShiftRequestsService.getWardNurses({ wardId: wardId! }),
    enabled: !!wardId,
    staleTime: 5 * 60 * 1000,
  })

  const nurseMap = useMemo(() => {
    if (!wardNurses) return new Map<number, string>()
    return new Map(wardNurses.map((n) => [n.nurseid, n.name]))
  }, [wardNurses])

  // ─── Map shift requests → calendar events ─────────────────────────────────
  const events: Event[] = useMemo(() => {
    return shiftRequests
      ? shiftRequests.map((sr) => ({
          title: sr.preferredshifttype,
          start: new Date(sr.preferreddate),
          end: new Date(sr.preferreddate),
          allDay: true,
          resource: {
            nurseName: nurseMap.get(sr.nurseid) ?? `Nurse ${sr.nurseid}`,
            isOwn: sr.nurseid === currentNurseId,
            requestId: sr.requestid,
            preferredDate: sr.preferreddate,
            shiftType: sr.preferredshifttype,
            status: sr.status,
            reason: sr.reason,
          },
        }))
      : []
  }, [shiftRequests, nurseMap, currentNurseId])

  // ─── Calendar view setup ──────────────────────────────────────────────────
  const { views, defaultView } = useMemo(() => {
    const FortnightView = (props: FortnightViewProps) => (
      <CustomWeekView {...props} wardId={wardId} />
    )
    FortnightView.range = CustomWeekView.range
    FortnightView.navigate = CustomWeekView.navigate
    FortnightView.title = CustomWeekView.title
    const customViews = {
      fortnight: FortnightView,
      week: false,
      day: false,
    }
    return {
      views: customViews,
      defaultView: "fortnight" as View,
    }
  }, [wardId])

  const components = useMemo(
    () => ({
      toolbar: (toolbarProps: ToolbarProps) => (
        <CustomToolbar
          {...toolbarProps}
          isUpcomingPeriod={isViewingUpcomingPeriod}
        />
      ),
    }),
    [isViewingUpcomingPeriod],
  )

  return (
    <Box
      h="100%"
      borderWidth="1px"
      p={3}
      borderColor="border"
      borderRadius={10}
    >
      <Calendar
        localizer={localizer}
        startAccessor="start"
        endAccessor="end"
        events={events}
        components={components}
        view={defaultView}
        views={views}
        date={date}
        showAllEvents
        onNavigate={onNavigate}
      />
    </Box>
  )
}
