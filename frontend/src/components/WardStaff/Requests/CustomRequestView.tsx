import { useMemo, type JSX } from "react";
import { Navigate, DateLocalizer } from "react-big-calendar";
import { Grid, GridItem, VStack } from "@chakra-ui/react";
interface CustomWeekViewProps {
  date: Date;
  localizer: DateLocalizer;
  [key: string]: unknown;
}

interface CustomWeekViewComponent {
  (props: CustomWeekViewProps): JSX.Element;
  range: (date: Date, options: { localizer: DateLocalizer }) => Date[];
  navigate: (date: Date, action: typeof Navigate.PREVIOUS | typeof Navigate.NEXT | typeof Navigate.DATE, options: { localizer: DateLocalizer }) => Date;
  title: (date: Date, options: { localizer: DateLocalizer }) => string;
}

const CustomWeekView: CustomWeekViewComponent = function CustomWeekView({
  date,
  localizer,
}: CustomWeekViewProps) {
  const currRange = useMemo(
    () => CustomWeekView.range(date, { localizer }),
    [date, localizer]
  )

  return (
    <VStack width={"full"} gap={0}>

    
    <Grid width={"full"} templateColumns="repeat(7, 1fr)" borderColor="border"
      borderWidth={"1px"}>
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
    <Grid width={"full"} templateColumns="repeat(7, 1fr)" templateRows="repeat(2, 1fr)">
    {currRange.map((day, i) => (
    <GridItem
      key={i}
      bg="white"
      color="foreground"
      p={2}
      minH="250px"
      borderColor="border"
      borderWidth="1px"
    >
      {localizer.format(day, "D")} {/* formatted date */}
    </GridItem>
  ))}
</Grid>
</VStack>
  )
}

CustomWeekView.range = (date: Date, { localizer }: { localizer: DateLocalizer }): Date[] => {
  const start = date //need to change this date to shift request opening
  const end = localizer.add(start, 13, 'day')

  let current = start
  const range: Date[] = []

  while (localizer.lte(current, end, 'day')) {
    range.push(current)
    current = localizer.add(current, 1, 'day')
  }

  return range
}

CustomWeekView.navigate = (date: Date, action: typeof Navigate.PREVIOUS | typeof Navigate.NEXT | typeof Navigate.DATE, { localizer }: { localizer: DateLocalizer }): Date => {
  switch (action) {
    case Navigate.PREVIOUS:
      return localizer.add(date, -14, 'day')

    case Navigate.NEXT:
      return localizer.add(date, 14, 'day')

    default:
      return date
  }
}

CustomWeekView.title = (date: Date, { localizer }: { localizer: DateLocalizer }): string => {
  const range = CustomWeekView.range(date, { localizer })
  const start = range[0]
  const end = range[range.length - 1]
  return localizer.format({ start, end }, 'dayRangeHeaderFormat')
}

export default CustomWeekView
