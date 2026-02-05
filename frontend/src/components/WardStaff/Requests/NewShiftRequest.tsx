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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tooltip } from "@/components/ui/tooltip";
import { AssignableStatus } from "./AssignableStatus";
import { shiftCollection } from "@/models/Shift";
import { DatePickerDemo } from "@/components/Common/DatePicker";
import { ShiftRequestsService, type ShiftRequestCreate } from "@/client";
import useCustomToast from "@/hooks/useCustomToast";

interface NewShiftRequestProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate?: Date | null;
}

export const NewShiftRequest = ({
  isOpen,
  onClose,
  selectedDate,
}: NewShiftRequestProps) => {
  const [shiftType, setShiftType] = useState<string[]>([]);
  const [requestDate, setRequestDate] = useState<Date | undefined>(
    selectedDate ?? undefined,
  );
  const { showSuccessToast, showErrorToast } = useCustomToast();
  const queryClient = useQueryClient();

  const { data: periods } = useQuery({
    queryKey: ["roster-periods"],
    queryFn: () => ShiftRequestsService.getRosterPeriods(),
  });

  const mutation = useMutation({
    mutationFn: (data: ShiftRequestCreate) =>
      ShiftRequestsService.createShiftRequest({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Shift request created!");
      queryClient.invalidateQueries({ queryKey: ["shift-requests"] });
      onClose();
    },
    onError: () => {
      showErrorToast("Failed to create request");
    },
  });
  
  useEffect(() => {
    setRequestDate(selectedDate ?? undefined);
  }, [selectedDate]);

  const handleSubmit = () => {
    const activePeriod = periods?.find((p) => p.status === "RequestOpen");
    if (!activePeriod || !requestDate || shiftType.length === 0) return;

    mutation.mutate({
      periodid: activePeriod.periodid,
      preferreddate: requestDate.toISOString().split("T")[0],
      preferredshifttype: shiftType[0],
    });
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
  );
};
