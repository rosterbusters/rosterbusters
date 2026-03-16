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
import { DatePickerDemo } from "@/components/Common/DatePicker";
import { LeaveRequestsService, ShiftRequestsService } from "@/client";

interface NewLeaveRequestProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate?: Date | null;
  wardId?: number | null;
  allowNurseOverride?: boolean;
}

export const NewLeaveRequest = ({
  isOpen,
  onClose,
  selectedDate,
  wardId,
  allowNurseOverride = false,
}: NewLeaveRequestProps) => {
  const [leaveType, setLeaveType] = useState<string[]>([]);
  const [selectedNurse, setSelectedNurse] = useState<string[]>([]);
  const [requestDate, setRequestDate] = useState<Date | undefined>(
    selectedDate ?? undefined,
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

  const { data: wardNurses } = useQuery({
    queryKey: ["ward-nurses", wardId],
    queryFn: () => ShiftRequestsService.getWardNurses({ wardId: wardId! }),
    enabled: allowNurseOverride && wardId != null,
    staleTime: 5 * 60 * 1000,
  });

  const nurseCollection = useMemo(
    () =>
      createListCollection({
        items: (wardNurses ?? []).map((nurse) => ({
          value: String(nurse.nurseid),
          label: nurse.name,
        })),
      }),
    [wardNurses],
  );

  const mutation = useMutation({
    mutationFn: (data: { startdate: string; enddate: string; leavetype: string; nurseid?: number }) =>
      LeaveRequestsService.createLeaveRequest(data),
    onSuccess: () => {
      showSuccessToast("Leave request created!");
      queryClient.invalidateQueries({ queryKey: ["ward-leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
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
      setSelectedNurse([]);
    }
  }, [isOpen, selectedDate]);

  const handleSubmit = () => {
    if (leaveType.length === 0) {
      showErrorToast("Please select a leave type.");
      return;
    }
    if (!requestDate) {
      showErrorToast("Please select a date.");
      return;
    }
    if (allowNurseOverride && selectedNurse.length === 0) {
      showErrorToast("Please select a nurse.");
      return;
    }

    const dateStr = `${requestDate.getFullYear()}-${String(requestDate.getMonth() + 1).padStart(2, "0")}-${String(requestDate.getDate()).padStart(2, "0")}`;

    mutation.mutate({
      startdate: dateStr,
      enddate: dateStr,
      leavetype: leaveType[0],
      nurseid: allowNurseOverride ? Number(selectedNurse[0]) : undefined,
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
                {allowNurseOverride && (
                  <Select.Root
                    collection={nurseCollection}
                    size="sm"
                    value={selectedNurse}
                    onValueChange={(e) => setSelectedNurse(e.value)}
                  >
                    <Select.Label>Nurse</Select.Label>
                    <Select.Control>
                      <Select.Trigger>
                        <Select.ValueText placeholder="Select Nurse" />
                      </Select.Trigger>
                      <Select.IndicatorGroup>
                        <Select.Indicator />
                      </Select.IndicatorGroup>
                    </Select.Control>
                    <Portal>
                      <Select.Positioner>
                        <Select.Content>
                          {nurseCollection.items.map((nurse) => (
                            <Select.Item item={nurse.value} key={nurse.value}>
                              {nurse.label}
                              <Select.ItemIndicator />
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Positioner>
                    </Portal>
                  </Select.Root>
                )}

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
