import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar'
import moment from 'moment'
import { useState, useCallback } from 'react'

const localizer = momentLocalizer(moment);

const events = [
  {
    start: moment().hour(10).minute(0).toDate(),
    end: moment().hour(11).minute(0).toDate(),
    title: "A: 7:00AM-3:30PM",
  },
  {
    start: moment().hour(14).minute(0).toDate(),
    end: moment().hour(15).minute(30).toDate(),
    title: "N: 8:30PM-7:30AM",
  },
];


export default function StaffCalendar() {
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());

  const onNavigate = useCallback((newDate: Date) => setDate(newDate), []);
  const onView = useCallback((newView: View) => setView(newView), []);

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
      />
    </div>
  )
}
