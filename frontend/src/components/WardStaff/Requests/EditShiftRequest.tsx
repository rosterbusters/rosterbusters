import { useState, useEffect } from "react";
import {
  Button,
  CloseButton,
  Dialog,
  Portal,
  Select,
  Badge,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Tooltip } from "@/components/ui/tooltip";
import { shiftCollection } from "@/models/Shift";
import { DatePickerDemo } from "@/components/Common/DatePicker";
import { ShiftRequestsService } from "@/client";
import useCustomToast from "@/hooks/useCustomToast";

interface EditShiftRequestProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: number;
  initialShiftType: string;
  initialDate: string; // YYYY-MM-DD
}

export const EditShiftRequest = ({
  isOpen,
  onClose,
  requestId,
  initialShiftType,
  initialDate,
}: EditShiftRequestProps) => {
  const [shiftType, setShiftType] = useState<string[]>([initialShiftType]);
  const [requestDate, setRequestDate] = useState<Date | undefined>(
    new Date(initialDate),
  );
  const { showSuccessToast, showErrorToast } = useCustomToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setShiftType([initialShiftType]);
    setRequestDate(new Date(initialDate));
  }, [initialShiftType, initialDate]);

  const updateMutation = useMutation({
    mutationFn: () =>
      ShiftRequestsService.updateShiftRequest({
        requestId,
        requestBody: {
          preferredshifttype: shiftType[0],
          preferreddate: requestDate?.toISOString().split("T")[0],
        },
      }),
    onSuccess: () => {
      showSuccessToast("Shift request updated!");
      queryClient.invalidateQueries({ queryKey: ["shift-requests"] });
      onClose();
    },
    onError: () => {
      showErrorToast("Failed to update request");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      ShiftRequestsService.deleteShiftRequest({ requestId }),
    onSuccess: () => {
      showSuccessToast("Shift request deleted!");
      queryClient.invalidateQueries({ queryKey: ["shift-requests"] });
      onClose();
    },
    onError: () => {
      showErrorToast("Failed to delete request");
    },
  });

  const handleSave = () => {
    if (shiftType.length === 0) {
      showErrorToast("Please select a shift type.");
      return;
    }
    if (!requestDate) {
      showErrorToast("Please select a date.");
      return;
    }
    updateMutation.mutate();
  };

  return (
    <Dialog.Root
      placement={"center"}
      motionPreset="slide-in-bottom"
      open={isOpen}
      onOpenChange={(e) => !e.open && onClose()}
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
                            <Tooltip content={code.description}>
                              <Badge variant={`${code.value}Shift` as any}>
                                {code.value}
                              </Badge>
                            </Tooltip>
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
                <Button variant="outline" onClick={() => deleteMutation.mutate()}
                loading={deleteMutation.isPending}>
                  Withdraw
                </Button>
                <Button
                  onClick={handleSave}
                  loading={updateMutation.isPending}
                >
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
  );
};
