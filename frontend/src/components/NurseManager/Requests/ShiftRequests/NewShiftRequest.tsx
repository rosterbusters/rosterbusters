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
import moment from "moment"
import { useEffect, useMemo, useState } from "react"
import { type ShiftRequestCreate, ShiftRequestsService } from "@/client"
import type { NursePublic, ShiftCodePublic } from "@/client/types.gen"
import { DatePickerDemo } from "@/components/Common/DatePicker"
import { cleanupOrphanedDialogState } from "@/components/Common/dialogCleanup"
import {
  useRosterPeriods,
  useRosterPeriodWindow,
} from "@/components/NurseManager/RosterTable/useRosterData"
import { showErrorToast, showSuccessToast } from "@/components/ui/toast"
import { SearchableNurseCombobox } from "../SearchableNurseCombobox"

const MAX_REQUESTS = 3
const API_BASE = import.meta.env.VITE_API_URL || ""

async function fetchRequestableShiftCodesByWard(
  wardId: number,
): Promise<ShiftCodePublic[]> {
  const token = localStorage.getItem("access_token") || ""
  const response = await fetch(
    `${API_BASE}/api/v1/shift-requests/shift-codes/requestable/ward/${wardId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error("Failed to load ward shift codes")
  }

  return response.json()
}

interface NewShiftRequestProps {
  isOpen: boolean
  onClose: () => void
  selectedDate?: Date | null
  wardId?: number | null
}

export const NewShiftRequest = ({
  isOpen,
  onClose,
  selectedDate,
  wardId,
}: NewShiftRequestProps) => {
  const [selectedNurse, setSelectedNurse] = useState<string[]>([])
  const [shiftType, setShiftType] = useState<string[]>([])
  const [localComment, setLocalComment] = useState("")
  const [requestDate, setRequestDate] = useState<Date | undefined>(
    selectedDate ?? undefined,
  )
  const queryClient = useQueryClient()

  const handleClose = () => {
    onClose()
    window.setTimeout(cleanupOrphanedDialogState, 350)
  }

  const { data: periodWindow } = useRosterPeriodWindow()
  const { data: periods = [] } = useRosterPeriods()
  const activePeriod = useMemo(() => {
    if (requestDate) {
      const matchingPeriod = periods.find((period) =>
        moment(requestDate).isBetween(
          moment(period.startDate),
          moment(period.endDate),
          "day",
          "[]",
        ),
      )

      if (matchingPeriod) {
        return matchingPeriod
      }
    }

    return (
      periodWindow?.requestOpenPeriod ?? periodWindow?.currentPeriod ?? null
    )
  }, [
    periodWindow?.currentPeriod,
    periodWindow?.requestOpenPeriod,
    periods,
    requestDate,
  ])

  const { data: wardNurses = [] } = useQuery<NursePublic[]>({
    queryKey: ["ward-nurses", wardId],
    queryFn: () => ShiftRequestsService.getWardNurses({ wardId: wardId! }),
    enabled: !!wardId,
    staleTime: 5 * 60 * 1000,
  })

  const { data: wardRequests = [] } = useQuery({
    queryKey: [
      "shift-requests",
      "ward",
      wardId,
      activePeriod?.periodId ?? null,
    ],
    queryFn: () =>
      ShiftRequestsService.getShiftRequestsByWard({
        wardId: wardId!,
        periodId: activePeriod?.periodId,
      }),
    enabled: !!wardId && !!activePeriod?.periodId,
    staleTime: 0,
  })

  const { data: shiftCodes } = useQuery({
    queryKey: ["shift-codes", "requestable", "ward", wardId],
    queryFn: () => fetchRequestableShiftCodesByWard(wardId!),
    enabled: wardId != null,
  })

  const requestableShiftCodes = useMemo(() => shiftCodes ?? [], [shiftCodes])

  const shiftCollection = useMemo(
    () =>
      createListCollection({
        items: requestableShiftCodes.map((sc) => ({
          value: sc.shiftcode,
          label: sc.shiftcode,
          description: sc.description,
        })),
      }),
    [requestableShiftCodes],
  )

  const nurseOptions = useMemo(
    () =>
      wardNurses.map((nurse) => ({
        value: String(nurse.nurseid),
        label: nurse.name,
        description: nurse.designation,
      })),
    [wardNurses],
  )

  const wardShiftCodeSet = useMemo(
    () => new Set((requestableShiftCodes ?? []).map((code) => code.shiftcode)),
    [requestableShiftCodes],
  )

  const selectedNurseId =
    selectedNurse.length > 0 ? Number(selectedNurse[0]) : null
  const selectedNurseRecord =
    selectedNurseId == null
      ? null
      : (wardNurses.find((nurse) => nurse.nurseid === selectedNurseId) ?? null)
  const selectedNurseRequestCount =
    activePeriod && selectedNurseId != null
      ? wardRequests.filter(
          (request) =>
            request.nurseid === selectedNurseId &&
            request.periodid === activePeriod.periodId &&
            wardShiftCodeSet.has(request.preferredshifttype),
        ).length
      : 0

  const mutation = useMutation({
    mutationFn: (data: ShiftRequestCreate) =>
      ShiftRequestsService.createShiftRequest({ requestBody: data }),
    onSuccess: async () => {
      showSuccessToast("Shift request created!")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shift-requests"] }),
        queryClient.invalidateQueries({
          queryKey: [
            "shift-requests",
            "ward",
            wardId,
            activePeriod?.periodId ?? null,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: ["shift-requests", "ward", wardId],
        }),
      ])
      handleClose()
    },
    onError: (error: unknown) => {
      const detail = (error as any)?.body?.detail
      showErrorToast(detail || "Failed to create request")
    },
  })

  useEffect(() => {
    if (isOpen) {
      setRequestDate(selectedDate ?? undefined)
      setShiftType([])
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
    if (wardId == null) {
      showErrorToast("Please select a ward first.")
      return
    }
    if (!activePeriod) {
      showErrorToast("There is no open request period available.")
      return
    }
    if (selectedNurseId == null) {
      showErrorToast("Please select a nurse.")
      return
    }
    if (shiftType.length === 0) {
      showErrorToast("Please select a shift type.")
      return
    }
    if (!requestDate) {
      showErrorToast("Please select a date.")
      return
    }

    mutation.mutate({
      nurseid: selectedNurseId,
      periodid: activePeriod.periodId,
      preferreddate: `${requestDate.getFullYear()}-${String(requestDate.getMonth() + 1).padStart(2, "0")}-${String(requestDate.getDate()).padStart(2, "0")}`,
      preferredshifttype: shiftType[0],
      reason: localComment.trim() || undefined,
    })
  }

  return (
    <Dialog.Root
      placement={"center"}
      motionPreset="slide-in-bottom"
      lazyMount
      unmountOnExit
      open={isOpen}
      onOpenChange={(e) => !e.open && handleClose()}
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
              <Dialog.Title color={"primary"} fontWeight={"bold"}>
                Create Shift Request
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack alignItems={"start"} gap={4} maxWidth={"320px"}>
                <SearchableNurseCombobox
                  items={nurseOptions}
                  value={selectedNurse}
                  onValueChange={setSelectedNurse}
                  placeholder="Search nurse"
                />

                {selectedNurseRecord ? (
                  <HStack gap={2}>
                    <Text color="foreground" fontWeight="light">
                      Assignable:
                    </Text>
                    <Badge variant="requests">
                      Requests: {MAX_REQUESTS - selectedNurseRequestCount}/
                      {MAX_REQUESTS}
                    </Badge>
                  </HStack>
                ) : null}

                <Select.Root
                  collection={shiftCollection}
                  size="sm"
                  value={shiftType}
                  onValueChange={(e) => setShiftType(e.value)}
                  disabled={
                    wardId == null || shiftCollection.items.length === 0
                  }
                >
                  <Select.Label>Requested Shift Type</Select.Label>
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText placeholder="Select Shift Type" />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.Indicator />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Portal>
                    <Select.Positioner>
                      <Select.Content>
                        {shiftCollection.items.map((code) => (
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
                <VStack alignItems={"start"}>
                  <Text fontWeight={"medium"}> Date Requesting</Text>
                  <DatePickerDemo
                    selected={requestDate}
                    onSelect={(date) => setRequestDate(date)}
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
              <Button variant="outline" onClick={handleClose}>
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
