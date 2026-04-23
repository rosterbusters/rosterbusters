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
  selectedRequestId?: number;
}

function parseRequestDate(value?: string | null): Date | undefined {
  if (!value) return undefined;

  const firstSegment = value.split("–")[0]?.trim() ?? value;
  const normalizedValue = firstSegment.replace(/\s+/g, " ").trim();
  const slashMatch = normalizedValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  const parsed = new Date(normalizedValue);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export const EditShiftRequest = ({
  isOpen,
  onClose,
  requests,
  wardId,
  selectedRequestId,
}: EditShiftRequestProps) => {
  const active = useMemo(
    () =>
      (selectedRequestId != null
        ? requests.find((request) => request.requestId === selectedRequestId)
        : undefined) ?? requests[0],
    [requests, selectedRequestId],
  );

  const [shiftType, setShiftType] = useState<string[]>([active?.initialShiftType ?? ""]);
  const [requestDate, setRequestDate] = useState<Date | undefined>(
    parseRequestDate(active?.initialDate),
  );

  useEffect(() => {
    if (active) {
      setShiftType([active.initialShiftType]);
      setRequestDate(parseRequestDate(active.initialDate));
    }
  }, [active]);

  const queryClient = useQueryClient();

  const { data: shiftCodes } = useQuery({
    queryKey: ["shift-codes", wardId ?? "default"],
    queryFn: () =>
      wardId != null
        ? ShiftRequestsService.getShiftCodesByWard({ wardId })
        : ShiftRequestsService.getAllShiftCodes(),
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
                <HStack alignItems="start">
                  <Text fontWeight={"medium"}>Nurse</Text>
                  <Text>{active.nurseName || "—"}</Text>
                </HStack>

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
