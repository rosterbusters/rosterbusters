import { useMemo, type JSX, useState } from "react";
import { Navigate, DateLocalizer } from "react-big-calendar";
import { Grid, GridItem, VStack, Box } from "@chakra-ui/react";
import { Event } from "@/models/Event";
import { CalendarRequestBlock } from "@/components/Common/CalendarRequestBlock";
import { ReviewShiftRequest } from "./ReviewShiftRequest";
import { NewShiftRequest } from "./NewShiftRequest";
import moment from "moment";

interface CustomWeekViewProps {
  date: Date;
  localizer: DateLocalizer;
  events: Event[];
  wardId?: number | null;

  [key: string]: unknown;
}

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

function groupByShift(events: Event[]): Map<string, Event[]> {
  const grouped = new Map<string, Event[]>();
  events.forEach((event) => {
    const key = event.resource?.shiftType ?? event.title;
    const existing = grouped.get(key) ?? [];
    existing.push(event);
    grouped.set(key, existing);
  });
  return grouped;
}

const CustomWeekView: CustomWeekViewComponent = function CustomWeekView({
  date,
  localizer,
  events,
  wardId,
}: CustomWeekViewProps) {
  const [selectedRequest, setSelectedRequest] = useState<{
    requestId: number;
    shiftCode: string;
    date: string;
    nurseName: string;
    status: string;
    comment?: string | null;
    requests?: Array<{
      requestId: number;
      nurseName: string;
      shiftCode: string;
      date: string;
      status: string;
      comment?: string | null;
    }>;
  } | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const currRange = useMemo(
    () => CustomWeekView.range(date, { localizer }),
    [date, localizer],
  );

  return (
    <>
      <VStack overflowX={"auto"} gap={0} alignItems="stretch">
        <Grid
          width={"full"}
          minW={"820px"}
          templateColumns="repeat(7, 1fr)"
          borderColor="border"
          borderWidth={"1px"}
        >
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

        <Grid
          width={"full"}
          minW={"820px"}
          templateColumns="repeat(7, 1fr)"
          templateRows="repeat(2, 1fr)"
        >
          {currRange.map((day, i) => {
            const eventsForDay = getEventsForDay(day, events);
            const groupedEvents = groupByShift(eventsForDay);
            const isPastDate = moment(day).startOf("day").isBefore(moment().startOf("day"));

            return (
              <GridItem
                key={i}
                bg={isPastDate ? "gray.100" : "white"}
                textAlign={"start"}
                color={isPastDate ? "gray.500" : "foreground"}
                p={2}
                minH="250px"
                borderColor="border"
                borderWidth="1px"
                bgColor={
                  moment(day).isSame(moment(), "day") ? "menuactive" : isPastDate ? "gray.100" : "white"
                }
                onClick={() => {
                  if (isPastDate) return;
                  setSelectedDay(day);
                }}
                cursor={isPastDate ? "default" : "pointer"}
                opacity={isPastDate ? 0.7 : 1}
              >
                {localizer.format(day, "D")}
                <Box mt={2}>
                  {Array.from(groupedEvents.entries())
                    .sort(([, a], [, b]) => {
                      const aOwn = a.some((event) => event.resource?.isOwn);
                      const bOwn = b.some((event) => event.resource?.isOwn);
                      return (bOwn ? 1 : 0) - (aOwn ? 1 : 0);
                    })
                    .map(([shiftCode, shiftEvents], idx) => {
                      const primaryEvent = shiftEvents[0];
                      const nurseNames = shiftEvents
                        .map((event) => event.resource?.nurseName ?? "")
                        .filter(Boolean)
                        .join(", ");
                      const isOwn = shiftEvents.some((event) => event.resource?.isOwn);

                      return (
                      <Box
                        key={`${shiftCode}-${idx}`}
                        pb={2}
                        maxW="100%"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <CalendarRequestBlock
                          shift={shiftCode}
                          nurseName={nurseNames}
                          owned={isOwn}
                          onClick={() =>
                            setSelectedRequest({
                              requestId: primaryEvent?.resource?.requestId,
                              shiftCode,
                              date: primaryEvent?.resource?.preferredDate ?? "",
                              nurseName: nurseNames,
                              status: primaryEvent?.resource?.status ?? "Pending",
                              comment: primaryEvent?.resource?.reason ?? null,
                              requests: shiftEvents.map((event) => ({
                                requestId: event.resource?.requestId,
                                nurseName: event.resource?.nurseName ?? "",
                                shiftCode: event.resource?.shiftType ?? shiftCode,
                                date: event.resource?.preferredDate ?? "",
                                status: event.resource?.status ?? "Pending",
                                comment: event.resource?.reason ?? null,
                              })),
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
      </VStack>

      {selectedRequest && (
        <ReviewShiftRequest
          isOpen={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          requestId={selectedRequest.requestId}
          shiftCode={selectedRequest.shiftCode}
          date={selectedRequest.date}
          nurseName={selectedRequest.nurseName}
          status={selectedRequest.status}
          comment={selectedRequest.comment}
          wardId={wardId}
          requests={selectedRequest.requests}
        />
      )}

      <NewShiftRequest
        isOpen={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        selectedDate={selectedDay}
        wardId={wardId}
      />
    </>
  );
};

CustomWeekView.range = (
  date: Date,
  { localizer }: { localizer: DateLocalizer },
): Date[] => {
  const start = date;
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
