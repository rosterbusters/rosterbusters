import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar'
import moment from 'moment'
import { useState, useCallback, useMemo } from 'react'
import { shiftCollection } from '@/models/Shift'
import { SHIFT_COLOR_MAP } from '@/components/NurseManager/RosterTable/types'

const localizer = momentLocalizer(moment);

// Shift time ranges for calendar display
const SHIFT_TIMES: Record<string, { startH: number; startM: number; endH: number; endM: number }> = {
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

// Generate 1 shift per day for the current month
function generateMonthShifts(): ShiftEvent[] {
  const shiftItems = shiftCollection.items.filter(
    (s) => SHIFT_TIMES[s.value]
  );
  const start = moment().startOf("month");
  const end = moment().endOf("month");
  const events: ShiftEvent[] = [];

  for (let day = start.clone(); day.isSameOrBefore(end, "day"); day.add(1, "day")) {
    const shift = shiftItems[day.date() % shiftItems.length];
    const times = SHIFT_TIMES[shift.value];

    events.push({
      start: day.clone().hour(times.startH).minute(times.startM).toDate(),
      end: day.clone().hour(Math.max(times.endH, times.startH)).minute(times.endM).toDate(),
      title: `${shift.label}: ${shift.description}`,
      shiftCode: shift.value,
    });
  }

  return events;
}


export default function StaffCalendar() {
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const events = useMemo(() => generateMonthShifts(), []);

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

  return (
    <div style={{ height: '100%' }}>
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
