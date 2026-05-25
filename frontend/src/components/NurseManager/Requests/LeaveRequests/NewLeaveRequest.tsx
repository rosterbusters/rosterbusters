import {
  Badge,
  Box,
  Button,
  CloseButton,
  createListCollection,
  Dialog,
  HStack,
  Portal,
  Select,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { DateRange, Matcher } from "react-day-picker"
import { LeaveRequestsService, ShiftRequestsService } from "@/client"
import { DatePickerDemo } from "@/components/Common/DatePicker"
import { cleanupOrphanedDialogState } from "@/components/Common/dialogCleanup"
import { showErrorToast, showSuccessToast } from "@/components/ui/toast"
import { SearchableNurseCombobox } from "../SearchableNurseCombobox"

interface NewLeaveRequestProps {
  isOpen: boolean
  onClose: () => void
  selectedDate?: Date | null
  wardId?: number | null
}

function buildInitialRange(selectedDate?: Date | null): DateRange | undefined {
  return selectedDate
    ? {
        from: selectedDate,
        to: selectedDate,
      }
    : undefined
}

export const NewLeaveRequest = ({
  isOpen,
  onClose,
  selectedDate,
  wardId,
}: NewLeaveRequestProps) => {
  const [leaveType, setLeaveType] = useState<string[]>([])
  const [selectedNurse, setSelectedNurse] = useState<string[]>([])
  const [requestDateRange, setRequestDateRange] = useState<
    DateRange | undefined
  >(buildInitialRange(selectedDate))
  const [localComment, setLocalComment] = useState("")
  const queryClient = useQueryClient()

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

  const { data: wardNurses } = useQuery({
    queryKey: ["ward-nurses", wardId],
    queryFn: () => ShiftRequestsService.getWardNurses({ wardId: wardId! }),
    enabled: wardId != null,
    staleTime: 5 * 60 * 1000,
  })

  const nurseOptions = useMemo(
    () =>
      (wardNurses ?? []).map((nurse) => ({
        value: String(nurse.nurseid),
        label: nurse.name,
        description: nurse.designation,
      })),
    [wardNurses],
  )

  const disabledDates = useMemo<Matcher[]>(
    () => [{ before: new Date(new Date().setHours(0, 0, 0, 0)) }],
    [],
  )

  const selectedNurseId =
    selectedNurse.length > 0 ? Number(selectedNurse[0]) : null

  const mutation = useMutation({
    mutationFn: (data: {
      startdate: string
      enddate: string
      leavetype: string
      nurseid: number
      reason?: string
    }) => LeaveRequestsService.createLeaveRequest(data),
    onSuccess: async () => {
      showSuccessToast("Leave request created!")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ward-leave-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] }),
      ])
      onClose()
    },
    onError: (error: unknown) => {
      const detail = (error as { body?: { detail?: string } })?.body?.detail
      showErrorToast(detail || "Failed to create request")
    },
  })

  useEffect(() => {
    if (isOpen) {
      setRequestDateRange(buildInitialRange(selectedDate))
      setLeaveType([])
      setSelectedNurse([])
      setLocalComment("")
      return
    }

    const timeoutId = window.setTimeout(cleanupOrphanedDialogState, 350)
    return () => window.clearTimeout(timeoutId)
  }, [isOpen, selectedDate])

  useEffect(
    () => () => {
      window.setTimeout(cleanupOrphanedDialogState, 0)
    },
    [],
  )

  const handleSubmit = () => {
    if (selectedNurse.length === 0) {
      showErrorToast("Please select a nurse.")
      return
    }
    if (selectedNurseId == null || Number.isNaN(selectedNurseId)) {
      showErrorToast("Please select a valid nurse.")
      return
    }
    if (leaveType.length === 0) {
      showErrorToast("Please select a leave type.")
      return
    }
    if (!requestDateRange?.from || !requestDateRange?.to) {
      showErrorToast("Please select a start and end date.")
      return
    }

    const toDateStr = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

    mutation.mutate({
      nurseid: selectedNurseId,
      startdate: toDateStr(requestDateRange.from),
      enddate: toDateStr(requestDateRange.to),
      leavetype: leaveType[0],
      reason: localComment.trim() || undefined,
    })
  }

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
          <Dialog.Content tabIndex={-1}>
            <Dialog.Header>
              <Dialog.Title color="primary" fontWeight="bold">
                Create Leave Request
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack alignItems="start" gap={4} maxWidth="320px">
                <SearchableNurseCombobox
                  items={nurseOptions}
                  value={selectedNurse}
                  onValueChange={setSelectedNurse}
                  placeholder="Search nurse"
                />

                <Select.Root
                  collection={leaveCollection}
                  size="sm"
                  value={leaveType}
                  onValueChange={(e) => setLeaveType(e.value)}
                >
                  <Select.Label>Requested Leave Type</Select.Label>
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
                    disabled={disabledDates}
                  />
                </VStack>

                <VStack align="stretch" gap={1} w="full">
                  <Text fontSize="xs" fontWeight="medium" color="gray.500">
                    Comment
                  </Text>
                  <Box position="relative">
                    <Textarea
                      value={localComment}
                      onChange={(event) => setLocalComment(event.target.value)}
                      placeholder="Add a comment..."
                      size="sm"
                      borderRadius="md"
                      borderColor="gray.200"
                      _focus={{
                        borderColor: "#4B8798",
                        boxShadow: "0 0 0 1px #4B8798",
                      }}
                      resize="none"
                      rows={3}
                      fontSize="sm"
                      pb="28px"
                    />
                    <Box
                      as="button"
                      position="absolute"
                      bottom="10px"
                      right="8px"
                      display="flex"
                      alignItems="center"
                      cursor="pointer"
                      color="gray.400"
                      _hover={{ color: "red.400" }}
                      transition="color 0.15s ease"
                      onClick={() => setLocalComment("")}
                      title="Clear comment"
                      zIndex={1}
                    >
                      <Trash2 size={13} />
                    </Box>
                  </Box>
                </VStack>
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} loading={mutation.isPending}>
                Create
              </Button>
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
