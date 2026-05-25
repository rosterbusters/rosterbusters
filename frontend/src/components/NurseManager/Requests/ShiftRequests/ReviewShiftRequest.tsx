import {
  Badge,
  Box,
  Button,
  CloseButton,
  Dialog,
  HStack,
  Portal,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { ShiftRequestsService } from "@/client"
import { cleanupOrphanedDialogState } from "@/components/Common/dialogCleanup"
import {
  SHIFT_CODE_MAP,
  type ShiftCode,
} from "@/components/NurseManager/RosterTable/types"
import { showErrorToast, showSuccessToast } from "@/components/ui/toast"
import { SearchableNurseCombobox } from "../SearchableNurseCombobox"
import { EditShiftRequest, type ShiftRequestEntry } from "./EditShiftRequest"

const SHIFT_NAME_TO_CODE: Record<string, string> = {
  "Day Shift": "D",
  "AM Shift": "A",
  "PM Shift": "P",
  "Night Shift": "N",
  "Night 12h": "N-12",
}

interface ReviewShiftRequestOption {
  requestId: number
  nurseName: string
  shiftCode: string
  date: string
  status: string
  comment?: string | null
}

interface ReviewShiftRequestProps {
  isOpen: boolean
  onClose: () => void
  requestId: number
  nurseName: string | null
  shiftCode: string
  date: string
  status: string
  comment?: string | null
  wardId?: number | null
  requests?: ReviewShiftRequestOption[]
  onAction?: (
    requestId: number,
    action: "Approved" | "Rejected",
    comment: string,
  ) => void
}

function resolveShiftCode(value?: string | null): string {
  if (!value) return ""
  return SHIFT_CODE_MAP[value as ShiftCode]
    ? value
    : (SHIFT_NAME_TO_CODE[value] ?? value)
}

export const ReviewShiftRequest = ({
  isOpen,
  onClose,
  requestId,
  nurseName,
  shiftCode,
  date,
  status,
  comment,
  wardId,
  requests,
  onAction,
}: ReviewShiftRequestProps) => {
  const requestOptions = useMemo(
    () =>
      requests && requests.length > 0
        ? requests
        : [
            {
              requestId,
              nurseName: nurseName ?? "Unknown Nurse",
              shiftCode,
              date,
              status,
              comment,
            },
          ],
    [comment, date, nurseName, requestId, requests, shiftCode, status],
  )

  const [selectedIdx, setSelectedIdx] = useState(0)
  const [localComment, setLocalComment] = useState<string>(
    requestOptions[0]?.comment ?? comment ?? "",
  )
  const [isEditOpen, setIsEditOpen] = useState(false)
  const queryClient = useQueryClient()

  const activeRequest = requestOptions[selectedIdx] ?? requestOptions[0]

  const nurseOptions = useMemo(
    () =>
      requestOptions.map((request, index) => ({
        value: String(index),
        label: request.nurseName || `Nurse ${index + 1}`,
      })),
    [requestOptions],
  )

  const reviewMutation = useMutation({
    mutationFn: (action: "Approved" | "Rejected") =>
      ShiftRequestsService.reviewShiftRequest({
        requestId: activeRequest.requestId,
        requestBody: {
          status: action,
          rejectionreason:
            action === "Rejected"
              ? localComment.trim() || undefined
              : undefined,
        },
      }),
    onSuccess: (_, action) => {
      showSuccessToast(`Request ${action.toLowerCase()}.`)
      queryClient.invalidateQueries({ queryKey: ["shift-requests"] })
      onClose()
    },
    onError: (error: unknown) => {
      const detail = (error as { body?: { detail?: string } })?.body?.detail
      showErrorToast(detail || "Failed to update request")
    },
  })

  useEffect(() => {
    if (!isOpen) return
    setSelectedIdx(0)
    setLocalComment(requestOptions[0]?.comment ?? comment ?? "")
  }, [comment, isOpen, requestOptions])

  useEffect(() => {
    if (!activeRequest) return
    setLocalComment(activeRequest.comment ?? "")
  }, [activeRequest])

  useEffect(() => {
    if (!isOpen) {
      setIsEditOpen(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen || isEditOpen) {
      return
    }

    const timeoutId = window.setTimeout(cleanupOrphanedDialogState, 350)
    return () => window.clearTimeout(timeoutId)
  }, [isEditOpen, isOpen])

  useEffect(
    () => () => {
      window.setTimeout(cleanupOrphanedDialogState, 0)
    },
    [],
  )

  const handleAction = (action: "Approved" | "Rejected") => {
    if (onAction) {
      onAction(activeRequest.requestId, action, localComment)
      onClose()
      return
    }
    reviewMutation.mutate(action)
  }

  const statusColor =
    activeRequest.status === "Approved"
      ? "#16a34a"
      : activeRequest.status === "Rejected"
        ? "#dc2626"
        : "#d97706"

  const resolvedCode = resolveShiftCode(activeRequest.shiftCode)
  const shiftDescription =
    SHIFT_CODE_MAP[resolvedCode as ShiftCode]?.description ??
    activeRequest.shiftCode

  const editRequests: ShiftRequestEntry[] = requestOptions.map((request) => ({
    requestId: request.requestId,
    nurseName: request.nurseName,
    initialShiftType: request.shiftCode,
    initialDate: request.date,
  }))

  return (
    <>
      <Dialog.Root
        placement="center"
        motionPreset="slide-in-bottom"
        lazyMount
        unmountOnExit
        open={isOpen}
        onOpenChange={(e) => !e.open && onClose()}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content tabIndex={-1} maxW="520px">
              <Dialog.Header>
                <Dialog.Title color="primary" fontWeight="bold">
                  Review Shift Request
                </Dialog.Title>
              </Dialog.Header>

              <Dialog.Body>
                <VStack align="stretch" gap={3}>
                  {requestOptions.length > 1 ? (
                    <SearchableNurseCombobox
                      items={nurseOptions}
                      value={[String(selectedIdx)]}
                      onValueChange={(value) => {
                        if (value[0]) {
                          setSelectedIdx(Number(value[0]))
                        }
                      }}
                      placeholder="Search nurse"
                    />
                  ) : null}

                  <HStack gap={2}>
                    <Text fontWeight="medium" color="gray.600" minW="70px">
                      Nurse:
                    </Text>
                    <Text color="#4A4A4A">
                      {activeRequest.nurseName ?? "—"}
                    </Text>
                  </HStack>

                  <HStack gap={2}>
                    <Text fontWeight="medium" color="gray.600" minW="70px">
                      Date:
                    </Text>
                    <Text color="#4A4A4A">{activeRequest.date}</Text>
                  </HStack>

                  <HStack gap={2} align="center">
                    <Text fontWeight="medium" color="gray.600" minW="70px">
                      Shift:
                    </Text>
                    <HStack gap={2} align="center">
                      <Badge variant={`${resolvedCode}Shift` as any}>
                        {resolvedCode}
                      </Badge>
                      <Text color="#4A4A4A">{shiftDescription}</Text>
                    </HStack>
                  </HStack>

                  <HStack gap={2}>
                    <Text fontWeight="medium" color="gray.600" minW="70px">
                      Status:
                    </Text>
                    <Text fontWeight="medium" color={statusColor}>
                      {activeRequest.status}
                    </Text>
                  </HStack>

                  <VStack align="stretch" gap={2}>
                    <Text fontSize="xs" fontWeight="medium" color="gray.500">
                      Comment
                    </Text>
                    <Box position="relative">
                      <Textarea
                        value={localComment}
                        onChange={(e) => setLocalComment(e.target.value)}
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
                <HStack gap={2}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditOpen(true)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    colorPalette="red"
                    size="sm"
                    onClick={() => handleAction("Rejected")}
                    loading={reviewMutation.isPending}
                    disabled={activeRequest.status === "Rejected"}
                  >
                    Deny
                  </Button>
                  <Button
                    bg="#4B8798"
                    color="white"
                    _hover={{ bg: "#3d6f7e" }}
                    size="sm"
                    onClick={() => handleAction("Approved")}
                    loading={reviewMutation.isPending}
                    disabled={activeRequest.status === "Approved"}
                  >
                    Approve
                  </Button>
                </HStack>
              </Dialog.Footer>

              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <EditShiftRequest
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        requests={editRequests}
        wardId={wardId}
      />
    </>
  )
}
