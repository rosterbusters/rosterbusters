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
  HStack,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { showErrorToast, showSuccessToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { DatePickerDemo } from "@/components/Common/DatePicker";
import { LeaveRequestsService } from "@/client";

interface NMReviewLeaveRequestProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  nurseName: string;
  currentStatus: string;
}

export const NMReviewLeaveRequest = ({
  isOpen,
  onClose,
  requestId,
  leaveType,
  startDate,
  endDate,
  nurseName,
}: NMReviewLeaveRequestProps) => {
  const [selectedLeaveType, setSelectedLeaveType] = useState<string[]>([leaveType]);
  const [requestDate, setRequestDate] = useState<Date | undefined>(
    new Date(startDate),
  );
  const queryClient = useQueryClient();

  const { data: leaveCodes } = useQuery({
    queryKey: ["leave-codes"],
    queryFn: () => LeaveRequestsService.getLeaveCodes(),
    staleTime: 5 * 60 * 1000,
  });

  const leaveCollection = useMemo(
    () =>
      createListCollection({
        items: (leaveCodes ?? []).map((lc) => ({
          value: lc.shiftcode,
          label: lc.shiftcode,
          description: lc.description,
        })),
      }),
    [leaveCodes],
  );

  useEffect(() => {
    setSelectedLeaveType([leaveType]);
    setRequestDate(new Date(startDate));
  }, [leaveType, startDate, isOpen]);

  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const updateMutation = useMutation({
    mutationFn: () =>
      LeaveRequestsService.updateLeaveRequest({
        leaveId: requestId,
        leavetype: selectedLeaveType[0],
        startdate: requestDate ? toDateStr(requestDate) : undefined,
        enddate: requestDate ? toDateStr(requestDate) : undefined,
      }),
    onSuccess: () => {
      showSuccessToast("Leave request updated!");
      queryClient.invalidateQueries({ queryKey: ["ward-leave-requests"] });
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as any)?.body?.detail;
      showErrorToast(detail || "Failed to update request");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      LeaveRequestsService.deleteLeaveRequest({ leaveId: requestId }),
    onSuccess: () => {
      showSuccessToast("Leave request withdrawn.");
      queryClient.invalidateQueries({ queryKey: ["ward-leave-requests"] });
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as any)?.body?.detail;
      showErrorToast(detail || "Failed to withdraw request");
    },
  });

  const handleSave = () => {
    if (selectedLeaveType.length === 0) {
      showErrorToast("Please select a leave type.");
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
                Edit Leave Request
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack alignItems="start" gap={4} maxWidth="225px">
                <HStack>
                  <Text fontWeight="medium" color="foreground">Nurse:</Text>
                  <Text>{nurseName}</Text>
                </HStack>
                <Select.Root
                  collection={leaveCollection}
                  size="sm"
                  value={selectedLeaveType}
                  onValueChange={(e) => setSelectedLeaveType(e.value)}
                >
                  <Select.Label>Leave Type</Select.Label>
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
                  <Text fontWeight="medium">Date Requesting</Text>
                  <DatePickerDemo
                    selected={requestDate}
                    onSelect={(date) => setRequestDate(date)}
                  />
                </VStack>
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <VStack gap={2} flexDirection="row">
                <Button
                  variant="outline"
                  onClick={() => deleteMutation.mutate()}
                  loading={deleteMutation.isPending}
                >
                  Withdraw
                </Button>
                <Button onClick={handleSave} loading={updateMutation.isPending}>
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
