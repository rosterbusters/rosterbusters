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
import { ShiftRequestsService } from "@/client";

export interface ShiftRequestEntry {
  requestId: number;
  nurseName: string;
  initialShiftType: string;
  initialDate: string;
}

interface EditShiftRequestProps {
  isOpen: boolean;
  onClose: () => void;
  requests: ShiftRequestEntry[];
  wardId?: number | null;
}

export const EditShiftRequest = ({
  isOpen,
  onClose,
  requests,
  wardId,
}: EditShiftRequestProps) => {
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Reset to first entry whenever the dialog opens or requests change
  useEffect(() => {
    if (isOpen) setSelectedIdx(0);
  }, [isOpen, requests]);

  const active = requests[selectedIdx] ?? requests[0];

  const [shiftType, setShiftType] = useState<string[]>([active?.initialShiftType ?? ""]);
  const [requestDate, setRequestDate] = useState<Date | undefined>(
    active ? new Date(active.initialDate) : undefined,
  );

  // Sync form fields when selected nurse changes
  useEffect(() => {
    if (active) {
      setShiftType([active.initialShiftType]);
      setRequestDate(new Date(active.initialDate));
    }
  }, [selectedIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const queryClient = useQueryClient();

  const { data: shiftCodes } = useQuery({
    queryKey: ["shift-codes", wardId ?? "default"],
    queryFn: () =>
      wardId != null
        ? ShiftRequestsService.getShiftCodesByWard({ wardId })
        : ShiftRequestsService.getWorkingShiftCodes(),
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

  const nurseCollection = useMemo(
    () =>
      createListCollection({
        items: requests.map((r, i) => ({ value: String(i), label: r.nurseName })),
      }),
    [requests],
  );

  const updateMutation = useMutation({
    mutationFn: () =>
      ShiftRequestsService.updateShiftRequest({
        requestId: active.requestId,
        requestBody: {
          preferredshifttype: shiftType[0],
          preferreddate: requestDate
            ? `${requestDate.getFullYear()}-${String(requestDate.getMonth() + 1).padStart(2, "0")}-${String(requestDate.getDate()).padStart(2, "0")}`
            : undefined,
        },
      }),
    onSuccess: () => {
      showSuccessToast("Shift request updated!");
      queryClient.invalidateQueries({ queryKey: ["shift-requests"] });
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as any)?.body?.detail;
      showErrorToast(detail || "Failed to update request");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      ShiftRequestsService.deleteShiftRequest({ requestId: active.requestId }),
    onSuccess: () => {
      showSuccessToast("Shift request deleted!");
      queryClient.invalidateQueries({ queryKey: ["shift-requests"] });
      onClose();
    },
    onError: (error: unknown) => {
      const detail = (error as any)?.body?.detail;
      showErrorToast(detail || "Failed to delete request");
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

  if (!active) return null;

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
                {requests.length > 1 && (
                  <Select.Root
                    collection={nurseCollection}
                    size="sm"
                    value={[String(selectedIdx)]}
                    onValueChange={(e) => setSelectedIdx(Number(e.value[0]))}
                  >
                    <Select.Label>Nurse</Select.Label>
                    <Select.Control>
                      <Select.Trigger>
                        <Select.ValueText placeholder="Select nurse" />
                      </Select.Trigger>
                      <Select.IndicatorGroup>
                        <Select.Indicator />
                      </Select.IndicatorGroup>
                    </Select.Control>
                    <Portal>
                      <Select.Positioner>
                        <Select.Content>
                          {nurseCollection.items.map((item) => (
                            <Select.Item item={item.value} key={item.value}>
                              {item.label}
                              <Select.ItemIndicator />
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Positioner>
                    </Portal>
                  </Select.Root>
                )}

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
