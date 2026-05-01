import { Calendar, momentLocalizer, View } from "react-big-calendar";
import moment from "moment";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import CustomWeekView from "./CustomRequestView";
import { Box, VStack } from "@chakra-ui/react";
import { ShiftRequestsService } from "@/client";
import useAuth from "@/hooks/useAuth";
import { LockdownBanner } from "@/components/Common/LockdownBanner";
import {
  useRequestPeriodWindow,
  getRequestTargetPeriod,
} from "@/hooks/useApplicationLockStatus";

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
  nextWindowStart?: string;
  nextWindowEnd?: string;
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
  isLocked = false,
  nextWindowStart,
  nextWindowEnd,
}: RequestCalendarProps) {
  const { user } = useAuth();
  const currentNurseId = user?.nurseid;

  const { data: periodWindow } = useRequestPeriodWindow();
  const activePeriod = useMemo(
    () => getRequestTargetPeriod(periodWindow),
    [periodWindow],
  );

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
      <CustomWeekView
        {...props}
        isLocked={isLocked}
        periodStartDate={activePeriod?.startdate}
        periodEndDate={activePeriod?.enddate}
      />
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
  }, [activePeriod?.enddate, activePeriod?.startdate, isLocked]);

  const onNavigate = useCallback((newDate: Date) => setDate(newDate), []);

  return (
    <VStack h="100%" w="100%" gap={0} align="stretch">
      {isLocked && (
        <LockdownBanner
          nextWindowStart={nextWindowStart}
          nextWindowEnd={nextWindowEnd}
          title="Shift Request Application Period Closed."
        />
      )}
      <Box
        h="100%"
        position="relative"
        borderWidth="1px"
        p={3}
        borderColor="border"
        borderRadius={10}
        overflow="hidden"
      >
        {isLocked && (
          <Box
            position="absolute"
            inset={0}
            bg="rgba(0, 0, 0, 0.08)"
            zIndex={1}
            pointerEvents="none"
          />
        )}
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
    </VStack>
  );
}
