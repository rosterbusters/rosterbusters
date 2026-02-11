import { useMemo, type JSX } from "react";
import { Navigate, DateLocalizer } from "react-big-calendar";
import { Grid, GridItem, VStack, Box } from "@chakra-ui/react";
import { Event } from "@/models/Event";
import { CalendarRequestBlock } from "@/components/Common/CalendarRequestBlock";
interface CustomWeekViewProps {
  date: Date;
  localizer: DateLocalizer;
  events: Event[];

  [key: string]: unknown;
}
import moment from "moment";

interface CustomWeekViewComponent {
  (props: CustomWeekViewProps): JSX.Element;
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

export function getEventsForDay(day: Date, events: Event[]): Event[] {
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

const CustomWeekView: CustomWeekViewComponent = function CustomWeekView({
  date,
  localizer,
  events,
  startAccessor,
  endAccessor,
}: CustomWeekViewProps) {
  const currRange = useMemo(
    () => CustomWeekView.range(date, { localizer }),
    [date, localizer],
  );

  return (
    <>
      <VStack overflowX={"auto"} gap={0} alignItems="stretch" >
        <Grid width={"full"} minW={"820px"} templateColumns="repeat(7, 1fr)" borderColor="border" borderWidth={"1px"}>
          {currRange.slice(0, 7).map((day, i) => (
            <GridItem
              key={i}
              bg="white"
              color="#404040"
              p={2}

              h="32px"
              fontWeight="medium"
            >
              {localizer.format(day, "ddd")}
            </GridItem>
          ))}
        </Grid>

        <Grid width={"full"} minW={"820px"} templateColumns="repeat(7, 1fr)" templateRows="repeat(2, 1fr)">
          {currRange.map((day, i) => {
            const eventsForDay = getEventsForDay(day, events);

            return (

              <GridItem

                key={i}
                bg="white"
                textAlign={"start"}
                color="foreground"
                p={2}
                minH="250px"
                borderColor="border"
                borderWidth="1px"
                bgColor={moment(day).isSame(moment(), 'day') ? "menuactive" : "white"}
              >
                {localizer.format(day, "D")}
                <Box mt={2}>
                  {eventsForDay.length > 0 &&
                    eventsForDay.map((ev, idx) => (
                      <Box key={idx} pb={2} maxW="100%">
                        <CalendarRequestBlock shift={ev.title}/>
                      </Box>
                    ))
                  }
                </Box>
              </GridItem>
            );
          })}
        </Grid>
      </VStack>
    </>
  )
}

CustomWeekView.range = (
  date: Date,
  { localizer }: { localizer: DateLocalizer },
): Date[] => {
  const start = date; //need to change this date to shift request opening
  const end = localizer.add(start, 13, "day");

  let current = start;
  const range: Date[] = [];

  while (localizer.lte(current, end, "day")) {
    range.push(current);
    current = localizer.add(current, 1, "day");
  }

  return range;
};

CustomWeekView.navigate = (
  date: Date,
  action:
    | typeof Navigate.PREVIOUS
    | typeof Navigate.NEXT
    | typeof Navigate.DATE,
  { localizer }: { localizer: DateLocalizer },
): Date => {
  switch (action) {
    case Navigate.PREVIOUS:
      return localizer.add(date, -14, "day");

    case Navigate.NEXT:
      return localizer.add(date, 14, "day");

    default:
      return date;
  }
};

CustomWeekView.title = (
  date: Date,
  { localizer }: { localizer: DateLocalizer },
): string => {
  const range = CustomWeekView.range(date, { localizer });
  const start = range[0];
  const end = range[range.length - 1];
  return localizer.format({ start, end }, "dayRangeHeaderFormat");
};

export default CustomWeekView;
