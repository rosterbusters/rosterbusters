import { useState } from "react";
import {
  Button,
  ButtonGroup,
  Text,
  Textarea,
  VStack,
  HStack,
  Badge,
  Box,
} from "@chakra-ui/react";
import { CheckCircle, XCircle } from "lucide-react";
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogCloseTrigger,
} from "@/components/ui/dialog";

export type RequestStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";
export type RequestType = "ShiftRequest" | "LeaveRequest";

export interface UnifiedRequest {
  id: number;
  type: RequestType;
  requestTypeName: string;
  requestedDates: string;
  status: RequestStatus;
  applicationDate: string;
  comments: string | null;
}

interface RequestReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: UnifiedRequest | null;
  onSubmit: (requestId: number, action: "Approved" | "Rejected", comment: string) => void;
}

export function RequestReviewModal({
  isOpen,
  onClose,
  request,
  onSubmit,
}: RequestReviewModalProps) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAction = async (action: "Approved" | "Rejected") => {
    if (!request) return;
    setIsSubmitting(true);
    onSubmit(request.id, action, comment);
    setComment("");
    setIsSubmitting(false);
    onClose();
  };

  const handleClose = () => {
    setComment("");
    onClose();
  };

  const statusColor = (status: RequestStatus) => {
    switch (status) {
      case "Pending":
        return "cyan";
      case "Approved":
        return "green";
      case "Rejected":
        return "red";
      default:
        return "gray";
    }
  };

  return (
    <DialogRoot
      size={{ base: "sm", md: "md" }}
      placement="center"
      open={isOpen}
      onOpenChange={({ open }) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle color="primary" fontWeight="semibold">
            {request?.status === "Pending" ? "Review Request" : "Update Request Status"}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          <VStack align="stretch" gap={4}>
            {/* Request details */}
            <Box
              bg="background2"
              rounded="md"
              p={4}
              borderWidth="1px"
              borderColor="border"
            >
              <VStack align="stretch" gap={2}>
                <HStack justify="space-between">
                  <Text fontSize="sm" color="gray.500">Type</Text>
                  <Text fontSize="sm" fontWeight="medium" color="#4A4A4A">
                    {request?.type === "ShiftRequest" ? "Shift Request" : "Leave Request"}
                  </Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontSize="sm" color="gray.500">Request Type</Text>
                  <Text fontSize="sm" fontWeight="medium" color="#4A4A4A">
                    {request?.requestTypeName}
                  </Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontSize="sm" color="gray.500">Requested Dates</Text>
                  <Text fontSize="sm" fontWeight="medium" color="#4A4A4A">
                    {request?.requestedDates}
                  </Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontSize="sm" color="gray.500">Application Date</Text>
                  <Text fontSize="sm" fontWeight="medium" color="#4A4A4A">
                    {request?.applicationDate}
                  </Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontSize="sm" color="gray.500">Current Status</Text>
                  <Badge colorPalette={statusColor(request?.status ?? "Pending")} size="sm">
                    {request?.status}
                  </Badge>
                </HStack>
                {request?.comments && (
                  <HStack justify="space-between" align="flex-start">
                    <Text fontSize="sm" color="gray.500">Comments</Text>
                    <Text fontSize="sm" fontWeight="medium" color="#4A4A4A" maxW="60%" textAlign="right">
                      {request.comments}
                    </Text>
                  </HStack>
                )}
              </VStack>
            </Box>

            {/* Comment field */}
            <VStack align="stretch" gap={1}>
              <Text fontSize="sm" fontWeight="medium" color="#4A4A4A">
                Comment (optional)
              </Text>
              <Textarea
                placeholder="Add a comment or reason for your decision..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                borderColor="border"
                _focus={{ borderColor: "#4B8798", boxShadow: "0 0 0 1px #4B8798" }}
                fontSize="sm"
                resize="vertical"
              />
            </VStack>
          </VStack>
        </DialogBody>

        <DialogFooter>
          <ButtonGroup gap={2}>
            <Button
              variant="ghost"
              colorPalette="gray"
              onClick={handleClose}
              disabled={isSubmitting}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              colorPalette="red"
              onClick={() => handleAction("Rejected")}
              loading={isSubmitting}
              size="sm"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </Button>
            <Button
              variant="solid"
              bg="#4B8798"
              color="white"
              _hover={{ bg: "#3d6f7e" }}
              onClick={() => handleAction("Approved")}
              loading={isSubmitting}
              size="sm"
            >
              <CheckCircle className="h-4 w-4" />
              Approve
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

