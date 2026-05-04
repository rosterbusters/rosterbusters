import {
  Badge,
  Button,
  CloseButton,
  createListCollection,
  Dialog,
  HStack,
  Portal,
  Select,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import type { DateRange } from "react-day-picker"
import { LeaveRequestsService } from "@/client"
import { DatePickerDemo } from "@/components/Common/DatePicker"
import { cleanupOrphanedDialogState } from "@/components/Common/dialogCleanup"
import { showErrorToast, showSuccessToast } from "@/components/ui/toast"

export interface LeaveRequestEntry {
  requestId: number
  nurseName: string
  initialLeaveType: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
}

function parseRequestDate(value: string) {
  const normalized = value.split("–")[0]?.trim() ?? value
  const [day, month, year] = normalized.split("/")
  if (day && month && year) {
    return new Date(Number(year), Number(month) - 1, Number(day))
  }
  return new Date(normalized)
}

interface EditLeaveRequestProps {
  isOpen: boolean
  onClose: () => void
  requests: LeaveRequestEntry[]
  selectedRequestId?: number
}

export const EditLeaveRequest = ({
  isOpen,
  onClose,
  requests,
  selectedRequestId,
}: EditLeaveRequestProps) => {
  const active = useMemo(
    () =>
      (selectedRequestId != null
        ? requests.find((request) => request.requestId === selectedRequestId)
        : undefined) ?? requests[0],
    [requests, selectedRequestId],
  )

  const [leaveType, setLeaveType] = useState<string[]>([
    active?.initialLeaveType ?? "",
  ])
  const [requestDateRange, setRequestDateRange] = useState<
    DateRange | undefined
  >(
    active
      ? {
          from: parseRequestDate(active.startDate),
          to: parseRequestDate(active.endDate),
        }
      : undefined,
  )
  const queryClient = useQueryClient()

  useEffect(() => {
    if (active) {
      setLeaveType([active.initialLeaveType])
      setRequestDateRange({
        from: parseRequestDate(active.startDate),
        to: parseRequestDate(active.endDate),
      })
    }
  }, [active])

  useEffect(() => {
    if (isOpen) {
      return
    }

    const timeoutId = window.setTimeout(cleanupOrphanedDialogState, 350)
    return () => window.clearTimeout(timeoutId)
  }, [isOpen])

  useEffect(
    () => () => {
      window.setTimeout(cleanupOrphanedDialogState, 0)
    },
    [],
  )

  const { data: leaveCodes } = useQuery({
    queryKey: ["leave-codes"],
    queryFn: () => LeaveRequestsService.getLeaveCodes(),
    staleTime: 5 * 60 * 1000,
  })

  const leaveCollection = useMemo(
    () =>
      createListCollection({
        items: (leaveCodes ?? [])
          .filter((lc) => lc.shiftcode !== "MC")
          .map((lc) => ({
            value: lc.shiftcode,
            label: lc.shiftcode,
            description: lc.description,
          })),
      }),
    [leaveCodes],
  )

  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const updateMutation = useMutation({
    mutationFn: () =>
      LeaveRequestsService.updateLeaveRequest({
        leaveId: active.requestId,
        leavetype: leaveType[0],
        startdate: requestDateRange?.from
          ? toDateStr(requestDateRange.from)
          : undefined,
        enddate: requestDateRange?.to
          ? toDateStr(requestDateRange.to)
          : undefined,
      }),
    onSuccess: () => {
      showSuccessToast("Leave request updated!")
      queryClient.invalidateQueries({ queryKey: ["ward-leave-requests"] })
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] })
      onClose()
    },
    onError: (error: unknown) => {
      const detail = (error as any)?.body?.detail
      showErrorToast(detail || "Failed to update request")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () =>
      LeaveRequestsService.deleteLeaveRequest({ leaveId: active.requestId }),
    onSuccess: () => {
      showSuccessToast("Leave request withdrawn.")
      queryClient.invalidateQueries({ queryKey: ["ward-leave-requests"] })
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] })
      onClose()
    },
    onError: (error: unknown) => {
      const detail = (error as any)?.body?.detail
      showErrorToast(detail || "Failed to withdraw request")
    },
  })

  const handleSave = () => {
    if (leaveType.length === 0) {
      showErrorToast("Please select a leave type.")
      return
    }
    if (!requestDateRange?.from || !requestDateRange?.to) {
      showErrorToast("Please select a start and end date.")
      return
    }
    updateMutation.mutate()
  }

  if (!active) return null

  return (
    <Dialog.Root
      placement="center"
      motionPreset="slide-in-bottom"
      lazyMount
      unmountOnExit
      open={isOpen}
      onOpenChange={(e) => !e.open && onClose()}
      onInteractOutside={(event) => {
        const target = event.target as HTMLElement | null
        if (target?.closest("[data-datepicker-popup='true']")) {
          event.preventDefault()
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title color="primary" fontWeight="bold">
                Edit Leave Request
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack alignItems="start" gap={4} maxWidth="225px">
                <HStack alignItems="start">
                  <Text fontWeight="medium">Nurse</Text>
                  <Text>{active.nurseName || "—"}</Text>
                </HStack>
                <Select.Root
                  collection={leaveCollection}
                  size="sm"
                  value={leaveType}
                  onValueChange={(e) => setLeaveType(e.value)}
                >
                  <Select.Label>Leave Type</Select.Label>
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText placeholder="Select Leave Type" />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.Indicator />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Portal>
                    <Select.Positioner>
                      <Select.Content>
                        {leaveCollection.items.map((code) => (
                          <Select.Item item={code.value} key={code.value}>
                            <HStack gap={2}>
                              <Badge variant={`${code.value}Shift` as any}>
                                {code.value}
                              </Badge>
                              <Text fontSize="sm">{code.description}</Text>
                            </HStack>
                            <Select.ItemIndicator />
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Portal>
                </Select.Root>
                <VStack alignItems="start">
                  <Text fontWeight="medium">Dates Requesting</Text>
                  <DatePickerDemo
                    mode="range"
                    selected={requestDateRange}
                    onSelect={(range) => setRequestDateRange(range)}
                    placeholder="Pick a date range"
                  />
                </VStack>
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <VStack gap={2} flexDirection="row">
                <Button
                  variant="outline"
                  onClick={() => deleteMutation.mutate()}
                  loading={deleteMutation.isPending}
                >
                  Withdraw
                </Button>
                <Button onClick={handleSave} loading={updateMutation.isPending}>
                  Save
                </Button>
              </VStack>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
