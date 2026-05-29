"use client"

import { Button } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { format, startOfDay, startOfMonth } from "date-fns"
import { Calendar as CalendarIcon, ChevronDownIcon } from "lucide-react"
import * as React from "react"
import type { DateRange, Matcher } from "react-day-picker"
import { type RosterPeriodPublic, ShiftRequestsService } from "@/client"
import { Calendar } from "@/components/ui/calendar"

interface BaseDatePickerProps {
  placeholder?: string
  disabled?: Matcher | Matcher[]
}

interface SingleDatePickerProps extends BaseDatePickerProps {
  mode?: "single"
  selected?: Date
  onSelect?: (date: Date | undefined) => void
}

interface RangeDatePickerProps extends BaseDatePickerProps {
  mode: "range"
  selected?: DateRange
  onSelect?: (range: DateRange | undefined) => void
}

type DatePickerProps = SingleDatePickerProps | RangeDatePickerProps

function formatRange(range?: DateRange, placeholder?: string) {
  if (!range?.from) {
    return placeholder
  }

  if (!range.to) {
    return `${format(range.from, "PPP")} - End date`
  }

  return `${format(range.from, "PPP")} - ${format(range.to, "PPP")}`
}

function normalizeDate(date: Date) {
  return startOfDay(date)
}

function isSameDate(left: Date, right: Date) {
  return normalizeDate(left).getTime() === normalizeDate(right).getTime()
}

function getRangeState(range?: DateRange) {
  if (!range?.from) return "empty"
  if (!range.to) return "incomplete"
  return isSameDate(range.from, range.to) ? "single" : "multi"
}

function parseDateOnly(value: string | undefined) {
  if (!value) return undefined

  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return undefined

  return new Date(year, month - 1, day)
}

function getRosterPeriodBounds(periods: RosterPeriodPublic[]) {
  const bounds = periods.reduce<{
    startMonth?: Date
    endMonth?: Date
  }>((acc, period) => {
    const startDate = parseDateOnly(period.startdate)
    const endDate = parseDateOnly(period.enddate)

    if (startDate && (!acc.startMonth || startDate < acc.startMonth)) {
      acc.startMonth = startOfMonth(startDate)
    }

    if (endDate && (!acc.endMonth || endDate > acc.endMonth)) {
      acc.endMonth = startOfMonth(endDate)
    }

    return acc
  }, {})

  return bounds
}

function clampMonth(month: Date, startMonth?: Date, endMonth?: Date) {
  if (startMonth && month < startMonth) return startMonth
  if (endMonth && month > endMonth) return endMonth
  return month
}

export function DatePickerDemo(props: DatePickerProps) {
  const { placeholder = "Pick a date" } = props
  const [internalDate, setInternalDate] = React.useState<Date>()
  const [internalRange, setInternalRange] = React.useState<DateRange>()
  const [open, setOpen] = React.useState(false)
  const [visibleMonth, setVisibleMonth] = React.useState(() =>
    startOfMonth(new Date()),
  )
  const wrapperRef = React.useRef<HTMLDivElement>(null)

  const { data: rosterPeriods = [] } = useQuery({
    queryKey: ["date-picker", "roster-periods"],
    queryFn: () => ShiftRequestsService.getRosterPeriods(),
    staleTime: 10 * 60 * 1000,
  })

  const isRange = props.mode === "range"
  const date = !isRange ? (props.selected ?? internalDate) : undefined
  const range = isRange ? (props.selected ?? internalRange) : undefined
  const rangeState = getRangeState(range)
  const calendarRange =
    open && rangeState === "single" && range?.from
      ? { from: range.from, to: undefined }
      : range
  const { startMonth, endMonth } = React.useMemo(
    () => getRosterPeriodBounds(rosterPeriods),
    [rosterPeriods],
  )
  const displayMonth = isRange
    ? (range?.from ?? new Date())
    : (date ?? new Date())
  const isEmpty = isRange ? !range?.from : !date
  const displayYear = displayMonth.getFullYear()
  const displayMonthIndex = displayMonth.getMonth()
  const calendarMonth = React.useMemo(
    () =>
      clampMonth(
        startOfMonth(new Date(displayYear, displayMonthIndex)),
        startMonth,
        endMonth,
      ),
    [displayMonthIndex, displayYear, endMonth, startMonth],
  )
  const navigationStartMonth = startMonth ?? calendarMonth
  const navigationEndMonth = endMonth ?? calendarMonth

  React.useEffect(() => {
    if (props.mode !== "range") {
      setInternalDate(props.selected)
    }
  }, [props.mode, props.selected])

  React.useEffect(() => {
    if (props.mode === "range") {
      setInternalRange(props.selected)
    }
  }, [props.mode, props.selected])

  React.useEffect(() => {
    if (!open) {
      setVisibleMonth(calendarMonth)
    }
  }, [calendarMonth, open])

  React.useEffect(() => {
    setVisibleMonth((month) => clampMonth(month, startMonth, endMonth))
  }, [endMonth, startMonth])

  const handleSingleSelect = (selectedDate: Date | undefined) => {
    if (props.mode === "range") {
      return
    }

    if (props.onSelect) {
      props.onSelect(selectedDate)
    }
    setInternalDate(selectedDate)
    setOpen(false)
  }

  const handleRangeSelect = (
    selectedRange: DateRange | undefined,
    triggerDate: Date,
  ) => {
    if (props.mode !== "range") {
      return
    }

    const previousRangeState = getRangeState(range)
    const normalizedTriggerDate = normalizeDate(triggerDate)
    let normalizedRange = selectedRange?.from
      ? {
          from: normalizeDate(selectedRange.from),
          to: selectedRange.to ? normalizeDate(selectedRange.to) : undefined,
        }
      : undefined

    if (
      previousRangeState === "empty" &&
      getRangeState(normalizedRange) === "single" &&
      normalizedRange?.from
    ) {
      normalizedRange = { from: normalizedRange.from, to: undefined }
    }

    if (previousRangeState === "multi") {
      normalizedRange = {
        from: normalizedTriggerDate,
        to: normalizedTriggerDate,
      }
    }

    if (props.onSelect) {
      props.onSelect(normalizedRange)
    }
    setInternalRange(normalizedRange)

    const nextRangeState = getRangeState(normalizedRange)
    if (
      nextRangeState === "multi" ||
      (nextRangeState === "single" && previousRangeState === "incomplete")
    ) {
      setOpen(false)
    }
  }

  const handleToggle = () => {
    setOpen((v) => !v)
  }

  React.useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const calendarPopup = (
    <div
      data-datepicker-popup="true"
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        left: 0,
        zIndex: 9999,
        background: "white",
        borderRadius: "12px",
        boxShadow:
          "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
      }}
    >
      {isRange ? (
        <Calendar
          mode="range"
          selected={calendarRange}
          onSelect={handleRangeSelect}
          month={visibleMonth}
          onMonthChange={setVisibleMonth}
          numberOfMonths={2}
          captionLayout="dropdown"
          startMonth={navigationStartMonth}
          endMonth={navigationEndMonth}
          disabled={props.disabled}
          excludeDisabled
        />
      ) : (
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSingleSelect}
          month={visibleMonth}
          onMonthChange={setVisibleMonth}
          captionLayout="dropdown"
          startMonth={navigationStartMonth}
          endMonth={navigationEndMonth}
          disabled={props.disabled}
        />
      )}
    </div>
  )

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative", display: "inline-block" }}
    >
      <Button variant="outline" data-empty={isEmpty} onClick={handleToggle}>
        <CalendarIcon />
        {isRange ? (
          <span>{formatRange(range, placeholder)}</span>
        ) : date ? (
          format(date, "PPP")
        ) : (
          <span>{placeholder}</span>
        )}
        <ChevronDownIcon />
      </Button>
      {open && calendarPopup}
    </div>
  )
}
