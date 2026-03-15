import { useState, useEffect, useMemo } from "react";
import {
  Button,
  CloseButton,
  createListCollection,
  Dialog,
  Portal,
  Select,
  Badge,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { showErrorToast, showSuccessToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { AssignableStatus } from "./AssignableStatus";
import { DatePickerDemo } from "@/components/Common/DatePicker";
import { ShiftRequestsService, type ShiftRequestCreate } from "@/client";

interface NewShiftRequestProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate?: Date | null;
  wardId?: number | null;
}

export const NewShiftRequest = ({
  isOpen,
  onClose,
  selectedDate,
  wardId,
}: NewShiftRequestProps) => {
  const [shiftType, setShiftType] = useState<string[]>([]);
  const [requestDate, setRequestDate] = useState<Date | undefined>(
    selectedDate ?? undefined,
  );
  const queryClient = useQueryClient();

  const { data: periods } = useQuery({
    queryKey: ["roster-periods"],
    queryFn: () => ShiftRequestsService.getRosterPeriods(),
  });

  const { data: shiftCodes } = useQuery({
    queryKey: ["shift-codes", wardId ?? "default"],
    queryFn: () =>
      wardId != null
        ? ShiftRequestsService.getShiftCodesByWard({ wardId })
        : ShiftRequestsService.getWorkingShiftCodes(),
    // enabled: wardId !== undefined,
  });

  const shiftCollection = useMemo(
    () =>
      createListCollection({
        items: (shiftCodes ?? []).map((sc) => ({
          value: sc.shiftcode,
          label: sc.shiftcode,
          description: sc.description,
        })),
      }),
    [shiftCodes],
  );

  const mutation = useMutation({
    mutationFn: (data: ShiftRequestCreate) =>
      ShiftRequestsService.createShiftRequest({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Shift request created!");
      queryClient.invalidateQueries({ queryKey: ["shift-requests"] });
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as any)?.body?.detail;
      showErrorToast(detail || "Failed to create request");
    },
  });
  
  useEffect(() => {
    if (isOpen) {
      setRequestDate(selectedDate ?? undefined);
      setShiftType([]);
    }
  }, [isOpen]);

  const handleSubmit = () => {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const activePeriod =
      periods?.find(p => p.status === "RequestOpen" && p.startdate <= todayStr && p.enddate >= todayStr)
      ?? periods?.find(p => p.status === "RequestOpen");
    if (!activePeriod) {
      showErrorToast("There is no open request period available.");
      return;
    }
    if (shiftType.length === 0) {
      showErrorToast("Please select a shift type.");
      return;
    }
    if (!requestDate) {
      showErrorToast("Please select a date.");
      return;
    }

    mutation.mutate({
      periodid: activePeriod.periodid,
      preferreddate: `${requestDate.getFullYear()}-${String(requestDate.getMonth() + 1).padStart(2, "0")}-${String(requestDate.getDate()).padStart(2, "0")}`,
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
