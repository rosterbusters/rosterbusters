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
  SHIFT_COLOR_MAP,
  type ShiftCode,
} from "@/components/NurseManager/RosterTable/types";

// Reverse map: full leave description → leave code
// Covers all non-working entries in SHIFT_CODE_MAP
const LEAVE_NAME_TO_CODE: Record<string, string> = {
  "Annual Leave": "AL",
  "Medical Certificate": "MC",
  "Urgent Leave": "URG",
  "Birthday Leave": "BCL",
  "Childcare Leave": "CCL",
  "Marriage Leave": "ML",
  "Compassionate Leave": "CL",
  "Extended Marriage Leave": "EML",
  "Day Off": "DO",
};

interface ReviewLeaveRequestProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: number;
  nurseName: string | null;
  leaveType: string;
  date: string;
  status: string;
  comment?: string | null;
  onAction: (requestId: number, action: "Approved" | "Rejected", comment: string) => void;
}

export const ReviewLeaveRequest = ({
  isOpen,
  onClose,
  requestId,
  nurseName,
  leaveType,
  date,
  status,
  comment,
  onAction,
}: ReviewLeaveRequestProps) => {
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

  // Normalise: resolve code from full name if needed
  const resolvedCode: string = SHIFT_CODE_MAP[leaveType as ShiftCode]
    ? leaveType
    : (LEAVE_NAME_TO_CODE[leaveType] ?? leaveType);
  const leaveDescription =
    SHIFT_CODE_MAP[resolvedCode as ShiftCode]?.description ?? leaveType;
  const badgeColor =
    SHIFT_COLOR_MAP[resolvedCode as ShiftCode] ?? "#9db8c0";

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
                Review Leave Request
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

                {/* Leave type: badge + full name */}
                <HStack gap={2} align="center">
                  <Text fontWeight="medium" color="gray.600" minW="70px">
                    Leave:
                  </Text>
                  <HStack gap={2} align="center">
                    <Badge
                      bg={badgeColor}
                      color="white"
                      fontWeight="bold"
                      fontSize="xs"
                      px={2}
                      py={0.5}
                      rounded="md"
                      textTransform="none"
                    >
                      {resolvedCode}
                    </Badge>
                    <Text color="#4A4A4A">{leaveDescription}</Text>
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
                <VStack align="stretch" gap={1}>
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
