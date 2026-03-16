import { useEffect, useMemo, useState } from "react";
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
} from "@chakra-ui/react";
import { Trash2 } from "lucide-react";
import {
  SHIFT_CODE_MAP,
  type ShiftCode,
} from "@/components/NurseManager/RosterTable/types";
import { EditShiftRequest, type ShiftRequestEntry } from "./EditShiftRequest";

// Reverse map: full description -> shift code letter.
const SHIFT_NAME_TO_CODE: Record<string, string> = {
  "Day Shift": "D",
  "AM Shift": "A",
  "PM Shift": "P",
  "Night Shift": "N",
  "Night 12h": "N-12",
};

interface ReviewShiftRequestProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: number;
  nurseName: string | null;
  shiftCode: string;
  date: string;
  status: string;
  comment?: string | null;
  wardId?: number | null;
  requests?: ReviewShiftRequestEntry[];
  onAction: (requestId: number, action: "Approved" | "Rejected", comment: string) => void;
}

interface ReviewShiftRequestEntry extends ShiftRequestEntry {
  status: string;
  comment?: string | null;
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
  const requestOptions = useMemo<ReviewShiftRequestEntry[]>(
    () =>
      requests && requests.length > 0
        ? requests
        : [
            {
              requestId,
              nurseName: nurseName ?? "",
              initialShiftType: shiftCode,
              initialDate: date,
              status,
              comment,
            },
          ],
    [comment, date, nurseName, requestId, requests, shiftCode, status],
  );
  const [selectedIdx, setSelectedIdx] = useState(0);
  const activeRequest = requestOptions[selectedIdx] ?? requestOptions[0];
  const [localComment, setLocalComment] = useState<string>(activeRequest?.comment ?? "");
  const [isEditOpen, setIsEditOpen] = useState(false);

  const nurseCollection = useMemo(
    () =>
      createListCollection({
        items: requestOptions.map((request, index) => ({
          value: String(index),
          label: request.nurseName || `Nurse ${index + 1}`,
        })),
      }),
    [requestOptions],
  );

  useEffect(() => {
    if (isOpen) {
      setSelectedIdx(0);
      setLocalComment(requestOptions[0]?.comment ?? comment ?? "");
    } else {
      setIsEditOpen(false);
    }
  }, [comment, isOpen, requestOptions]);

  useEffect(() => {
    if (activeRequest) {
      setLocalComment(activeRequest.comment ?? "");
    }
  }, [activeRequest]);

  const handleAction = (action: "Approved" | "Rejected") => {
    onAction(activeRequest.requestId, action, localComment);
    onClose();
  };

  const statusColor =
    activeRequest.status === "Approved"
      ? "#16a34a"
      : activeRequest.status === "Rejected"
        ? "#dc2626"
        : "#d97706";

  const activeShiftCode = activeRequest?.initialShiftType ?? shiftCode;
  const resolvedCode: string = SHIFT_CODE_MAP[activeShiftCode as ShiftCode]
    ? activeShiftCode
    : (SHIFT_NAME_TO_CODE[activeShiftCode] ?? activeShiftCode);
  const shiftDescription =
    SHIFT_CODE_MAP[resolvedCode as ShiftCode]?.description ?? activeShiftCode;

  return (
    <>
      <Dialog.Root
        placement="center"
        motionPreset="slide-in-bottom"
        open={isOpen}
        onOpenChange={(e) => !e.open && onClose()}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content maxW="520px">
              <Dialog.Header>
                <Dialog.Title color="primary" fontWeight="bold">
                  Review Shift Request
                </Dialog.Title>
              </Dialog.Header>

              <Dialog.Body>
                <VStack align="stretch" gap={4}>
                  {requestOptions.length > 1 && (
                    <Select.Root
                      collection={nurseCollection}
                      size="sm"
                      value={[String(selectedIdx)]}
                      onValueChange={(e) => setSelectedIdx(Number(e.value[0]))}
                    >
                      <Select.Label>Nurse</Select.Label>
                      <Select.Control>
                        <Select.Trigger>
                          <Select.ValueText placeholder="Select nurse" />
                        </Select.Trigger>
                        <Select.IndicatorGroup>
                          <Select.Indicator />
                        </Select.IndicatorGroup>
                      </Select.Control>
                      <Portal>
                        <Select.Positioner>
                          <Select.Content>
                            {nurseCollection.items.map((item) => (
                              <Select.Item item={item.value} key={item.value}>
                                {item.label}
                                <Select.ItemIndicator />
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Positioner>
                      </Portal>
                    </Select.Root>
                  )}

                  <HStack gap={2}>
                    <Text fontWeight="medium" color="gray.600" minW="70px">
                      Nurse:
                    </Text>
                    <Text color="#4A4A4A">{activeRequest?.nurseName || "—"}</Text>
                  </HStack>

                  <HStack gap={2}>
                    <Text fontWeight="medium" color="gray.600" minW="70px">
                      Date:
                    </Text>
                    <Text color="#4A4A4A">{activeRequest?.initialDate ?? date}</Text>
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
                      {activeRequest?.status ?? status}
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
                <HStack gap={2} justify="space-between" w="full">
                  <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
                    Edit Request
                  </Button>
                  <HStack gap={2}>
                    <Button
                      variant="outline"
                      colorPalette="red"
                      size="sm"
                      onClick={() => handleAction("Rejected")}
                    >
                      Deny
                    </Button>
                    <Button
                      bg="#4B8798"
                      color="white"
                      _hover={{ bg: "#3d6f7e" }}
                      size="sm"
                      onClick={() => handleAction("Approved")}
                    >
                      Approve
                    </Button>
                  </HStack>
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
        requests={requestOptions.map((request) => ({
          requestId: request.requestId,
          nurseName: request.nurseName,
          initialShiftType: request.initialShiftType,
          initialDate: request.initialDate,
        }))}
        wardId={wardId}
        selectedRequestId={activeRequest?.requestId}
      />
    </>
  );
};
