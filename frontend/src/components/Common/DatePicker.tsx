"use client"

import * as React from "react"
import { Button } from "@chakra-ui/react"
import { Calendar } from "@/components/ui/calendar"
import { addDays, format, isAfter, isBefore, isSameDay, startOfDay } from "date-fns"
import { ChevronDownIcon, Calendar as CalendarIcon } from "lucide-react"
import { dateMatchModifiers, type DateRange, type Matcher } from "react-day-picker"

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

function buildRange(first: Date, second: Date): DateRange {
  return isAfter(first, second)
    ? { from: normalizeDate(second), to: normalizeDate(first) }
    : { from: normalizeDate(first), to: normalizeDate(second) }
}

function rangeContainsDisabled(range: DateRange | undefined, disabled?: Matcher | Matcher[]) {
  if (!range?.from || !range?.to || !disabled) {
    return false
  }

  for (
    let current = normalizeDate(range.from);
    !isAfter(current, normalizeDate(range.to));
    current = addDays(current, 1)
  ) {
    if (dateMatchModifiers(current, disabled)) {
      return true
    }
  }

  return false
}

export function DatePickerDemo(props: DatePickerProps) {
  const { placeholder = "Pick a date" } = props
  const [internalDate, setInternalDate] = React.useState<Date>()
  const [internalRange, setInternalRange] = React.useState<DateRange>()
  const [hoveredDate, setHoveredDate] = React.useState<Date>()
  const [open, setOpen] = React.useState(false)
  const wrapperRef = React.useRef<HTMLDivElement>(null)

  const isRange = props.mode === "range"
  const date = !isRange ? props.selected ?? internalDate : undefined
  const range = isRange ? props.selected ?? internalRange : undefined
  const previewRange =
    isRange &&
    range?.from &&
    !range.to &&
    hoveredDate &&
    !rangeContainsDisabled(buildRange(range.from, hoveredDate), props.disabled)
      ? buildRange(range.from, hoveredDate)
      : range
  const displayMonth = isRange ? range?.from ?? new Date() : date ?? new Date()
  const isEmpty = isRange ? !range?.from : !date

  React.useEffect(() => {
    if (props.mode !== "range") {
      setInternalDate(props.selected)
    }
  }, [props.mode, props.mode !== "range" ? props.selected : undefined])

  React.useEffect(() => {
    if (props.mode === "range") {
      setInternalRange(props.selected)
      setHoveredDate(undefined)
    }
  }, [props.mode, props.mode === "range" ? props.selected : undefined])

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

  const handleRangeSelect = (selectedRange: DateRange | undefined) => {
    if (props.mode !== "range") {
      return
    }

    if (props.onSelect) {
      props.onSelect(selectedRange)
    }
    setInternalRange(selectedRange)

    if (selectedRange?.from && selectedRange?.to) {
      setOpen(false)
    }
  }

  const handleRangeDayClick = (day: Date, modifiers: { disabled?: boolean }) => {
    if (props.mode !== "range" || modifiers.disabled) {
      return
    }

    const clickedDay = normalizeDate(day)

    if (!range?.from || range.to) {
      handleRangeSelect({ from: clickedDay, to: undefined })
      return
    }

    if (isBefore(clickedDay, normalizeDate(range.from))) {
      handleRangeSelect({ from: clickedDay, to: undefined })
      return
    }

    const nextRange = buildRange(range.from, clickedDay)
    if (rangeContainsDisabled(nextRange, props.disabled)) {
      return
    }

    handleRangeSelect(nextRange)
  }

  const handleRangeDayMouseEnter = (day: Date, modifiers: { disabled?: boolean }) => {
    if (props.mode !== "range" || !range?.from || range.to || modifiers.disabled) {
      setHoveredDate(undefined)
      return
    }

    setHoveredDate(normalizeDate(day))
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
      onMouseDown={(e) => e.stopPropagation()}
    >
      {isRange ? (
        <Calendar
          selected={previewRange}
          defaultMonth={displayMonth}
          numberOfMonths={2}
          disabled={props.disabled}
          onDayClick={handleRangeDayClick}
          onDayMouseEnter={handleRangeDayMouseEnter}
          modifiers={{
            selected: previewRange,
            range_start: previewRange?.from,
            range_end: previewRange?.to,
            range_middle:
              previewRange?.from && previewRange?.to ? previewRange : undefined,
          }}
        />
      ) : (
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSingleSelect}
          defaultMonth={displayMonth}
          disabled={props.disabled}
        />
      )}
    </div>
  )

  return (
    <div ref={wrapperRef} style={{ position: "relative", display: "inline-block" }}>
      <Button
        variant="outline"
        data-empty={isEmpty}
        onClick={handleToggle}
      >
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
