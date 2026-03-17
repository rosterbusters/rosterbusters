import { Calendar, momentLocalizer, View } from 'react-big-calendar'
import moment from 'moment'
import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import CustomWeekView from './CustomRequestView'
import { Box } from '@chakra-ui/react'
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
 * - Period selection logic is anchored to the upcoming roster period.
 */
export default function RequestCalendar({ wardId }: RequestCalendarProps) {
  const { user } = useAuth();
  const currentNurseId = user?.nurseid;

  // ─── Roster periods ───────────────────────────────────────────────────────
  const { data: periodWindow } = useRosterPeriodWindow();
  const activePeriod = periodWindow?.upcomingPeriod;

  // ─── Calendar anchor ──────────────────────────────────────────────────────
  const [date, setDate] = useState(() => moment().toDate());

  useEffect(() => {
    if (activePeriod?.startDate) {
      setDate(moment(activePeriod.startDate).toDate());
    }
  }, [activePeriod?.startDate]);

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
        toolbar={false}
        view={defaultView}
        views={views}
        date={date}
        showAllEvents
      />
    </Box>
  );
}
