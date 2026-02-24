import { Navigate, Calendar, momentLocalizer, View, ToolbarProps } from 'react-big-calendar'
import moment from 'moment'
import { useState, useCallback, useMemo, useEffect, ComponentType } from 'react'
import { useQuery } from '@tanstack/react-query'
import CustomMonthView from './CustomLeaveView'
import { Box, Grid, HStack, Span } from '@chakra-ui/react'
import cx from 'clsx'
import { ShiftRequestsService } from '@/client'
import useAuth from '@/hooks/useAuth'

const localizer = momentLocalizer(moment);

const MONTHS = moment.months();

const selectStyle: React.CSSProperties = {
  color: '#373a3c',
  background: 'none',
  border: '1px solid #ccc',
  padding: '0.375em 0.6em',
  borderRadius: '4px',
  lineHeight: 'normal',
  cursor: 'pointer',
  fontSize: 'inherit',
};

const LeaveToolbar: ComponentType<ToolbarProps> = ({ date, localizer, onNavigate }) => {
  const currentMonth = moment(date).month();
  const currentYear = moment(date).year();
  const thisYear = moment().year();
  const years = Array.from({ length: 4 }, (_, i) => thisYear - 2 + i);

  return (
    <Grid
      templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }}
      className={cx('rbc-toolbar')}
      gap={{ base: '2', md: '0' }}
      position={{ base: 'sticky', md: 'relative' }}
    >
      <Span className={cx('rbc-btn-group')} justifySelf={{ base: 'center', md: 'start' }}>
        <button onClick={() => onNavigate(Navigate.PREVIOUS)}>
          {localizer.messages.previous}
        </button>
      </Span>
      <HStack justifySelf="center" gap={1}>
        <select
          value={currentMonth}
          style={selectStyle}
          onChange={(e) =>
            onNavigate(Navigate.DATE, moment(date).month(parseInt(e.target.value)).toDate())
          }
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i}>{m}</option>
          ))}
        </select>
        <select
          value={currentYear}
          style={selectStyle}
          onChange={(e) =>
            onNavigate(Navigate.DATE, moment(date).year(parseInt(e.target.value)).toDate())
          }
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </HStack>
      <Span justifySelf={{ base: 'center', md: 'end' }} className={cx('rbc-btn-group')}>
        <button onClick={() => onNavigate(Navigate.NEXT)}>
          {localizer.messages.next}
        </button>
      </Span>
    </Grid>
  );
};

interface Event {
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource?: any;
}

interface LeaveRequestCalendarProps {
  wardId: number | null | undefined;
}

export default function LeaveRequestCalendar({ wardId }: LeaveRequestCalendarProps) {
  const { user } = useAuth();
  const currentNurseId = user?.nurseid;

  // ─── Leave codes ──────────────────────────────────────────────────────────
  const { data: leaveCodes } = useQuery({
    queryKey: ['leave-codes'],
    queryFn: () => ShiftRequestsService.getLeaveCodes(),
    staleTime: 5 * 60 * 1000,
  });

  const leaveCodeSet = useMemo(() => {
    if (!leaveCodes) return new Set<string>();
    return new Set(leaveCodes.map((lc) => lc.shiftcode));
  }, [leaveCodes]);

  // ─── Roster periods ───────────────────────────────────────────────────────
  const { data: periods } = useQuery({
    queryKey: ['roster-periods'],
    queryFn: () => ShiftRequestsService.getRosterPeriods(),
    staleTime: 5 * 60 * 1000,
  });

  const activePeriod = useMemo(() => {
    if (!periods) return undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (
      periods.find(
        (p) =>
          p.status === 'RequestOpen' &&
          new Date(p.startdate) <= today &&
          new Date(p.enddate) >= today,
      ) ?? periods.find((p) => p.status === 'RequestOpen')
    );
  }, [periods]);

  // ─── Calendar navigation (month view) ────────────────────────────────────
  const [date, setDate] = useState(() => moment().startOf('month').toDate());

  useEffect(() => {
    if (activePeriod?.startdate) {
      setDate(moment(activePeriod.startdate).startOf('month').toDate());
    }
  }, [activePeriod?.startdate]);

  const onNavigate = useCallback((newDate: Date) => setDate(newDate), []);

  const periodId = activePeriod?.periodid;

  // ─── Shift requests for ward (filtered to leave types) ───────────────────
  const { data: shiftRequests } = useQuery({
    queryKey: ['shift-requests', 'ward', wardId, periodId],
    queryFn: () =>
      ShiftRequestsService.getShiftRequestsByWard({
        wardId: wardId!,
        periodId: periodId,
      }),
    enabled: !!wardId && !!periodId,
    staleTime: 0,
  });

  // ─── Ward nurses (for name lookup) ───────────────────────────────────────
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

  // ─── Map leave requests → calendar events ─────────────────────────────────
  const events: Event[] = useMemo(() => {
    if (!shiftRequests) return [];
    return shiftRequests
      .filter((sr) => leaveCodeSet.size === 0 || leaveCodeSet.has(sr.preferredshifttype))
      .map((sr) => ({
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
  }, [shiftRequests, nurseMap, currentNurseId, leaveCodeSet]);

  // ─── Calendar view setup ──────────────────────────────────────────────────
  const { views, defaultView } = useMemo(() => {
    return {
      views: { month: CustomMonthView, week: false, day: false } as any,
      defaultView: 'month' as View,
    };
  }, []);

  return (
    <Box h="100%" borderWidth="1px" p={3} borderColor="border" borderRadius={10}>
      <Calendar
        localizer={localizer}
        startAccessor="start"
        endAccessor="end"
        events={events}
        components={{ toolbar: LeaveToolbar }}
        view={defaultView}
        views={views}
        date={date}
        showAllEvents
        onNavigate={onNavigate}
      />
    </Box>
  );
}
