import { Box, Grid, GridItem, VStack } from "@chakra-ui/react"
import moment from "moment"
import { type JSX, useMemo, useState } from "react"
import { type DateLocalizer, Navigate } from "react-big-calendar"
import { CalendarRequestBlock } from "@/components/Common/CalendarRequestBlock"
import type { Event } from "@/models/Event"
import { EditLeaveRequest, type LeaveRequestEntry } from "./EditLeaveRequest"
import { NewLeaveRequest } from "./NewLeaveRequest"

interface CustomMonthViewProps {
  date: Date
  localizer: DateLocalizer
  events: Event[]
  periodStartDate?: string
  periodEndDate?: string
  [key: string]: unknown
}

interface CustomMonthViewComponent {
  (props: CustomMonthViewProps): JSX.Element
  range: (date: Date, options: { localizer: DateLocalizer }) => Date[]
  navigate: (
    date: Date,
    action:
      | typeof Navigate.PREVIOUS
      | typeof Navigate.NEXT
      | typeof Navigate.DATE,
    options: { localizer: DateLocalizer },
  ) => Date
  title: (date: Date, options: { localizer: DateLocalizer }) => string
}

function getEventsForDay(day: Date, events: Event[]): Event[] {
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  return events.filter((ev) => {
    const start = new Date(ev.start)
    const end = new Date(ev.end)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return dayStart >= start && dayStart <= end
  })
}

function isDateInPeriod(
  day: Date,
  periodStartDate?: string,
  periodEndDate?: string,
): boolean {
  return (
    !!periodStartDate &&
    !!periodEndDate &&
    moment(day).isBetween(
      moment(periodStartDate),
      moment(periodEndDate),
      "day",
      "[]",
    )
  )
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const PERIOD_BORDER_COLOR = "#52add0"

const CustomMonthView: CustomMonthViewComponent = function CustomMonthView({
  date,
  localizer,
  events,
  isLocked,
  periodStartDate,
  periodEndDate,
}: CustomMonthViewProps) {
  const locked = Boolean(isLocked)
  const [selectedRequests, setSelectedRequests] = useState<
    LeaveRequestEntry[] | null
  >(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [newLeaveDate, setNewLeaveDate] = useState<Date | null>(null)
  const [isNewLeaveOpen, setIsNewLeaveOpen] = useState(false)

  const currRange = useMemo(
    () => CustomMonthView.range(date, { localizer }),
    [date, localizer],
  )

  const weeks = useMemo(() => {
    const result: Date[][] = []
    for (let i = 0; i < currRange.length; i += 7) {
      result.push(currRange.slice(i, i + 7))
    }
    return result
  }, [currRange])

  const currentMonth = moment(date).month()

  const handleEditClose = () => {
    setIsEditOpen(false)
    window.setTimeout(() => setSelectedRequests(null), 0)
  }

  const handleNewLeaveClose = () => {
    setIsNewLeaveOpen(false)
    window.setTimeout(() => setNewLeaveDate(null), 0)
  }

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
              const eventsForDay = getEventsForDay(day, events)
              const isCurrentMonth = moment(day).month() === currentMonth
              const isToday = moment(day).isSame(moment(), "day")
              const isPastDate = moment(day)
                .startOf("day")
                .isBefore(moment().startOf("day"))
              const isBeforePeriodStart =
                !!periodStartDate &&
                moment(day)
                  .startOf("day")
                  .isBefore(moment(periodStartDate).startOf("day"))
              const isBlocked = locked || isBeforePeriodStart
              const isPeriodDay = isDateInPeriod(
                day,
                periodStartDate,
                periodEndDate,
              )
              const previousDay = moment(day).subtract(1, "day").toDate()
              const nextDay = moment(day).add(1, "day").toDate()
              const previousWeek = moment(day).subtract(7, "days").toDate()
              const nextWeek = moment(day).add(7, "days").toDate()
              const isPeriodBlockTop =
                isPeriodDay &&
                !isDateInPeriod(previousWeek, periodStartDate, periodEndDate)
              const isPeriodBlockBottom =
                isPeriodDay &&
                !isDateInPeriod(nextWeek, periodStartDate, periodEndDate)
              const isPeriodBlockLeft =
                isPeriodDay &&
                (di === 0 ||
                  !isDateInPeriod(previousDay, periodStartDate, periodEndDate))
              const isPeriodBlockRight =
                isPeriodDay &&
                (di === 6 ||
                  !isDateInPeriod(nextDay, periodStartDate, periodEndDate))
              const dateKey = moment(day).format("YYYY-MM-DD")

              return (
                <GridItem
                  key={di}
                  data-testid={`leave-request-calendar-cell-${dateKey}`}
                  bg={
                    isToday && !isBeforePeriodStart
                      ? "menuactive"
                      : isPastDate || isBeforePeriodStart
                        ? "gray.100"
                        : "white"
                  }
                  textAlign="start"
                  color={
                    isPastDate || isBeforePeriodStart
                      ? "gray.500"
                      : isCurrentMonth
                        ? "foreground"
                        : "gray.400"
                  }
                  p={2}
                  minH="120px"
                  borderColor="border"
                  borderWidth="1px"
                  borderTopColor={
                    isPeriodBlockTop ? PERIOD_BORDER_COLOR : "border"
                  }
                  borderBottomColor={
                    isPeriodBlockBottom ? PERIOD_BORDER_COLOR : "border"
                  }
                  borderLeftColor={
                    isPeriodBlockLeft ? PERIOD_BORDER_COLOR : "border"
                  }
                  borderRightColor={
                    isPeriodBlockRight ? PERIOD_BORDER_COLOR : "border"
                  }
                  borderTopWidth={isPeriodBlockTop ? "2px" : "1px"}
                  borderBottomWidth={isPeriodBlockBottom ? "2px" : "1px"}
                  borderLeftWidth={isPeriodBlockLeft ? "2px" : "1px"}
                  borderRightWidth={isPeriodBlockRight ? "2px" : "1px"}
                  cursor={isBlocked ? "default" : "pointer"}
                  onClick={
                    isBlocked
                      ? undefined
                      : () => {
                          setNewLeaveDate(day)
                          setIsNewLeaveOpen(true)
                        }
                  }
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
                          <Box
                            key={idx}
                            pb={2}
                            maxW="100%"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={
                              ev.resource?.requestId
                                ? `leave-request-${ev.resource.requestId}`
                                : undefined
                            }
                          >
                            <CalendarRequestBlock
                              shift={ev.title}
                              nurseName={ev.resource?.nurseName}
                              owned={ev.resource?.isOwn}
                              onClick={
                                ev.resource?.isOwn && !isBlocked
                                  ? () => {
                                      const ownedForDay = eventsForDay
                                        .filter((e) => e.resource?.isOwn)
                                        .map((e) => ({
                                          requestId: e.resource.requestId,
                                          nurseName:
                                            e.resource.nurseName ?? e.title,
                                          initialLeaveType:
                                            e.resource.shiftType,
                                          startDate: e.resource.startDate,
                                          endDate: e.resource.endDate,
                                        }))
                                      setSelectedRequests(ownedForDay)
                                      setIsEditOpen(true)
                                    }
                                  : undefined
                              }
                            />
                          </Box>
                        ))}
                  </Box>
                </GridItem>
              )
            })}
          </Grid>
        ))}
      </VStack>

      {!locked && selectedRequests && (
        <EditLeaveRequest
          isOpen={isEditOpen}
          onClose={handleEditClose}
          requests={selectedRequests}
        />
      )}

      {!locked && newLeaveDate && (
        <NewLeaveRequest
          isOpen={isNewLeaveOpen}
          onClose={handleNewLeaveClose}
          selectedDate={newLeaveDate}
        />
      )}
    </>
  )
}

CustomMonthView.range = (
  date: Date,
  { localizer }: { localizer: DateLocalizer },
): Date[] => {
  const start = moment(date).startOf("month").startOf("week").toDate()
  const end = moment(date).endOf("month").endOf("week").toDate()
  const range: Date[] = []
  let current = start
  while (localizer.lte(current, end, "day")) {
    range.push(current)
    current = localizer.add(current, 1, "day")
  }
  return range
}

CustomMonthView.navigate = (
  date: Date,
  action:
    | typeof Navigate.PREVIOUS
    | typeof Navigate.NEXT
    | typeof Navigate.DATE,
): Date => {
  switch (action) {
    case Navigate.PREVIOUS:
      return moment(date).subtract(1, "month").toDate()
    case Navigate.NEXT:
      return moment(date).add(1, "month").toDate()
    default:
      return date
  }
}

CustomMonthView.title = (date: Date): string => {
  return moment(date).format("MMMM YYYY")
}

export default CustomMonthView
