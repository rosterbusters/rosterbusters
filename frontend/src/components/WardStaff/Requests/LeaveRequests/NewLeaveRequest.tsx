import { useState, useEffect, useMemo } from "react";
import {
  Button,
  CloseButton,
  createListCollection,
  Dialog,
  Portal,
  Select,
  Badge,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { showErrorToast, showSuccessToast } from "@/components/ui/toast";

import { DatePickerDemo } from "@/components/Common/DatePicker";
import { cleanupOrphanedDialogState } from "@/components/Common/dialogCleanup";
import { LeaveRequestsService, ShiftRequestsService } from "@/client";
import type { DateRange, Matcher } from "react-day-picker";

interface NewLeaveRequestProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate?: Date | null;
  wardId?: number | null;
  allowNurseOverride?: boolean;
}

function buildInitialRange(selectedDate?: Date | null): DateRange | undefined {
  return selectedDate
    ? {
        from: selectedDate,
        to: selectedDate,
      }
    : undefined;
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
  const [requestDateRange, setRequestDateRange] = useState<DateRange | undefined>(
    buildInitialRange(selectedDate),
  );
  const queryClient = useQueryClient();
  const disabledDates = useMemo<Matcher[]>(
    () => [{ before: new Date(new Date().setHours(0, 0, 0, 0)) }],
    [],
  );

  const { data: leaveCodes } = useQuery({
    queryKey: ["leave-codes"],
    queryFn: () => LeaveRequestsService.getLeaveCodes(),
    staleTime: 5 * 60 * 1000,
  });

  const leaveCollection = useMemo(
    () =>
      createListCollection({
        items: (leaveCodes ?? [])
          .filter((lc) => lc.shiftcode !== "MC")
          .map((lc) => ({
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
      setRequestDateRange(buildInitialRange(selectedDate));
      setLeaveType([]);
      setSelectedNurse([]);
      return;
    }

    const timeoutId = window.setTimeout(cleanupOrphanedDialogState, 350);
    return () => window.clearTimeout(timeoutId);
  }, [isOpen, selectedDate]);

  useEffect(
    () => () => {
      window.setTimeout(cleanupOrphanedDialogState, 0);
    },
    [],
  );

  const handleSubmit = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (leaveType.length === 0) {
      showErrorToast("Please select a leave type.");
      return;
    }
    if (!requestDateRange?.from || !requestDateRange?.to) {
      showErrorToast("Please select a start and end date.");
      return;
    }
    if (requestDateRange.from < today || requestDateRange.to < today) {
      showErrorToast("Leave requests cannot start or end before today.");
      return;
    }
    if (allowNurseOverride && selectedNurse.length === 0) {
      showErrorToast("Please select a nurse.");
      return;
    }

    const toDateStr = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    mutation.mutate({
      nurseid: allowNurseOverride ? Number(selectedNurse[0]) : undefined,
      startdate: toDateStr(requestDateRange.from),
      enddate: toDateStr(requestDateRange.to),
      leavetype: leaveType[0],
    });
  };

  return (
    <Dialog.Root
      placement="center"
      motionPreset="slide-in-bottom"
      lazyMount
      unmountOnExit
      open={isOpen}
      onOpenChange={(e) => !e.open && onClose()}
      onInteractOutside={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-datepicker-popup='true']")) {
          event.preventDefault();
        }
      }}
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
                          <Select.Item item={code.value} key={code.value} data-testid={`leave-type-option-${code.value}`}>
                            <HStack gap={2}>
                              <Badge variant={`${code.value}Shift` as any}>
                                {code.value}
                              </Badge>
                              <Text fontSize="sm">{code.description}</Text>
                            </HStack>
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
                    mode="range"
                    selected={requestDateRange}
                    onSelect={(range) => setRequestDateRange(range)}
                    placeholder="Pick a date range"
                    disabled={disabledDates}
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
