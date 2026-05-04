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
import { type ShiftRequestCreate, ShiftRequestsService } from "@/client"
import type { ShiftCodePublic } from "@/client/types.gen"
import { DatePickerDemo } from "@/components/Common/DatePicker"
import { showErrorToast, showSuccessToast } from "@/components/ui/toast"
import {
  getRequestTargetPeriod,
  useRequestPeriodWindow,
} from "@/hooks/useApplicationLockStatus"
import { AssignableStatus } from "./AssignableStatus"

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
  const [shiftType, setShiftType] = useState<string[]>([])
  const [requestDate, setRequestDate] = useState<Date | undefined>(
    selectedDate ?? undefined,
  )
  const queryClient = useQueryClient()

  const { data: periodWindow } = useRequestPeriodWindow()

  const { data: shiftCodes = [] } = useQuery({
    queryKey: ["shift-codes", "requestable", "ward", wardId],
    queryFn: () => fetchRequestableShiftCodesByWard(wardId!),
    enabled: wardId != null,
  })

  const shiftCollection = useMemo(
    () =>
      createListCollection({
        items: shiftCodes.map((sc) => ({
          value: sc.shiftcode,
          label: sc.shiftcode,
          description: sc.description,
        })),
      }),
    [shiftCodes],
  )

  const mutation = useMutation({
    mutationFn: (data: ShiftRequestCreate) =>
      ShiftRequestsService.createShiftRequest({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Shift request created!")
      queryClient.invalidateQueries({ queryKey: ["shift-requests"] })
      onClose()
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
    }
  }, [isOpen, selectedDate])

  const handleSubmit = () => {
    if (wardId == null) {
      showErrorToast("No ward is linked to your account.")
      return
    }
    const activePeriod = getRequestTargetPeriod(periodWindow)
    if (!activePeriod) {
      showErrorToast("There is no roster period available.")
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
      periodid: activePeriod.periodid,
      preferreddate: `${requestDate.getFullYear()}-${String(requestDate.getMonth() + 1).padStart(2, "0")}-${String(requestDate.getDate()).padStart(2, "0")}`,
      preferredshifttype: shiftType[0],
    })
  }

  return (
    <Dialog.Root
      placement={"center"}
      motionPreset="slide-in-bottom"
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
              <Dialog.Title color={"primary"} fontWeight={"bold"}>
                Create Shift Request
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack alignItems={"start"} gap={4} maxWidth={"225px"}>
                <AssignableStatus />
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
                          <Select.Item
                            item={code.value}
                            key={code.value}
                            data-testid={`shift-type-option-${code.value}`}
                          >
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
