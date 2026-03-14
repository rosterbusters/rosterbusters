"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Button } from "@chakra-ui/react"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { ChevronDownIcon, Calendar as CalendarIcon } from "lucide-react"

interface DatePickerProps {
  selected?: Date
  onSelect?: (date: Date | undefined) => void
  placeholder?: string
}

export function DatePickerDemo({ selected, onSelect, placeholder = "Pick a date" }: DatePickerProps) {
  const [internalDate, setInternalDate] = React.useState<Date>()
  const [open, setOpen] = React.useState(false)
  const [coords, setCoords] = React.useState({ top: 0, left: 0 })
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  const date = selected ?? internalDate

  const handleSelect = (selectedDate: Date | undefined) => {
    if (onSelect) {
      onSelect(selectedDate)
    } else {
      setInternalDate(selectedDate)
    }
    setOpen(false)
  }

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setCoords({ top: rect.bottom + 4, left: rect.left })
    }
    setOpen((v) => !v)
  }

  React.useEffect(() => {
    if (!open) return
    const handleClick = () => setOpen(false)
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const calendarPopup = (
    <div
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        zIndex: 9999,
        background: "white",
        borderRadius: "12px",
        boxShadow:
          "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Calendar
        mode="single"
        selected={date}
        onSelect={handleSelect}
        defaultMonth={date}
      />
    </div>
  )

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        data-empty={!date}
        onClick={handleToggle}
      >
        <CalendarIcon />
        {date ? format(date, "PPP") : <span>{placeholder}</span>}
        <ChevronDownIcon />
      </Button>
      {open && typeof document !== "undefined" && createPortal(calendarPopup, document.body)}
    </>
  )
}
