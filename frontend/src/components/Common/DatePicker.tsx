"use client"

import { Button } from "@chakra-ui/react"
import { format, startOfDay } from "date-fns"
import { Calendar as CalendarIcon, ChevronDownIcon } from "lucide-react"
import * as React from "react"
import type { DateRange, Matcher } from "react-day-picker"
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

export function DatePickerDemo(props: DatePickerProps) {
  const { placeholder = "Pick a date" } = props
  const [internalDate, setInternalDate] = React.useState<Date>()
  const [internalRange, setInternalRange] = React.useState<DateRange>()
  const [open, setOpen] = React.useState(false)
  const wrapperRef = React.useRef<HTMLDivElement>(null)

  const isRange = props.mode === "range"
  const date = !isRange ? (props.selected ?? internalDate) : undefined
  const range = isRange ? (props.selected ?? internalRange) : undefined
  const displayMonth = isRange
    ? (range?.from ?? new Date())
    : (date ?? new Date())
  const isEmpty = isRange ? !range?.from : !date

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

    const normalizedRange = selectedRange?.from
      ? {
          from: normalizeDate(selectedRange.from),
          to: selectedRange.to ? normalizeDate(selectedRange.to) : undefined,
        }
      : undefined

    if (props.onSelect) {
      props.onSelect(normalizedRange)
    }
    setInternalRange(normalizedRange)

    if (normalizedRange?.from && normalizedRange?.to) {
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
          selected={range}
          onSelect={handleRangeSelect}
          defaultMonth={displayMonth}
          numberOfMonths={2}
          disabled={props.disabled}
          excludeDisabled
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
