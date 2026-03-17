import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Button,
  CloseButton,
  createListCollection,
  Dialog,
  Portal,
  Select,
  Badge,
  Text,
  Textarea,
  VStack,
  HStack,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { showErrorToast, showSuccessToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { DatePickerDemo } from "@/components/Common/DatePicker";
import { LeaveRequestsService } from "@/client";
import { Trash2 } from "lucide-react";

function parseRequestDate(value: string) {
  const normalized = value.split("–")[0]?.trim() ?? value;
  const [day, month, year] = normalized.split("/");
  if (day && month && year) {
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return new Date(normalized);
}

interface NMReviewLeaveRequestProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  nurseName: string;
  currentStatus: string;
  requests?: Array<{
    requestId: number;
    nurseName: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    status: string;
  }>;
}

export const NMReviewLeaveRequest = ({
  isOpen,
  onClose,
  requestId,
  leaveType,
  startDate,
  endDate,
  nurseName,
  currentStatus,
  requests,
}: NMReviewLeaveRequestProps) => {
  const requestOptions = useMemo(
    () =>
      requests && requests.length > 0
        ? requests
        : [
            {
              requestId,
              nurseName,
              leaveType,
              startDate,
              endDate,
              status: currentStatus,
            },
          ],
    [currentStatus, endDate, leaveType, nurseName, requestId, requests, startDate],
  );
  const [selectedIdx, setSelectedIdx] = useState(0);
  const activeRequest = requestOptions[selectedIdx] ?? requestOptions[0];
  const [selectedLeaveType, setSelectedLeaveType] = useState<string[]>([
    activeRequest?.leaveType ?? leaveType,
  ]);
  const [requestDate, setRequestDate] = useState<Date | undefined>(
    parseRequestDate(activeRequest?.startDate ?? startDate),
  );
  const [localComment, setLocalComment] = useState("");
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

  const nurseCollection = useMemo(
    () =>
      createListCollection({
        items: requestOptions.map((request, index) => ({
          value: String(index),
          label: request.nurseName || `Nurse ${index + 1}`,
        })),
      }),
    [requestOptions],
  );

  useEffect(() => {
    if (!isOpen) return;

    setSelectedIdx(0);
    setSelectedLeaveType([requestOptions[0]?.leaveType ?? leaveType]);
    setRequestDate(parseRequestDate(requestOptions[0]?.startDate ?? startDate));
    setLocalComment("");
  }, [isOpen, leaveType, requestOptions, startDate]);

  useEffect(() => {
    if (!activeRequest) return;

    setSelectedLeaveType([activeRequest.leaveType]);
    setRequestDate(parseRequestDate(activeRequest.startDate));
    setLocalComment("");
  }, [activeRequest]);

  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const updateMutation = useMutation({
    mutationFn: () =>
      LeaveRequestsService.updateLeaveRequest({
        leaveId: activeRequest.requestId,
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
      LeaveRequestsService.deleteLeaveRequest({ leaveId: activeRequest.requestId }),
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
                {requestOptions.length > 1 && (
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
                <VStack align="stretch" gap={1} w="full">
                  <Text fontSize="xs" fontWeight="medium" color="gray.500">
                    Comment
                  </Text>
                  <Box position="relative">
                    <Textarea
                      value={localComment}
                      onChange={(e) => setLocalComment(e.target.value)}
                      placeholder="Add a comment..."
                      size="sm"
                      borderRadius="md"
                      borderColor="gray.200"
                      _focus={{
                        borderColor: "#4B8798",
                        boxShadow: "0 0 0 1px #4B8798",
                      }}
                      resize="none"
                      rows={3}
                      fontSize="sm"
                      pb="28px"
                    />
                    <Box
                      as="button"
                      position="absolute"
                      bottom="10px"
                      right="8px"
                      display="flex"
                      alignItems="center"
                      cursor="pointer"
                      color="gray.400"
                      _hover={{ color: "red.400" }}
                      transition="color 0.15s ease"
                      onClick={() => setLocalComment("")}
                      title="Clear comment"
                      zIndex={1}
                    >
                      <Trash2 size={13} />
                    </Box>
                  </Box>
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
