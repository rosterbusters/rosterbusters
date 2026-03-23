import { useMemo, type JSX, useState } from "react";
import { Navigate, DateLocalizer } from "react-big-calendar";
import { Grid, GridItem, VStack, Box } from "@chakra-ui/react";
import { Event } from "@/models/Event";
import { CalendarRequestBlock } from "@/components/Common/CalendarRequestBlock";
import { NMReviewLeaveRequest } from "./NMReviewLeaveRequest";
import { NewLeaveRequest } from "./NewLeaveRequest";
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

function groupByLeaveType(events: Event[]): Map<string, Event[]> {
  const grouped = new Map<string, Event[]>();
  events.forEach((ev) => {
    const key = ev.resource?.shiftType ?? ev.title;
    const existing = grouped.get(key) ?? [];
    existing.push(ev);
    grouped.set(key, existing);
  });
  return grouped;
}

function rangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  const aStart = new Date(startA);
  const aEnd = new Date(endA);
  const bStart = new Date(startB);
  const bEnd = new Date(endB);
  return aStart <= bEnd && bStart <= aEnd;
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CustomMonthView: CustomMonthViewComponent = function CustomMonthView({
  date,
  localizer,
  events,
  wardId,
}: CustomMonthViewProps) {
  const [selectedRequest, setSelectedRequest] = useState<{
    requestId: number;
    nurseName: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    status: string;
    requests?: Array<{
      requestId: number;
      nurseName: string;
      leaveType: string;
      startDate: string;
      endDate: string;
      status: string;
    }>;
  } | null>(null);
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
                      .map(([leaveType, groupEvents]) => {
                        const isOwn = groupEvents.some((event) => event.resource?.isOwn);
                        const nurseNames = groupEvents
                          .map((event) => event.resource?.nurseName ?? "")
                          .filter(Boolean)
                          .join(", ");
                        const requests = groupEvents.map((event) => ({
                          requestId: event.resource?.requestId,
                          nurseName: event.resource?.nurseName ?? "",
                          leaveType: event.resource?.shiftType ?? leaveType,
                          startDate: event.resource?.startDate ?? "",
                          endDate: event.resource?.endDate ?? "",
                          status: event.resource?.status ?? "Pending",
                        }));
                        const leadRequest = requests[0];

                        if (!leadRequest) {
                          return null;
                        }

                        return (
                          <Box
                            key={leaveType}
                            pb={2}
                            maxW="100%"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <CalendarRequestBlock
                              shift={leaveType}
                              nurseName={nurseNames}
                              owned={isOwn}
                              onClick={() =>
                                setSelectedRequest(() => {
                                  const overlapping = events
                                    .map((event) => ({
                                      requestId: event.resource?.requestId,
                                      nurseName: event.resource?.nurseName ?? "",
                                      leaveType: event.resource?.shiftType ?? event.title ?? "",
                                      startDate: event.resource?.startDate ?? "",
                                      endDate: event.resource?.endDate ?? "",
                                      status: event.resource?.status ?? "Pending",
                                    }))
                                    .filter(
                                      (event) =>
                                        event.requestId != null &&
                                        event.startDate &&
                                        event.endDate &&
                                        event.leaveType === leadRequest.leaveType &&
                                        rangesOverlap(
                                          leadRequest.startDate,
                                          leadRequest.endDate,
                                          event.startDate,
                                          event.endDate,
                                        ),
                                    );

                                  return {
                                    requestId: leadRequest.requestId,
                                    leaveType: leadRequest.leaveType,
                                    startDate: leadRequest.startDate,
                                    endDate: leadRequest.endDate,
                                    nurseName: leadRequest.nurseName,
                                    status: leadRequest.status,
                                    requests: overlapping.length > 0 ? overlapping : requests,
                                  };
                                })
                              }
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
          requestId={selectedRequest.requestId}
          leaveType={selectedRequest.leaveType}
          startDate={selectedRequest.startDate}
          endDate={selectedRequest.endDate}
          nurseName={selectedRequest.nurseName}
          currentStatus={selectedRequest.status}
          requests={selectedRequest.requests}
        />
      )}

      <NewLeaveRequest
        isOpen={!!newLeaveDate}
        onClose={() => setNewLeaveDate(null)}
        selectedDate={newLeaveDate}
        wardId={wardId}
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
