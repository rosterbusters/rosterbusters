"use client"

import * as React from "react"
import { Button } from "@chakra-ui/react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, Portal } from "@chakra-ui/react"
import { format } from "date-fns"
import { ChevronDownIcon, Calendar as CalendarIcon } from "lucide-react"

interface DatePickerProps {
  selected?: Date
  onSelect?: (date: Date | undefined) => void
  placeholder?: string
}

export function DatePickerDemo({ selected, onSelect, placeholder = "Pick a date" }: DatePickerProps) {
  const [internalDate, setInternalDate] = React.useState<Date>()

  const date = selected ?? internalDate
  const handleSelect = (selectedDate: Date | undefined) => {
    if (onSelect) {
      onSelect(selectedDate)
    } else {
      setInternalDate(selectedDate)
    }
  }

  return (
    <Popover.Root positioning={{placement:"bottom-start"}}>
      <Popover.Trigger asChild>
        <Button
          variant="outline"
          data-empty={!date}
        >
            <CalendarIcon/>
          {date ? format(date, "PPP") : <span>{placeholder}</span>}
          <ChevronDownIcon />
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content width={"fit-content"}>
            <Popover.Body width={"fit-content"} p={0}>
              <Calendar
                mode="single"
                selected={date}
                onSelect={handleSelect}
                defaultMonth={date}
              />
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  )
}
