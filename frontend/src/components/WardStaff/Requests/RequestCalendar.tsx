import { Calendar, momentLocalizer, View } from 'react-big-calendar'
import moment from 'moment'
import { useState, useCallback, useMemo } from 'react'
import CustomWeekView from './CustomRequestView'
import { Box } from '@chakra-ui/react'

const localizer = momentLocalizer(moment);

interface Event {
  title: string,
  start: Date,
  end: Date,
  allDay?: boolean
  resource?: any,
}

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


export default function RequestCalendar() {
  const [date, setDate] = useState(new Date());

  const onNavigate = useCallback((newDate: Date) => setDate(newDate), []);

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
    <Box h="100%" w="100%" borderWidth={"1px"} p={3} borderColor={"border"} borderRadius={10}>
      <Calendar
        localizer={localizer}
        startAccessor="start"
        endAccessor="end"
        events={events}
        view={defaultView}
        views={views}
        date={date}
        onNavigate={onNavigate}
      />
    </Box>
  )
}
