import { useMemo, type JSX, useState } from "react";
import { Navigate, DateLocalizer } from "react-big-calendar";
import { Grid, GridItem, VStack, Box } from "@chakra-ui/react";
import { Event } from "@/models/Event";
import { CalendarRequestBlock } from "@/components/Common/CalendarRequestBlock";
import { NewShiftRequest } from "./NewShiftRequest";
import { EditShiftRequest } from "./EditShiftRequest";
import { ReviewShiftRequest } from "./ReviewShiftRequest";
import useAuth from "@/hooks/useAuth";
import { EditShiftRequest, type ShiftRequestEntry } from "./EditShiftRequest";
import moment from "moment";

interface CustomWeekViewProps {
  date: Date;
  localizer: DateLocalizer;
  events: Event[];

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
  const [selectedRequest, setSelectedRequest] = useState<{
    requestId: number;
    shiftType: string;
    preferredDate: string;
    nurseName: string;
    status: string;
  } | null>(null);
  const [selectedReviewRequest, setSelectedReviewRequest] = useState<{
    requestId: number;
    nurseName: string;
    shiftType: string;
    preferredDate: string;
    status: string;
    reason: string | null;
  } | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<number, string>>({});
  const [selectedGroup, setSelectedGroup] = useState<ShiftRequestEntry[] | null>(null);

  const currRange = useMemo(
    () => CustomWeekView.range(date, { localizer }),
    [date, localizer],
  );

  const handleReviewAction = (
    requestId: number,
    action: "Approved" | "Rejected",
    _comment: string,
  ) => {
    setStatusOverrides((prev) => ({ ...prev, [requestId]: action }));
  };

  

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
                bgColor={
                  moment(day).isSame(moment(), "day") ? "menuactive" : "white"
                }
              >
                {localizer.format(day, "D")}
                <Box mt={2}>
                  {eventsForDay.length > 0 &&
                    [...eventsForDay]
                    .sort((a, b) => (b.resource?.isOwn ? 1 : 0) - (a.resource?.isOwn ? 1 : 0))
                    .map((ev, idx) => (
                      <Box key={idx} pb={2} maxW="100%">
                        <CalendarRequestBlock
                          shift={ev.title}
                          nurseName={ev.resource?.nurseName}
                          owned={ev.resource?.isOwn}
                          onClick={
                            ev.resource?.isOwn
                              ? () => setSelectedRequest({
                                  requestId: ev.resource.requestId,
                                  shiftType: ev.resource.shiftType,
                                  preferredDate: ev.resource.preferredDate,
                                })
                              : () => setSelectedReviewRequest({
                                  requestId: ev.resource.requestId,
                                  nurseName: ev.resource.nurseName,
                                  shiftType: ev.resource.shiftType,
                                  preferredDate: ev.resource.preferredDate,
                                  status: statusOverrides[ev.resource.requestId] ?? ev.resource.status,
                                  reason: ev.resource.reason ?? null,
                                })
                          }
                        />
                      </Box>
                    ))
                  }
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
                        <Box key={shiftType} pb={2} maxW="100%">
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

      {selectedReviewRequest && (
        <ReviewShiftRequest
          isOpen={!!selectedReviewRequest}
          onClose={() => setSelectedReviewRequest(null)}
          requestId={selectedReviewRequest.requestId}
          nurseName={selectedReviewRequest.nurseName}
          shiftCode={selectedReviewRequest.shiftType}
          date={selectedReviewRequest.preferredDate}
          status={
            statusOverrides[selectedReviewRequest.requestId] ??
            selectedReviewRequest.status
          }
          comment={selectedReviewRequest.reason}
          onAction={handleReviewAction}
        />
      )}
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
