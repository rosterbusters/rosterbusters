import { useMemo, type JSX, useState } from "react";
import { Navigate, DateLocalizer } from "react-big-calendar";
import { Grid, GridItem, VStack, Box } from "@chakra-ui/react";
import { Event } from "@/models/Event";
import { CalendarRequestBlock } from "@/components/Common/CalendarRequestBlock";
import { NewLeaveRequest } from "./NewLeaveRequest";
import { EditLeaveRequest } from "./EditLeaveRequest";
import useAuth from "@/hooks/useAuth";
import moment from "moment";

interface CustomMonthViewProps {
  date: Date;
  localizer: DateLocalizer;
  events: Event[];
  [key: string]: unknown;
}

interface CustomMonthViewComponent {
  (props: CustomMonthViewProps): JSX.Element;
  range: (date: Date, options: { localizer: DateLocalizer }) => Date[];
  navigate: (
    date: Date,
    action:
      | typeof Navigate.PREVIOUS
      | typeof Navigate.NEXT
      | typeof Navigate.DATE,
    options: { localizer: DateLocalizer },
  ) => Date;
  title: (date: Date, options: { localizer: DateLocalizer }) => string;
}

function getEventsForDay(day: Date, events: Event[]): Event[] {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  return events.filter((ev) => {
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return dayStart >= start && dayStart <= end;
  });
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CustomMonthView: CustomMonthViewComponent = function CustomMonthView({
  date,
  localizer,
  events,
}: CustomMonthViewProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<{
    requestId: number;
    shiftType: string;
    preferredDate: string;
  } | null>(null);

  const currRange = useMemo(
    () => CustomMonthView.range(date, { localizer }),
    [date, localizer],
  );

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < currRange.length; i += 7) {
      result.push(currRange.slice(i, i + 7));
    }
    return result;
  }, [currRange]);

  const currentMonth = moment(date).month();

  const handleDayClicked = (day: Date) => {
    setSelectedDay(day);
    setIsOpen(true);
  };

  return (
    <>
      <VStack overflowX="auto" gap={0} alignItems="stretch">
        <Grid
          width="full"
          minW="820px"
          templateColumns="repeat(7, 1fr)"
          borderColor="border"
          borderWidth="1px"
        >
          {DAY_HEADERS.map((day) => (
            <GridItem
              key={day}
              bg="white"
              color="#404040"
              p={2}
              h="32px"
              fontWeight="medium"
            >
              {day}
            </GridItem>
          ))}
        </Grid>

        {weeks.map((week, wi) => (
          <Grid
            key={wi}
            width="full"
            minW="820px"
            templateColumns="repeat(7, 1fr)"
          >
            {week.map((day, di) => {
              const eventsForDay = getEventsForDay(day, events);
              const isCurrentMonth = moment(day).month() === currentMonth;
              const isToday = moment(day).isSame(moment(), "day");

              return (
                <GridItem
                  key={di}
                  bg={isToday ? "menuactive" : "white"}
                  textAlign="start"
                  color={isCurrentMonth ? "foreground" : "gray.400"}
                  p={2}
                  minH="120px"
                  onClick={() => handleDayClicked(day)}
                  cursor="pointer"
                  borderColor="border"
                  borderWidth="1px"
                >
                  {localizer.format(day, "D")}
                  <Box mt={2}>
                    {eventsForDay.length > 0 &&
                      [...eventsForDay]
                        .sort(
                          (a, b) =>
                            (b.resource?.isOwn ? 1 : 0) -
                            (a.resource?.isOwn ? 1 : 0),
                        )
                        .map((ev, idx) => (
                          <Box key={idx} pb={2} maxW="100%">
                            <CalendarRequestBlock
                              shift={ev.title}
                              nurseName={ev.resource?.nurseName}
                              owned={ev.resource?.isOwn}
                              onClick={
                                ev.resource?.isOwn
                                  ? () =>
                                      setSelectedRequest({
                                        requestId: ev.resource.requestId,
                                        shiftType: ev.resource.shiftType,
                                        preferredDate: ev.resource.preferredDate,
                                      })
                                  : undefined
                              }
                            />
                          </Box>
                        ))}
                  </Box>
                </GridItem>
              );
            })}
          </Grid>
        ))}
      </VStack>

      <NewLeaveRequest
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        selectedDate={selectedDay}
        wardId={(user as any)?.wardid}
      />

      {selectedRequest && (
        <EditLeaveRequest
          isOpen={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          requestId={selectedRequest.requestId}
          initialShiftType={selectedRequest.shiftType}
          initialDate={selectedRequest.preferredDate}
        />
      )}
    </>
  );
};

CustomMonthView.range = (
  date: Date,
  { localizer }: { localizer: DateLocalizer },
): Date[] => {
  const start = moment(date).startOf("month").startOf("week").toDate();
  const end = moment(date).endOf("month").endOf("week").toDate();
  const range: Date[] = [];
  let current = start;
  while (localizer.lte(current, end, "day")) {
    range.push(current);
    current = localizer.add(current, 1, "day");
  }
  return range;
};

CustomMonthView.navigate = (
  date: Date,
  action:
    | typeof Navigate.PREVIOUS
    | typeof Navigate.NEXT
    | typeof Navigate.DATE,
): Date => {
  switch (action) {
    case Navigate.PREVIOUS:
      return moment(date).subtract(1, "month").toDate();
    case Navigate.NEXT:
      return moment(date).add(1, "month").toDate();
    default:
      return date;
  }
};

CustomMonthView.title = (date: Date): string => {
  return moment(date).format("MMMM YYYY");
};

export default CustomMonthView;
