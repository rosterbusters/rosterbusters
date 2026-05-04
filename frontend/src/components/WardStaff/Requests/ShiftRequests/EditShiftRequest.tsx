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
import { ShiftRequestsService } from "@/client"
import type { ShiftCodePublic } from "@/client/types.gen"

import { DatePickerDemo } from "@/components/Common/DatePicker"
import { cleanupOrphanedDialogState } from "@/components/Common/dialogCleanup"
import { showErrorToast, showSuccessToast } from "@/components/ui/toast"

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

interface EditShiftRequestProps {
  isOpen: boolean
  onClose: () => void
  requestId: number
  initialShiftType: string
  initialDate: string // YYYY-MM-DD
  wardId?: number | null
}

function parseRequestDate(value?: string | null): Date | undefined {
  if (!value) return undefined

  const firstSegment = value.split("–")[0]?.trim() ?? value
  const normalizedValue = firstSegment.replace(/\s+/g, " ").trim()
  const slashMatch = normalizedValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)

  if (slashMatch) {
    const [, day, month, year] = slashMatch
    const parsed = new Date(Number(year), Number(month) - 1, Number(day))
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }

  const parsed = new Date(normalizedValue)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export const EditShiftRequest = ({
  isOpen,
  onClose,
  requestId,
  initialShiftType,
  initialDate,
  wardId,
}: EditShiftRequestProps) => {
  const [shiftType, setShiftType] = useState<string[]>([initialShiftType])
  const [requestDate, setRequestDate] = useState<Date | undefined>(
    parseRequestDate(initialDate),
  )
  const queryClient = useQueryClient()

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

  useEffect(() => {
    setShiftType([initialShiftType])
    setRequestDate(parseRequestDate(initialDate))
  }, [initialShiftType, initialDate])

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

  const updateMutation = useMutation({
    mutationFn: () =>
      ShiftRequestsService.updateShiftRequest({
        requestId,
        requestBody: {
          preferredshifttype: shiftType[0],
          preferreddate: requestDate
            ? `${requestDate.getFullYear()}-${String(requestDate.getMonth() + 1).padStart(2, "0")}-${String(requestDate.getDate()).padStart(2, "0")}`
            : undefined,
        },
      }),
    onSuccess: () => {
      showSuccessToast("Shift request updated!")
      queryClient.invalidateQueries({ queryKey: ["shift-requests"] })
      onClose()
    },
    onError: (error: unknown) => {
      const detail = (error as any)?.body?.detail
      showErrorToast(detail || "Failed to update request")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => ShiftRequestsService.deleteShiftRequest({ requestId }),
    onSuccess: () => {
      showSuccessToast("Shift request deleted!")
      queryClient.invalidateQueries({ queryKey: ["shift-requests"] })
      onClose()
    },
    onError: (error: unknown) => {
      const detail = (error as any)?.body?.detail
      showErrorToast(detail || "Failed to delete request")
    },
  })

  const handleSave = () => {
    if (wardId == null) {
      showErrorToast("No ward is linked to your account.")
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
    updateMutation.mutate()
  }

  return (
    <Dialog.Root
      placement={"center"}
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
              <Dialog.Title color={"primary"} fontWeight={"bold"}>
                Edit Shift Request
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack alignItems={"start"} gap={4} maxWidth={"225px"}>
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
                  <Text fontWeight={"medium"}>Date Requesting</Text>
                  <DatePickerDemo
                    selected={requestDate}
                    onSelect={(date) => setRequestDate(date)}
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
