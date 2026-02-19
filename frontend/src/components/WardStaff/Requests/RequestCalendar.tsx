import { Navigate,Calendar, momentLocalizer, View,ToolbarProps } from 'react-big-calendar'
import moment from 'moment'
import { useState, useCallback, useMemo, useEffect, ComponentType } from 'react'
import { useQuery } from '@tanstack/react-query'
import CustomWeekView from './CustomRequestView'
import { Box,Grid,Span } from '@chakra-ui/react'
import cx from "clsx"
import { ShiftRequestsService } from '@/client'
import useAuth from '@/hooks/useAuth'

const localizer = momentLocalizer(moment);


interface Event {
  title: string,
  start: Date,
  end: Date,
  allDay?: boolean
  resource?: any,
}
export const CustomToolbar: ComponentType<ToolbarProps> = ({
  date,
  label,
  localizer,
  onNavigate,
  onView,
  view,
  views,
}: ToolbarProps) => {
  return (
    <Grid templateColumns={{base: "1fr", md:"repeat(3, 1fr)"}} className={ cx("rbc-toolbar") } gap={{base:"2", md:"0"}} position={{base:"sticky", md:"relative"}}>
      <Span className={ cx("rbc-btn-group") } justifySelf={{base:"center",md:"start"}}>
        <button onClick={ () => onNavigate(Navigate.PREVIOUS) }>{ localizer.messages.previous }</button>
      </Span>

      <Span className={ cx("rbc-toolbar-label")}>{ label }</Span>
      <Span justifySelf={{base:"center",md:"end"}} className={ cx("rbc-btn-group") }>
        <button onClick={ () => onNavigate(Navigate.NEXT) }>{ localizer.messages.next }</button>
      </Span>
    </Grid>
  )
}

interface RequestCalendarProps {
  wardId: number | null | undefined;
}

export default function RequestCalendar({ wardId }: RequestCalendarProps) {
  const { user } = useAuth();
  const currentNurseId = user?.nurseid;

  const { data: periods } = useQuery({
    queryKey: ['roster-periods'],
    queryFn: () => ShiftRequestsService.getRosterPeriods(),
    enabled: !!wardId,
  });

  const activePeriod = useMemo(
    () => periods?.find((p) => p.status === 'RequestOpen'),
    [periods],
  );

  const [date, setDate] = useState(() =>
    moment().startOf('isoWeek').toDate()
    );

  useEffect(() => {
    if (activePeriod?.startdate) {
      setDate(moment(activePeriod.startdate).startOf('isoWeek').toDate());
    }
  }, [activePeriod?.startdate]);

  const onNavigate = useCallback((newDate: Date) => setDate(newDate), []);

  const periodId = activePeriod?.periodid;

  const { data: shiftRequests } = useQuery({
    queryKey: ['shift-requests', 'ward', wardId, periodId],
    queryFn: () => ShiftRequestsService.getShiftRequestsByWard({
      wardId: wardId!,
      periodId: periodId,
    }),
    enabled: !!wardId && !!periodId,
  });

  const { data: wardNurses } = useQuery({
    queryKey: ['ward-nurses', wardId],
    queryFn: () => ShiftRequestsService.getWardNurses({ wardId: wardId! }),
    enabled: !!wardId,
  });

  const nurseMap = useMemo(() => {
    if (!wardNurses) return new Map<number, string>();
    return new Map(wardNurses.map((n) => [n.nurseid, n.name]));
  }, [wardNurses]);

  const events: Event[] = useMemo(() => {
    if (!shiftRequests) return [];
    return shiftRequests.map((sr) => ({
      title: sr.preferredshifttype,
      start: new Date(sr.preferreddate),
      end: new Date(sr.preferreddate),
      resource: {
        nurseName: nurseMap.get(sr.nurseid) ?? `Nurse ${sr.nurseid}`,
        isOwn: sr.nurseid === currentNurseId,
        requestId: sr.requestid,
        preferredDate: sr.preferreddate,
        shiftType: sr.preferredshifttype,
      },
    }));
  }, [shiftRequests, nurseMap, currentNurseId]);

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
    <Box h="100%"  borderWidth={"1px"} p={3} borderColor={"border"} borderRadius={10}>
      <Calendar
        localizer={localizer}
        startAccessor="start"
        endAccessor="end"
        events={events}
        components={{
          toolbar: CustomToolbar
        }}
        view={defaultView}
        views={views}
        date={date}
        showAllEvents
        onNavigate={onNavigate}
      />
    </Box>
  )
}
