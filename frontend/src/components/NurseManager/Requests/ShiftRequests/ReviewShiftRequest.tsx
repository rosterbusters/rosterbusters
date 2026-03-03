import { useState, useEffect } from "react";
import {
  Box,
  Button,
  CloseButton,
  Dialog,
  Portal,
  Text,
  Textarea,
  VStack,
  HStack,
  Badge,
} from "@chakra-ui/react";
import { Trash2 } from "lucide-react";
import {
  SHIFT_CODE_MAP,
  type ShiftCode,
} from "@/components/NurseManager/RosterTable/types";

// Reverse map: full description → shift code letter
// Needed when the prop arrives as a full name instead of a code (e.g. mock data fallback)
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
  onAction: (requestId: number, action: "Approved" | "Rejected", comment: string) => void;
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
  onAction,
}: ReviewShiftRequestProps) => {
  const [localComment, setLocalComment] = useState<string>(comment ?? "");

  // Sync when modal opens with fresh data
  useEffect(() => {
    if (isOpen) setLocalComment(comment ?? "");
  }, [isOpen, comment]);

  const handleAction = (action: "Approved" | "Rejected") => {
    onAction(requestId, action, localComment);
    onClose();
  };

  const statusColor =
    status === "Approved"
      ? "#16a34a"
      : status === "Rejected"
        ? "#dc2626"
        : "#d97706";

  // Normalise: if prop is a full name (e.g. "Day Shift"), resolve to code letter ("D")
  const resolvedCode: string = SHIFT_CODE_MAP[shiftCode as ShiftCode]
    ? shiftCode
    : (SHIFT_NAME_TO_CODE[shiftCode] ?? shiftCode);
  const shiftDescription =
    SHIFT_CODE_MAP[resolvedCode as ShiftCode]?.description ?? shiftCode;

  return (
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
              <VStack align="stretch" gap={3}>
                {/* Nurse */}
                <HStack gap={2}>
                  <Text fontWeight="medium" color="gray.600" minW="70px">
                    Nurse:
                  </Text>
                  <Text color="#4A4A4A">{nurseName ?? "—"}</Text>
                </HStack>

                {/* Date */}
                <HStack gap={2}>
                  <Text fontWeight="medium" color="gray.600" minW="70px">
                    Date:
                  </Text>
                  <Text color="#4A4A4A">{date}</Text>
                </HStack>

                {/* Shift: badge + full name */}
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

                {/* Status */}
                <HStack gap={2}>
                  <Text fontWeight="medium" color="gray.600" minW="70px">
                    Status:
                  </Text>
                  <Text fontWeight="medium" color={statusColor}>
                    {status}
                  </Text>
                </HStack>

                {/* Comment */}
                <VStack align="stretch" gap={2}>
                  <Text
                    fontSize="xs"
                    fontWeight="medium"
                    color="gray.500"
                  >
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
            </Dialog.Footer>

            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};