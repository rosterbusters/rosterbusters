import { Navigate,Calendar, momentLocalizer, View,ToolbarProps } from 'react-big-calendar'
import moment from 'moment'
import { useState, useCallback, useMemo, ComponentType } from 'react'
import CustomWeekView from './CustomRequestView'
import { Box,Grid } from '@chakra-ui/react'
import cx from "clsx"

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
    <Grid templateColumns={"repeat(3, 1fr)"} className={ cx("rbc-toolbar") }>
      <span className={ cx("rbc-btn-group") } style={{ justifySelf: 'start' }}>
        <button onClick={ () => onNavigate(Navigate.PREVIOUS) }>{ localizer.messages.previous }</button>
      </span>

      <span className={ cx("rbc-toolbar-label")}>{ label }</span>
 <span className={ cx("rbc-btn-group") } style={{ justifySelf: 'end' }}>
        <button onClick={ () => onNavigate(Navigate.NEXT) }>{ localizer.messages.next }</button>
      </span>
    </Grid>
  )
}
const events = [
  {
    start: moment().hour(10).minute(0).toDate(),
    end: moment().hour(11).minute(0).toDate(),
    title: "A",
  },
  {
    start: moment().hour(14).minute(0).toDate(),
    end: moment().hour(15).minute(30).toDate(),
    title: "N",
  },
  {
    start: moment().hour(14).minute(0).toDate(),
    end: moment().hour(15).minute(30).toDate(),
    title: "P",
  },
  {
    start: moment().hour(14).minute(0).toDate(),
    end: moment().hour(15).minute(30).toDate(),
    title: "AL",
  },
  {
    start: moment().subtract(1,"day").hour(14).minute(0).toDate(),
    end: moment().subtract(1,"day").hour(15).minute(30).toDate(),
    title: "D",
  },
  {
    start: moment().add(2,"day").hour(14).minute(0).toDate(),
    end: moment().add(2,"day").hour(15).minute(30).toDate(),
    title: "DO",
  },
  
];


export default function RequestCalendar() {
  const [date, setDate] = useState(() =>
    moment().startOf('week').add(1, 'day').toDate()
    );

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
