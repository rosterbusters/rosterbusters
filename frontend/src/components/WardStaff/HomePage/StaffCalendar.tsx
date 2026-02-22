import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar'
import moment from 'moment'
import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { shiftCollection } from '@/models/Shift'
import { SHIFT_COLOR_MAP } from '@/components/NurseManager/RosterTable/types'
import { ShiftRequestsService } from '@/client'

const localizer = momentLocalizer(moment);
const API_BASE = import.meta.env.VITE_API_URL || "";

// Fallback shift times used only in generateMonthShifts (hardcoded demo data)
const FALLBACK_SHIFT_TIMES: Record<string, { startH: number; startM: number; endH: number; endM: number }> = {
  A: { startH: 7, startM: 0, endH: 15, endM: 30 },
  P: { startH: 13, startM: 0, endH: 21, endM: 30 },
  N: { startH: 20, startM: 30, endH: 7, endM: 30 },
  D: { startH: 7, startM: 0, endH: 19, endM: 0 },
  DO: { startH: 0, startM: 0, endH: 23, endM: 59 },
  AL: { startH: 0, startM: 0, endH: 23, endM: 59 },
};

interface ShiftEvent {
  start: Date;
  end: Date;
  title: string;
  shiftCode: string;
}

// Fallback: Generate hardcoded shifts if API fails (remove in production)
function generateMonthShifts(year: number, month: number): ShiftEvent[] {
  const shiftItems = shiftCollection.items.filter(
    (s) => FALLBACK_SHIFT_TIMES[s.value]
  );
  const start = moment().year(year).month(month - 1).startOf("month");
  const end = moment().year(year).month(month - 1).endOf("month");
  const events: ShiftEvent[] = [];

  for (let day = start.clone(); day.isSameOrBefore(end, "day"); day.add(1, "day")) {
    const shift = shiftItems[day.date() % shiftItems.length];
    const times = FALLBACK_SHIFT_TIMES[shift.value];

    events.push({
      start: day.clone().hour(times.startH).minute(times.startM).toDate(),
      end: day.clone().hour(Math.max(times.endH, times.startH)).minute(times.endM).toDate(),
      title: `${shift.label}: ${shift.description}`,
      shiftCode: shift.value,
    });
  }

  return events;
}

// Fetch shifts from API
async function fetchMyShifts() {
  const token = localStorage.getItem("access_token");
  const response = await fetch(
    `${API_BASE}/api/v1/shift-requests/`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json() as Promise<{ requestid: number; preferreddate: string; preferredshifttype: string; status: string }[]>;
}

export default function StaffCalendar() {
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());

  // Fetch all shift requests for the current user
  const { data: shiftsData, isLoading, isError } = useQuery({
    queryKey: ['my-shifts'],
    queryFn: fetchMyShifts,
    retry: 1,
  });

  // Fetch all shift codes from the backend for label/description lookup
  const { data: shiftCodes } = useQuery({
    queryKey: ['shift-codes-all'],
    queryFn: () => ShiftRequestsService.getAllShiftCodes(),
  });

  const shiftLabelMap = useMemo(
    () => Object.fromEntries(
      (shiftCodes ?? []).map((sc) => [sc.shiftcode, sc.description])
    ) as Record<string, string>,
    [shiftCodes]
  );

  const shiftTimesMap = useMemo(() => {
    const parseTime = (t: string | null | undefined): { h: number; m: number } | null => {
      if (!t) return null;
      const [h, m] = t.split(':').map(Number);
      return { h, m };
    };
    return Object.fromEntries(
      (shiftCodes ?? []).map((sc) => [
        sc.shiftcode,
        { start: parseTime(sc.defaultstart), end: parseTime(sc.defaultend) },
      ])
    ) as Record<string, { start: { h: number; m: number } | null; end: { h: number; m: number } | null }>;
  }, [shiftCodes]);

  // Transform API data to calendar events, filtered to the visible month
  const events = useMemo((): ShiftEvent[] => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    if (isError || !shiftsData || shiftsData.length === 0) {
      console.log('Using fallback data for calendar');
      return generateMonthShifts(year, month);
    }

    return shiftsData
      .filter((shift) => {
        const d = moment(shift.preferreddate);
        return d.year() === year && d.month() + 1 === month;
      })
      .map((shift) => {
        const times = shiftTimesMap[shift.preferredshifttype];
        const startHM = times?.start ?? { h: 0, m: 0 };
        const endHM = times?.end ?? { h: 0, m: 0 };
        const shiftDate = moment(shift.preferreddate);
        const description = shiftLabelMap[shift.preferredshifttype] ?? '';

        return {
          start: shiftDate.clone().hour(startHM.h).minute(startHM.m).toDate(),
          end: shiftDate.clone().hour(Math.max(endHM.h, startHM.h)).minute(endHM.m).toDate(),
          title: description ? `${shift.preferredshifttype}: ${description}` : shift.preferredshifttype,
          shiftCode: shift.preferredshifttype,
        };
      });
  }, [shiftsData, isError, date, shiftLabelMap, shiftTimesMap]);

  const onNavigate = useCallback((newDate: Date) => setDate(newDate), []);
  const onView = useCallback((newView: View) => setView(newView), []);

  const eventPropGetter = useCallback((event: ShiftEvent) => {
    const color = SHIFT_COLOR_MAP[event.shiftCode as keyof typeof SHIFT_COLOR_MAP] || '#a3a3a3';
    return {
      style: {
        backgroundColor: color,
        borderRadius: '6px',
        border: 'none',
        color: 'white',
        fontWeight: 600,
        fontSize: '12px',
        letterSpacing: '0.02em',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        padding: '2px 6px',
      },
    };
  }, []);

  if (isLoading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading your shifts...</p>
      </div>
    );
  }

  return (
    <div style={{ height: '100%' }}>
      {isError && (
        <div style={{ padding: '8px', backgroundColor: '#fff3cd', borderBottom: '1px solid #ffc107', fontSize: '14px' }}>
          ⚠️ Unable to load shifts from server. Showing sample data.
        </div>
      )}
      <Calendar
        localizer={localizer}
        startAccessor="start"
        endAccessor="end"
        events={events}
        view={view}
        date={date}
        onNavigate={onNavigate}
        onView={onView}
        eventPropGetter={eventPropGetter}
      />
    </div>
  )
}
