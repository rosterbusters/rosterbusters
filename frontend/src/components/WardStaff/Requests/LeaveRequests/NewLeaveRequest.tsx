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
import { Tooltip } from "@/components/ui/tooltip";
import { DatePickerDemo } from "@/components/Common/DatePicker";
import { ShiftRequestsService, type ShiftRequestCreate } from "@/client";
import useCustomToast from "@/hooks/useCustomToast";

interface NewLeaveRequestProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate?: Date | null;
  wardId?: number | null;
}

export const NewLeaveRequest = ({
  isOpen,
  onClose,
  selectedDate,
  wardId,
}: NewLeaveRequestProps) => {
  const [leaveType, setLeaveType] = useState<string[]>([]);
  const [requestDate, setRequestDate] = useState<Date | undefined>(
    selectedDate ?? undefined,
  );
  const { showSuccessToast, showErrorToast } = useCustomToast();
  const queryClient = useQueryClient();

  const { data: periods } = useQuery({
    queryKey: ["roster-periods"],
    queryFn: () => ShiftRequestsService.getRosterPeriods(),
  });

  const { data: leaveCodes } = useQuery({
    queryKey: ["leave-codes"],
    queryFn: () => ShiftRequestsService.getLeaveCodes(),
    staleTime: 5 * 60 * 1000,
  });

  const leaveCollection = useMemo(
    () =>
      createListCollection({
        items: (leaveCodes ?? []).filter((lc) => lc.shiftcode !== "DO" && lc.shiftcode !== "RD").map((lc) => ({
          value: lc.shiftcode,
          label: lc.shiftcode,
          description: lc.description,
        })),
      }),
    [leaveCodes],
  );

  const mutation = useMutation({
    mutationFn: (data: ShiftRequestCreate) =>
      ShiftRequestsService.createShiftRequest({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Leave request created!");
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
      setLeaveType([]);
    }
  }, [isOpen]);

  const handleSubmit = () => {
    const activePeriod =
      periods?.find(
        (p) =>
          p.status === "RequestOpen" &&
          new Date(p.startdate) <= new Date() &&
          new Date(p.enddate) >= new Date(),
      ) ?? periods?.find((p) => p.status === "RequestOpen");

    if (!activePeriod) {
      showErrorToast("There is no open request period available.");
      return;
    }
    if (leaveType.length === 0) {
      showErrorToast("Please select a leave type.");
      return;
    }
    if (!requestDate) {
      showErrorToast("Please select a date.");
      return;
    }

    mutation.mutate({
      periodid: activePeriod.periodid,
      preferreddate: `${requestDate.getFullYear()}-${String(requestDate.getMonth() + 1).padStart(2, "0")}-${String(requestDate.getDate()).padStart(2, "0")}`,
      preferredshifttype: leaveType[0],
    });
  };

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
                Create Leave Request
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack alignItems="start" gap={4} maxWidth="225px">
                <Select.Root
                  collection={leaveCollection}
                  size="sm"
                  value={leaveType}
                  onValueChange={(e) => setLeaveType(e.value)}
                >
                  <Select.Label>Requested Leave Type</Select.Label>
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText placeholder="Select Leave Type" />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.Indicator />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Portal>
                    <Select.Positioner>
                      <Select.Content>
                        {leaveCollection.items.map((code) => (
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
                <VStack alignItems="start">
                  <Text fontWeight="medium">Dates Requesting</Text>
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
