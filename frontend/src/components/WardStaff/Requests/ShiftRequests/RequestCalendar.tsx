import { Badge, Box, Grid, Span, VStack } from "@chakra-ui/react"
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
  momentLocalizer,
  Navigate,
  type ToolbarProps,
  type View,
} from "react-big-calendar"
import { ShiftRequestsService } from "@/client"
import type { RosterPeriodPublic } from "@/client/types.gen"
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

interface RequestCalendarProps {
  wardId: number | null | undefined
  activePeriod?: RosterPeriodPublic
  periods?: RosterPeriodPublic[]
  upcomingPeriodId?: number
  onDisplayedPeriodChange?: (period: RosterPeriodPublic | null) => void
  isLocked?: boolean
  nextWindowStart?: string
  nextWindowEnd?: string
}

interface RequestCalendarToolbarProps extends ToolbarProps {
  periodStatus?: "Past" | "Current" | "Upcoming" | "Future"
}

export const CustomToolbar: ComponentType<RequestCalendarToolbarProps> = ({
  periodStatus,
  label,
  localizer,
  onNavigate,
}: RequestCalendarToolbarProps) => {
  const badgeProps = (() => {
    switch (periodStatus) {
      case "Current":
        return { colorPalette: "blue" }
      case "Upcoming":
        return { colorPalette: "green" }
      case "Future":
        return { colorPalette: "purple" }
      case "Past":
        return { colorPalette: "gray" }
      default:
        return undefined
    }
  })()

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
        {periodStatus && badgeProps ? (
          <Badge size="sm" variant="subtle" {...badgeProps}>
            {periodStatus}
          </Badge>
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

/**
 * Calendar that displays shift requests for all nurses in the ward.
 *
 * FIX SUMMARY:
 * - wardId is now properly populated from the backend (see users.py fix).
 *   Without wardId, the query was disabled and stale cache was showing instead.
 * - Added staleTime: 0 on the shift-requests query so invalidation always
 *   triggers an immediate refetch rather than serving cache.
 * - The `enabled` guard now cleanly waits for both wardId AND periodId.
 * - Period selection logic is aligned with the lock banner window response.
 */
export default function RequestCalendar({
  wardId,
  activePeriod,
  periods = [],
  upcomingPeriodId,
  onDisplayedPeriodChange,
  isLocked = false,
  nextWindowStart,
  nextWindowEnd,
}: RequestCalendarProps) {
  const { user } = useAuth()
  const currentNurseId = user?.nurseid

  const [date, setDate] = useState(() => moment().startOf("isoWeek").toDate())

  useEffect(() => {
    if (activePeriod?.startdate) {
      setDate(moment(activePeriod.startdate).toDate())
    }
  }, [activePeriod?.startdate])

  const periodId = activePeriod?.periodid

  const { data: shiftRequests } = useQuery({
    queryKey: ["shift-requests", "ward", wardId, periodId],
    queryFn: () =>
      ShiftRequestsService.getShiftRequestsByWard({
        wardId: wardId!,
        periodId,
      }),
    enabled: !!wardId && !!periodId,
    // After invalidation in request create/edit flows, refetch immediately.
    staleTime: 0,
  })

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

  const events: Event[] = useMemo(() => {
    if (!shiftRequests) return []
    return shiftRequests.map((sr) => ({
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
      },
    }))
  }, [shiftRequests, nurseMap, currentNurseId])

  const { views, defaultView } = useMemo(() => {
    const FortnightView = ((props) => (
      <CustomWeekView
        {...props}
        isLocked={isLocked}
        activePeriod={activePeriod}
        periodStartDate={activePeriod?.startdate}
        periodEndDate={activePeriod?.enddate}
        nextWindowStart={nextWindowStart}
        nextWindowEnd={nextWindowEnd}
      />
    )) as typeof CustomWeekView
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
  }, [activePeriod, isLocked, nextWindowEnd, nextWindowStart])

  const periodStatus = useMemo(() => {
    if (!activePeriod) return undefined
    if (upcomingPeriodId && activePeriod.periodid === upcomingPeriodId) {
      return "Upcoming"
    }

    const today = moment().startOf("day")
    const start = moment(activePeriod.startdate).startOf("day")
    const end = moment(activePeriod.enddate).startOf("day")

    if (today.isBefore(start)) return "Future"
    if (today.isAfter(end)) return "Past"
    return "Current"
  }, [activePeriod, upcomingPeriodId])

  const onNavigate = useCallback(
    (newDate: Date) => {
      setDate(newDate)
      const navigatedPeriod =
        periods.find((period) =>
          moment(newDate).isBetween(
            moment(period.startdate),
            moment(period.enddate),
            "day",
            "[]",
          ),
        ) ?? null

      onDisplayedPeriodChange?.(navigatedPeriod)
    },
    [onDisplayedPeriodChange, periods],
  )

  const components = useMemo(
    () => ({
      toolbar: (toolbarProps: ToolbarProps) => (
        <CustomToolbar {...toolbarProps} periodStatus={periodStatus} />
      ),
    }),
    [periodStatus],
  )

  return (
    <VStack h="100%" w="100%" gap={0} align="stretch">
      <Box
        h="100%"
        position="relative"
        borderWidth="1px"
        p={3}
        borderColor="border"
        borderRadius={10}
        overflow="hidden"
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
    </VStack>
  )
}
