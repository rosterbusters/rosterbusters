import { useMemo, type JSX, useState } from "react";
import { Navigate, DateLocalizer } from "react-big-calendar";
import { Grid, GridItem, VStack, Box } from "@chakra-ui/react";
import { Event } from "@/models/Event";
import { CalendarRequestBlock } from "@/components/Common/CalendarRequestBlock";
import { EditShiftRequest, type ShiftRequestEntry } from "./EditShiftRequest";
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

/** Group events in a day by shift type, returning one entry per distinct shift. */
function groupByShift(events: Event[]): Map<string, Event[]> {
  const grouped = new Map<string, Event[]>();
  events.forEach((ev) => {
    const key: string = ev.resource?.shiftType ?? ev.title;
    const existing = grouped.get(key) ?? [];
    existing.push(ev);
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
  const [selectedGroup, setSelectedGroup] = useState<ShiftRequestEntry[] | null>(null);
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
            const grouped = groupByShift(eventsForDay);
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
                  {Array.from(grouped.entries())
                    .sort(([, a], [, b]) => {
                      // Own requests first
                      const aOwn = a.some((e) => e.resource?.isOwn);
                      const bOwn = b.some((e) => e.resource?.isOwn);
                      return (bOwn ? 1 : 0) - (aOwn ? 1 : 0);
                    })
                    .map(([shiftType, groupEvents]) => {
                      const isOwn = groupEvents.some((e) => e.resource?.isOwn);
                      const nurseNames = groupEvents
                        .map((e) => e.resource?.nurseName ?? "")
                        .filter(Boolean)
                        .join(", ");

                      const requests: ShiftRequestEntry[] = groupEvents.map((e) => ({
                        requestId: e.resource?.requestId,
                        nurseName: e.resource?.nurseName ?? "",
                        initialShiftType: e.resource?.shiftType ?? shiftType,
                        initialDate: e.resource?.preferredDate ?? "",
                      }));

                      return (
                        <Box
                          key={shiftType}
                          pb={2}
                          maxW="100%"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <CalendarRequestBlock
                            shift={shiftType}
                            nurseName={nurseNames}
                            owned={isOwn}
                            onClick={() => setSelectedGroup(requests)}
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

      {selectedGroup && (
        <EditShiftRequest
          isOpen={!!selectedGroup}
          onClose={() => setSelectedGroup(null)}
          requests={selectedGroup}
          wardId={wardId as number | null | undefined}
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
