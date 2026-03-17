import { useMemo, type JSX, useState } from "react";
import { Navigate, DateLocalizer } from "react-big-calendar";
import { Grid, GridItem, VStack, Box } from "@chakra-ui/react";
import { Event } from "@/models/Event";
import { CalendarRequestBlock } from "@/components/Common/CalendarRequestBlock";
import { NMReviewLeaveRequest } from "./NMReviewLeaveRequest";
import { NewLeaveRequest } from "@/components/WardStaff/Requests/LeaveRequests/NewLeaveRequest";
import moment from "moment";

interface CustomMonthViewProps {
  date: Date;
  localizer: DateLocalizer;
  events: Event[];
  wardId?: number | null;
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

function groupByLeaveType(events: Event[]) {
  const grouped = new Map<string, Event[]>();
  events.forEach((event) => {
    const key = event.resource?.leaveType ?? event.title;
    const existing = grouped.get(key) ?? [];
    existing.push(event);
    grouped.set(key, existing);
  });
  return grouped;
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CustomMonthView: CustomMonthViewComponent = function CustomMonthView({
  date,
  localizer,
  events,
  wardId,
}: CustomMonthViewProps) {
  const [selectedRequest, setSelectedRequest] = useState<Array<{
    requestId: number;
    nurseName: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    status: string;
  }> | null>(null);
  const [newLeaveDate, setNewLeaveDate] = useState<Date | null>(null);

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
              const grouped = groupByLeaveType(eventsForDay);
              const isCurrentMonth = moment(day).month() === currentMonth;
              const isToday = moment(day).isSame(moment(), "day");
              const isPastDate = moment(day).startOf("day").isBefore(moment().startOf("day"));

              return (
                <GridItem
                  key={di}
                  bg={isToday ? "menuactive" : isPastDate ? "gray.100" : "white"}
                  textAlign="start"
                  color={isPastDate ? "gray.500" : isCurrentMonth ? "foreground" : "gray.400"}
                  p={2}
                  minH="120px"
                  borderColor="border"
                  borderWidth="1px"
                  cursor={isPastDate ? "default" : "pointer"}
                  opacity={isPastDate ? 0.7 : 1}
                  onClick={() => {
                    if (isPastDate) return;
                    setNewLeaveDate(day);
                  }}
                >
                  {localizer.format(day, "D")}
                  <Box mt={2}>
                    {Array.from(grouped.entries())
                      .sort(([, a], [, b]) => {
                        const aOwn = a.some((event) => event.resource?.isOwn);
                        const bOwn = b.some((event) => event.resource?.isOwn);
                        return (bOwn ? 1 : 0) - (aOwn ? 1 : 0);
                      })
                      .map(([leaveType, groupedEvents]) => {
                        const isOwn = groupedEvents.some(
                          (event) => event.resource?.isOwn,
                        );
                        const requests = groupedEvents.flatMap(
                          (event) => event.resource?.requests ?? [],
                        );
                        const nurseNames = requests
                          .map((request) => request.nurseName)
                          .filter(Boolean)
                          .join(", ");

                        return (
                          <Box
                            key={`${moment(day).format("YYYY-MM-DD")}-${leaveType}`}
                            pb={2}
                            maxW="100%"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <CalendarRequestBlock
                              shift={leaveType}
                              nurseName={nurseNames}
                              owned={isOwn}
                              onClick={() => setSelectedRequest(requests)}
                            />
                          </Box>
                        );
                      })}
                  </Box>
                </GridItem>
              );
            })}
          </Grid>
        ))}
      </VStack>

      {selectedRequest && (
        <NMReviewLeaveRequest
          isOpen={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          requestId={selectedRequest[0].requestId}
          leaveType={selectedRequest[0].leaveType}
          startDate={selectedRequest[0].startDate}
          endDate={selectedRequest[0].endDate}
          nurseName={selectedRequest[0].nurseName}
          currentStatus={selectedRequest[0].status}
          requests={selectedRequest}
        />
      )}

      <NewLeaveRequest
        isOpen={!!newLeaveDate}
        onClose={() => setNewLeaveDate(null)}
        selectedDate={newLeaveDate}
        wardId={wardId}
        allowNurseOverride
      />
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
