import { Navigate, Calendar, momentLocalizer, View, ToolbarProps } from 'react-big-calendar'
import moment from 'moment'
import { useState, useCallback, useMemo, useEffect, ComponentType } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import CustomWeekView from './CustomRequestView'
import { Box, Grid, Span } from '@chakra-ui/react'
import cx from "clsx"
import { ShiftRequestsService } from '@/client'
import useAuth from '@/hooks/useAuth'

const localizer = momentLocalizer(moment);

interface Event {
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource?: any;
}

export const CustomToolbar: ComponentType<ToolbarProps> = ({
  date,
  label,
  localizer,
  onNavigate,
}: ToolbarProps) => {
  return (
    <Grid
      templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}
      className={cx("rbc-toolbar")}
      gap={{ base: "2", md: "0" }}
      position={{ base: "sticky", md: "relative" }}
    >
      <Span className={cx("rbc-btn-group")} justifySelf={{ base: "center", md: "start" }}>
        <button onClick={() => onNavigate(Navigate.PREVIOUS)}>
          {localizer.messages.previous}
        </button>
      </Span>
      <Span className={cx("rbc-toolbar-label")}>{label}</Span>
      <Span justifySelf={{ base: "center", md: "end" }} className={cx("rbc-btn-group")}>
        <button onClick={() => onNavigate(Navigate.NEXT)}>
          {localizer.messages.next}
        </button>
      </Span>
    </Grid>
  );
};

interface RequestCalendarProps {
  wardId: number | null | undefined;
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
export default function RequestCalendar({ wardId }: RequestCalendarProps) {
  const { user } = useAuth();
  const currentNurseId = user?.nurseid;

  // ─── Roster periods ───────────────────────────────────────────────────────
  const { data: periods } = useQuery({
    queryKey: ['roster-periods'],
    queryFn: () => ShiftRequestsService.getRosterPeriods(),
    staleTime: 5 * 60 * 1000,
  });

  /**
   * Prefer the period that contains today AND is RequestOpen.
   * Fall back to the first RequestOpen period.
   * This MUST match the logic in NewShiftRequest so created requests
   * appear in the correct period on the calendar.
   */
  const activePeriod = useMemo(() => {
    if (!periods) return undefined;
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return (
      periods.find(
        (p) =>
          p.status === 'RequestOpen' &&
          p.startdate <= todayStr &&
          p.enddate >= todayStr,
      ) ?? periods.find((p) => p.status === 'RequestOpen')
    );
  }, [periods]);

  // ─── Calendar navigation ──────────────────────────────────────────────────
  const [date, setDate] = useState(() => moment().startOf('isoWeek').toDate());

  useEffect(() => {
    if (activePeriod?.startdate) {
      setDate(moment(activePeriod.startdate).startOf('isoWeek').toDate());
    }
  }, [activePeriod?.startdate]);

  const onNavigate = useCallback((newDate: Date) => setDate(newDate), []);

  const periodId = activePeriod?.periodid;

  // ─── Shift requests for entire ward ──────────────────────────────────────
  const { data: shiftRequests } = useQuery({
    queryKey: ['shift-requests', 'ward', wardId, periodId],
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
  });

  // ─── Ward nurses (for name lookup in calendar blocks) ─────────────────────
  const { data: wardNurses } = useQuery({
    queryKey: ['ward-nurses', wardId],
    queryFn: () => ShiftRequestsService.getWardNurses({ wardId: wardId! }),
    enabled: !!wardId,
    staleTime: 5 * 60 * 1000,
  });

  const nurseMap = useMemo(() => {
    if (!wardNurses) return new Map<number, string>();
    return new Map(wardNurses.map((n) => [n.nurseid, n.name]));
  }, [wardNurses]);

  // ─── Map shift requests → calendar events ─────────────────────────────────
  const events: Event[] = useMemo(() => {
    if (!shiftRequests) return [];
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
    }));
  }, [shiftRequests, nurseMap, currentNurseId]);

  // ─── Calendar view setup ──────────────────────────────────────────────────
  const { views, defaultView } = useMemo(() => {
    const customViews = {
      fortnight: CustomWeekView,
      week: false,
      day: false,
    };
    return {
      views: customViews,
      defaultView: "fortnight" as View,
    };
  }, []);

  return (
    <Box h="100%" borderWidth="1px" p={3} borderColor="border" borderRadius={10}>
      <Calendar
        localizer={localizer}
        startAccessor="start"
        endAccessor="end"
        events={events}
        components={{
          toolbar: CustomToolbar,
        }}
        view={defaultView}
        views={views}
        date={date}
        showAllEvents
        onNavigate={onNavigate}
      />
    </Box>
  );
}