import {
  Button,
  CloseButton,
  Dialog,
  Portal,
  Badge,
  Text,
  VStack,
  HStack,
} from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShiftRequestsService } from "@/client";
import useCustomToast from "@/hooks/useCustomToast";

interface NMReviewShiftRequestProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: number;
  shiftType: string;
  preferredDate: string;
  nurseName: string;
  currentStatus: string;
}

export const NMReviewShiftRequest = ({
  isOpen,
  onClose,
  requestId,
  shiftType,
  preferredDate,
  nurseName,
  currentStatus,
}: NMReviewShiftRequestProps) => {
  const { showSuccessToast, showErrorToast } = useCustomToast();
  const queryClient = useQueryClient();

  const reviewMutation = useMutation({
    mutationFn: (status: "Approved" | "Rejected") =>
      ShiftRequestsService.reviewShiftRequest({
        requestId,
        requestBody: { status },
      }),
    onSuccess: (_, status) => {
      showSuccessToast(`Request ${status.toLowerCase()}.`);
      queryClient.invalidateQueries({ queryKey: ["shift-requests"] });
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as any)?.body?.detail;
      showErrorToast(detail || "Failed to update request");
    },
  });

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
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title color="primary" fontWeight="bold">
                Review Shift Request
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack alignItems="start" gap={3}>
                <HStack>
                  <Text fontWeight="medium" color="foreground">Nurse:</Text>
                  <Text>{nurseName}</Text>
                </HStack>
                <HStack>
                  <Text fontWeight="medium" color="foreground">Date:</Text>
                  <Text>{preferredDate}</Text>
                </HStack>
                <HStack>
                  <Text fontWeight="medium" color="foreground">Shift:</Text>
                  <Badge variant={`${shiftType}Shift` as any}>{shiftType}</Badge>
                </HStack>
                <HStack>
                  <Text fontWeight="medium" color="foreground">Status:</Text>
                  <Text>{currentStatus}</Text>
                </HStack>
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <HStack gap={2}>
                <Button
                  colorPalette="red"
                  variant="outline"
                  onClick={() => reviewMutation.mutate("Rejected")}
                  loading={reviewMutation.isPending}
                  disabled={currentStatus === "Rejected"}
                >
                  Deny
                </Button>
                <Button
                  onClick={() => reviewMutation.mutate("Approved")}
                  loading={reviewMutation.isPending}
                  disabled={currentStatus === "Approved"}
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
