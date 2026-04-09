import { Calendar, momentLocalizer, View } from "react-big-calendar";
import moment from "moment";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import CustomWeekView from "./CustomRequestView";
import { Box } from "@chakra-ui/react";
import { ShiftRequestsService } from "@/client";
import useAuth from "@/hooks/useAuth";
import { getActiveShiftRequestPeriod } from "./activePeriod";

const localizer = momentLocalizer(moment);

interface Event {
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource?: any;
}

interface RequestCalendarProps {
  wardId: number | null | undefined;
  isLocked?: boolean;
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
  isLocked = false,
}: RequestCalendarProps) {
  const { user } = useAuth();
  const currentNurseId = user?.nurseid;

  const { data: periods } = useQuery({
    queryKey: ["roster-periods"],
    queryFn: () => ShiftRequestsService.getRosterPeriods(),
  });
  const activePeriod = useMemo(() => getActiveShiftRequestPeriod(periods), [periods]);

  const [date, setDate] = useState(() => moment().startOf("isoWeek").toDate());

  useEffect(() => {
    if (activePeriod?.startdate) {
      setDate(moment(activePeriod.startdate).toDate());
    }
  }, [activePeriod?.startdate]);

  const periodId = activePeriod?.periodid;

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
  });

  const { data: wardNurses } = useQuery({
    queryKey: ["ward-nurses", wardId],
    queryFn: () => ShiftRequestsService.getWardNurses({ wardId: wardId! }),
    enabled: !!wardId,
    staleTime: 5 * 60 * 1000,
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

  const { views, defaultView } = useMemo(() => {
    const FortnightView = ((props) => (
      <CustomWeekView {...props} isLocked={isLocked} />
    )) as typeof CustomWeekView;
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
  }, [isLocked]);

  const onNavigate = useCallback((newDate: Date) => setDate(newDate), []);

  return (
    <Box h="100%" borderWidth="1px" p={3} borderColor="border" borderRadius={10}>
      <Calendar
        localizer={localizer}
        startAccessor="start"
        endAccessor="end"
        events={events}
        toolbar={false}
        view={defaultView}
        views={views}
        date={date}
        showAllEvents
        onNavigate={onNavigate}
      />
    </Box>
  );
}
