import { Navigate, Calendar, momentLocalizer, View, ToolbarProps } from 'react-big-calendar'
import moment from 'moment'
import { useState, useCallback, useMemo, useEffect, ComponentType } from 'react'
import { useQuery } from '@tanstack/react-query'
import CustomWeekView from './CustomRequestView'
import { Box, Grid, Span } from '@chakra-ui/react'
import cx from "clsx"
import { ShiftRequestsService } from '@/client'
import { useRosterPeriodWindow } from '@/components/NurseManager/RosterTable/useRosterData'
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

  const { data: periodWindow } = useRosterPeriodWindow();
  const activePeriod = periodWindow?.currentPeriod;

  // ─── Calendar navigation ──────────────────────────────────────────────────
  const [date, setDate] = useState(() => moment().startOf('isoWeek').toDate());

  useEffect(() => {
    if (activePeriod?.startDate) {
      setDate(moment(activePeriod.startDate).startOf('isoWeek').toDate());
    }
  }, [activePeriod?.startDate]);

  const onNavigate = useCallback((newDate: Date) => setDate(newDate), []);

  const periodId = activePeriod?.periodId;

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
        status: sr.status,
      },
    }));
  }, [shiftRequests, nurseMap, currentNurseId]);

  // ─── Calendar view setup ──────────────────────────────────────────────────
  const { views, defaultView } = useMemo(() => {
    const FortnightView = (props: Record<string, unknown>) => (
      <CustomWeekView {...props} wardId={wardId} />
    );
    FortnightView.range = CustomWeekView.range;
    FortnightView.navigate = CustomWeekView.navigate;
    FortnightView.title = CustomWeekView.title;
    const customViews = {
      fortnight: FortnightView,
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
