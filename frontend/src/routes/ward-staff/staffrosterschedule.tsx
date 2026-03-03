import { createFileRoute } from "@tanstack/react-router"
import { useState, useMemo } from "react"
import {
  Box,
  Flex,
  Text,
  HStack,
  Button,
  Table,
  Spinner,
} from "@chakra-ui/react"
import { Filter } from "lucide-react"
import moment from "moment"
import useAuth from "@/hooks/useAuth"
import { ShiftBadge } from "@/components/NurseManager/RosterTable/ShiftBadge"
import {
  useWardStatistics,
  useWardRoster,
  useRosterPeriods,
  transformRosterData,
} from "@/components/NurseManager/RosterTable/useRosterData"
import type { DayColumn } from "@/components/NurseManager/RosterTable/types"

export const Route = createFileRoute("/ward-staff/staffrosterschedule")({
  component: StaffRosterSchedule,
})

function generateDayColumns(startDate: Date): DayColumn[] {
  const columns: DayColumn[] = []
  for (let i = 0; i < 7; i++) {
    const date = moment(startDate).add(i, "days")
    columns.push({
      field: `shift_${date.format("YYYY-MM-DD")}`,
      title: date.format("dddd"),
      date: date.toDate(),
      dayOfWeek: date.format("ddd"),
    })
  }
  return columns
}

function StaffRosterSchedule() {
  const { user } = useAuth()
  const [currentStartDate, setCurrentStartDate] = useState(() =>
    moment().startOf("isoWeek").toDate()
  )

  const wardId = user?.wardid ?? null
  const dayColumns = useMemo(() => generateDayColumns(currentStartDate), [currentStartDate])

  const { data: periods } = useRosterPeriods()
  const activePeriod = useMemo(() => {
    if (!periods) return null
    const weekStart = moment(currentStartDate)
    return (
      periods.find((p) =>
        weekStart.isBetween(moment(p.startDate), moment(p.endDate), "day", "[]")
      ) ??
      periods[0] ??
      null
    )
  }, [periods, currentStartDate])

  const { data: statistics } = useWardStatistics(wardId)
  const { data: rosterData, isLoading } = useWardRoster(
    wardId,
    activePeriod?.periodId ?? null
  )

  const rows = useMemo(() => {
    if (!statistics?.nurses || !rosterData?.roster_entries) return []
    return transformRosterData(statistics.nurses, rosterData.roster_entries)
  }, [statistics, rosterData])

  const handleToday = () => setCurrentStartDate(moment().startOf("isoWeek").toDate())
  const handleBack = () =>
    setCurrentStartDate((prev) => moment(prev).subtract(7, "days").toDate())
  const handleNext = () =>
    setCurrentStartDate((prev) => moment(prev).add(7, "days").toDate())

  const weekEnd = moment(currentStartDate).add(6, "days")
  const dateRangeLabel = `${moment(currentStartDate).format("Do MMMM YYYY")} – ${weekEnd.format("Do MMMM YYYY")}`

  return (
    <Flex direction="column" gap={4} p={6}>
      {/* Header */}
      <Flex direction="column" align="center" gap={1}>
        <Text fontSize="2xl" fontWeight="bold" color="#164e63">
          Staff Roster Schedule
        </Text>
        <Text fontSize="sm" color="gray.500">
          {dateRangeLabel}
        </Text>
      </Flex>

      {/* Navigation */}
      <Flex justify="flex-end">
        <HStack gap={2}>
          <Button
            variant="outline"
            size="sm"
            borderRadius="full"
            onClick={handleToday}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            borderRadius="full"
            onClick={handleBack}
          >
            Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            borderRadius="full"
            onClick={handleNext}
          >
            Next
          </Button>
        </HStack>
      </Flex>

      {/* Table */}
      <Box overflowX="auto" bg="white" rounded="lg" shadow="sm">
        {isLoading ? (
          <Flex justify="center" p={10}>
            <Spinner color="#0891b2" />
          </Flex>
        ) : (
          <Table.Root>
            <Table.Header>
              <Table.Row bg="white">
                <Table.ColumnHeader
                  minW="140px"
                  borderBottom="1px solid"
                  borderColor="gray.200"
                  py={3}
                  px={4}
                >
                  <HStack gap={1}>
                    <Text fontSize="sm" fontWeight="medium" color="gray.700">
                      Name
                    </Text>
                    <Filter size={12} color="#9ca3af" />
                  </HStack>
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  minW="220px"
                  borderBottom="1px solid"
                  borderColor="gray.200"
                  py={3}
                  px={4}
                >
                  <HStack gap={1}>
                    <Text fontSize="sm" fontWeight="medium" color="gray.700">
                      Designation
                    </Text>
                    <Filter size={12} color="#9ca3af" />
                  </HStack>
                </Table.ColumnHeader>
                {dayColumns.map((col) => (
                  <Table.ColumnHeader
                    key={col.field}
                    textAlign="center"
                    minW="160px"
                    borderBottom="1px solid"
                    borderColor="gray.200"
                    py={3}
                    px={2}
                  >
                    <Text fontSize="sm" fontWeight="medium" color="gray.700">
                      {col.title}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      {moment(col.date).format("D/MM/YYYY")}
                    </Text>
                  </Table.ColumnHeader>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => {
                const isCurrentUser = row.nurseId === user?.nurseid
                return (
                  <Table.Row
                    key={row.nurseId}
                    bg={isCurrentUser ? "#ccf2f4" : "white"}
                    _hover={{ bg: isCurrentUser ? "#b2ecf0" : "gray.50" }}
                  >
                    <Table.Cell
                      borderBottom="1px solid"
                      borderColor="gray.100"
                      py={3}
                      px={4}
                    >
                      <Text
                        fontSize="sm"
                        fontWeight={isCurrentUser ? "semibold" : "normal"}
                      >
                        {row.name}
                      </Text>
                    </Table.Cell>
                    <Table.Cell
                      borderBottom="1px solid"
                      borderColor="gray.100"
                      py={3}
                      px={4}
                    >
                      <Text fontSize="sm" textTransform="uppercase" color="gray.700">
                        {row.designation}
                      </Text>
                    </Table.Cell>
                    {dayColumns.map((col) => {
                      const dateKey = moment(col.date).format("YYYY-MM-DD")
                      const shift = row.shifts[dateKey]
                      return (
                        <Table.Cell
                          key={col.field}
                          textAlign="center"
                          borderBottom="1px solid"
                          borderColor="gray.100"
                          py={3}
                          px={2}
                        >
                          {shift?.shiftCode ? (
                            <Flex justify="center">
                              <ShiftBadge
                                shiftCode={shift.shiftCode}
                                isEditable={false}
                                viewMode="week"
                                comment={shift.comment}
                              />
                            </Flex>
                          ) : (
                            <Box w="140px" h="44px" mx="auto" />
                          )}
                        </Table.Cell>
                      )
                    })}
                  </Table.Row>
                )
              })}
              {rows.length === 0 && !isLoading && (
                <Table.Row>
                  <Table.Cell
                    colSpan={2 + dayColumns.length}
                    textAlign="center"
                    py={10}
                    color="gray.400"
                    fontSize="sm"
                  >
                    No roster data available for this week.
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table.Root>
        )}
      </Box>
    </Flex>
  )
}

export default StaffRosterSchedule
