import { Box, Grid, GridItem, Text, VStack } from "@chakra-ui/react"
import { type JSX, useMemo, useState } from "react"
import { type DateLocalizer, Navigate } from "react-big-calendar"
import type { RosterPeriodPublic } from "@/client/types.gen"
import { CalendarRequestBlock } from "@/components/Common/CalendarRequestBlock"
import useAuth from "@/hooks/useAuth"
import type { Event } from "@/models/Event"
import { EditShiftRequest } from "./EditShiftRequest"
import { NewShiftRequest } from "./NewShiftRequest"

interface CustomWeekViewProps {
  date: Date
  localizer: DateLocalizer
  events: Event[]
  activePeriod?: RosterPeriodPublic
  periodStartDate?: string
  periodEndDate?: string
  nextWindowStart?: string
  nextWindowEnd?: string

  [key: string]: unknown
}

import moment from "moment"

interface CustomWeekViewComponent {
  (props: CustomWeekViewProps): JSX.Element
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

export function getEventsForDay(day: Date, events: Event[]): Event[] {
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

function buildRange(
  localizer: DateLocalizer,
  date: Date,
  periodStartDate?: string,
  periodEndDate?: string,
): Date[] {
  const start = periodStartDate ? moment(periodStartDate).toDate() : date
  const end = periodEndDate
    ? moment(periodEndDate).toDate()
    : localizer.add(start, 13, "day")

  let current = start
  const range: Date[] = []

  while (localizer.lte(current, end, "day")) {
    range.push(current)
    current = localizer.add(current, 1, "day")
  }

  return range
}

const CustomWeekView: CustomWeekViewComponent = function CustomWeekView({
  date,
  localizer,
  events,
  isLocked,
  activePeriod,
  periodStartDate,
  periodEndDate,
  nextWindowStart,
  nextWindowEnd,
}: CustomWeekViewProps) {
  const locked = Boolean(isLocked)
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<{
    requestId: number
    shiftType: string
    preferredDate: string
  } | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const currRange = useMemo(
    () => buildRange(localizer, date, periodStartDate, periodEndDate),
    [date, localizer, periodEndDate, periodStartDate],
  )
  const handleDayClicked = (day: Date) => {
    setSelectedDay(day)
    setIsOpen(true)
  }

  const handleOwnRequestClicked = (request: {
    requestId: number
    shiftType: string
    preferredDate: string
  }) => {
    setSelectedRequest(request)
    setIsEditOpen(true)
  }

  const handleNewShiftClose = () => {
    setIsOpen(false)
    window.setTimeout(() => setSelectedDay(null), 350)
  }

  const handleEditShiftClose = () => {
    setIsEditOpen(false)
    window.setTimeout(() => setSelectedRequest(null), 350)
  }
  const hasNextWindow = nextWindowStart && nextWindowEnd

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

        <Box position="relative" minW={"820px"}>
          {locked && (
            <Box
              position="absolute"
              top={0}
              left={0}
              right={0}
              zIndex={2}
              bgColor="primary"
              py={2.5}
              textAlign="center"
              pointerEvents="none"
            >
              <Text color="white" fontSize="sm" fontWeight="medium">
                Shift Request Application Period Closed.
                {hasNextWindow && (
                  <>
                    {" "}
                    Next Application Window: {nextWindowStart} - {nextWindowEnd}
                  </>
                )}
              </Text>
            </Box>
          )}
          <Grid
            width={"full"}
            templateColumns="repeat(7, 1fr)"
            templateRows="repeat(2, 1fr)"
          >
            {currRange.map((day, i) => {
              const eventsForDay = getEventsForDay(day, events)
              const dateKey = moment(day).format("YYYY-MM-DD")

              return (
                <GridItem
                  key={i}
                  data-testid={`request-calendar-cell-${dateKey}`}
                  bg="white"
                  textAlign={"start"}
                  color={locked ? "gray.600" : "foreground"}
                  p={2}
                  pt={locked && i < 7 ? 12 : 2}
                  minH="250px"
                  onClick={locked ? undefined : () => handleDayClicked(day)}
                  cursor={locked ? "default" : "pointer"}
                  borderColor="border"
                  borderWidth="1px"
                  bgColor={
                    locked
                      ? "gray.100"
                      : moment(day).isSame(moment(), "day")
                        ? "menuactive"
                        : "white"
                  }
                >
                  {localizer.format(day, "D")}
                  <Box mt={2} opacity={locked ? 0.65 : 1}>
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
                            data-testid={
                              ev.resource?.requestId
                                ? `shift-request-${ev.resource.requestId}`
                                : undefined
                            }
                          >
                            <CalendarRequestBlock
                              shift={ev.title}
                              nurseName={ev.resource?.nurseName}
                              owned={ev.resource?.isOwn}
                              onClick={
                                ev.resource?.isOwn && !locked
                                  ? () =>
                                      handleOwnRequestClicked({
                                        requestId: ev.resource.requestId,
                                        shiftType: ev.resource.shiftType,
                                        preferredDate:
                                          ev.resource.preferredDate,
                                      })
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
        </Box>
      </VStack>

      {!locked && (
        <>
          {selectedDay && (
            <NewShiftRequest
              isOpen={isOpen}
              onClose={handleNewShiftClose}
              selectedDate={selectedDay}
              wardId={(user as any)?.wardid}
              activePeriod={activePeriod}
            />
          )}

          {selectedRequest && (
            <EditShiftRequest
              isOpen={isEditOpen}
              onClose={handleEditShiftClose}
              requestId={selectedRequest.requestId}
              initialShiftType={selectedRequest.shiftType}
              initialDate={selectedRequest.preferredDate}
              wardId={(user as any)?.wardid}
            />
          )}
        </>
      )}
    </>
  )
}

CustomWeekView.range = (
  date: Date,
  { localizer }: { localizer: DateLocalizer },
): Date[] => {
  return buildRange(localizer, date)
}

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
      return localizer.add(date, -14, "day")

    case Navigate.NEXT:
      return localizer.add(date, 14, "day")

    default:
      return date
  }
}

CustomWeekView.title = (
  date: Date,
  { localizer }: { localizer: DateLocalizer },
): string => {
  const range = CustomWeekView.range(date, { localizer })
  const start = range[0]
  const end = range[range.length - 1]
  return localizer.format({ start, end }, "dayRangeHeaderFormat")
}

export default CustomWeekView
