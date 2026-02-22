import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar'
import moment from 'moment'
import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SHIFT_COLOR_MAP } from '@/components/NurseManager/RosterTable/types'
import { HomeService } from '@/client'

const localizer = momentLocalizer(moment);

interface ShiftEvent {
  start: Date;
  end: Date;
  title: string;
  shiftCode: string;
}

export default function StaffCalendar() {
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());

  const { data: shiftsData, isLoading } = useQuery({
    queryKey: ['my-roster-shifts'],
    queryFn: () => HomeService.getMyShifts(),
  });

  const events = useMemo((): ShiftEvent[] => {
    if (!shiftsData) return [];

    return shiftsData.map((shift) => {
      const shiftDate = moment(shift.shiftdate);
      const parseHM = (t: string | null) => {
        if (!t) return { h: 0, m: 0 };
        const [h, m] = t.split(':').map(Number);
        return { h, m };
      };
      const startHM = parseHM(shift.starttime);
      const endHM = parseHM(shift.endtime);

      return {
        start: shiftDate.clone().hour(startHM.h).minute(startHM.m).toDate(),
        end: shiftDate.clone().hour(Math.max(endHM.h, startHM.h)).minute(endHM.m).toDate(),
        title: shift.description ? `${shift.shiftcode}: ${shift.description}` : shift.shiftcode,
        shiftCode: shift.shiftcode,
      };
    });
  }, [shiftsData]);

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
