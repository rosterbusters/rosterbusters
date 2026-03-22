import { useMemo } from "react";
import {
  Box,
  Button,
  Dialog,
  HStack,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react";
import moment from "moment";

import { useGenerationInputs } from "@/components/NurseManager/RosterTable";
import type { RosterRow } from "@/components/NurseManager/RosterTable";

interface AlgorithmInputsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  wardId: number | null;
  wardName?: string | null;
  periodId: number | null;
  periodName?: string | null;
  periodStartDate?: string | null;
  algorithmType?: "MILP" | "GA" | null;
  lastRunAt?: Date | null;
  lastRunMs?: number | null;
  rosterData?: RosterRow[];
}

type StaffingCounts = {
  AM: { A: number; B: number; C: number };
  PM: { A: number; B: number; C: number };
  NIGHT: { A: number; B: number; C: number };
};

const emptyStaffing: StaffingCounts = {
  AM: { A: 0, B: 0, C: 0 },
  PM: { A: 0, B: 0, C: 0 },
  NIGHT: { A: 0, B: 0, C: 0 },
};

export function AlgorithmInputsDialog({
  isOpen,
  onClose,
  wardId,
  wardName,
  periodId,
  periodName,
  periodStartDate,
  algorithmType,
  lastRunAt,
  lastRunMs,
  rosterData = [],
}: AlgorithmInputsDialogProps) {
  const generationInputsQuery = useGenerationInputs(wardId, periodId, isOpen);

  const hardRequestCount = useMemo(() => {
    const requests = generationInputsQuery.data?.hard_requests ?? {};
    return Object.values(requests).reduce((sum, items) => sum + items.length, 0);
  }, [generationInputsQuery.data?.hard_requests]);

  const softRequestCount = useMemo(() => {
    const requests = generationInputsQuery.data?.soft_requests ?? {};
    return Object.values(requests).reduce((sum, items) => sum + items.length, 0);
  }, [generationInputsQuery.data?.soft_requests]);

  const staffingSummary = useMemo<StaffingCounts>(() => {
    const firstDay = generationInputsQuery.data?.shifts?.[0];
    if (!firstDay) return emptyStaffing;
    return {
      AM: {
        A: firstDay.AM?.A ?? 0,
        B: firstDay.AM?.B ?? 0,
        C: firstDay.AM?.C ?? 0,
      },
      PM: {
        A: firstDay.PM?.A ?? 0,
        B: firstDay.PM?.B ?? 0,
        C: firstDay.PM?.C ?? 0,
      },
      NIGHT: {
        A: firstDay.NIGHT?.A ?? 0,
        B: firstDay.NIGHT?.B ?? 0,
        C: firstDay.NIGHT?.C ?? 0,
      },
    };
  }, [generationInputsQuery.data?.shifts]);

  const generationInputsJson = useMemo(() => {
    if (!generationInputsQuery.data) return "";
    return JSON.stringify(generationInputsQuery.data, null, 2);
  }, [generationInputsQuery.data]);

  const requestReview = useMemo(() => {
    if (!generationInputsQuery.data || !periodStartDate || rosterData.length === 0) {
      return null;
    }

    const toAlgoLabel = (shiftCode: string) => {
      const normalized = shiftCode.toUpperCase();
      if (normalized === "A") return "AM";
      if (normalized === "P") return "PM";
      if (normalized === "N") return "NIGHT";
      if (normalized === "AM" || normalized === "PM" || normalized === "NIGHT") return normalized;
      return "OFF";
    };

    const rosterLookup = new Map<number, Map<string, string>>();
    for (const row of rosterData) {
      const dateMap = new Map<string, string>();
      for (const [dateKey, shift] of Object.entries(row.shifts)) {
        if (!shift) continue;
        dateMap.set(dateKey, toAlgoLabel(shift.shiftCode));
      }
      rosterLookup.set(row.nurseId, dateMap);
    }

    type RequestEntry = {
      nurseId: number;
      date: string;
      requested: string;
      assigned: string | null;
      requestType: "hard" | "soft";
      matched: boolean;
    };

    const allRequests: RequestEntry[] = [];
    const start = moment(periodStartDate);

    const addRequests = (requestType: "hard" | "soft", data: Record<string, Array<[number, string]>>) => {
      for (const [nurseIdStr, reqs] of Object.entries(data)) {
        const nurseId = Number(nurseIdStr);
        for (const [dayIdx, requested] of reqs) {
          const dateKey = start.clone().add(dayIdx, "days").format("YYYY-MM-DD");
          const assigned = rosterLookup.get(nurseId)?.get(dateKey) ?? null;
          const matched = assigned != null && assigned === requested;
          allRequests.push({
            nurseId,
            date: dateKey,
            requested,
            assigned,
            requestType,
            matched,
          });
        }
      }
    };

    addRequests("hard", generationInputsQuery.data.hard_requests ?? {});
    addRequests("soft", generationInputsQuery.data.soft_requests ?? {});

    const matched = allRequests.filter((r) => r.matched);
    const unmatched = allRequests.filter((r) => !r.matched);

    return {
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
      rows: allRequests,
    };
  }, [generationInputsQuery.data, periodStartDate, rosterData]);

  const requestReviewText = useMemo(() => {
    if (!requestReview) return "";
    const lines = requestReview.rows.slice(0, 100).map((row) => {
      const status = row.matched ? "MATCHED" : "NOT MATCHED";
      const assigned = row.assigned ?? "—";
      return `${row.requestType.toUpperCase()} | Nurse ${row.nurseId} | ${row.date} | requested ${row.requested} | assigned ${assigned} | ${status}`;
    });
    if (requestReview.rows.length > 100) {
      lines.push(`…and ${requestReview.rows.length - 100} more`);
    }
    return lines.join("\n");
  }, [requestReview]);

  const formattedLastRun = useMemo(() => {
    if (!lastRunAt) return "—";
    return lastRunAt.toLocaleString();
  }, [lastRunAt]);

  const formattedDuration = useMemo(() => {
    if (!lastRunMs || lastRunMs <= 0) return "—";
    const totalSeconds = Math.round(lastRunMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }, [lastRunMs]);

  const cpuCount = generationInputsQuery.data?.cpu_count;
  const gaWorkers = generationInputsQuery.data?.ga_worker_count;

  return (
    <Dialog.Root
      placement="center"
      motionPreset="slide-in-bottom"
      open={isOpen}
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="820px">
            <Dialog.Header>
              <Dialog.Title>Algorithm Inputs</Dialog.Title>
            </Dialog.Header>
            <Dialog.CloseTrigger />
            <Dialog.Body>
              <VStack align="stretch" gap={4}>
                <Box>
                  <Text fontSize="sm" color="gray.600">
                    Ward: {wardName ?? "—"} • Period: {periodName ?? "—"}
                  </Text>
                  <Text fontSize="sm" color="gray.600">
                    Algorithm: {algorithmType ?? "Auto"}
                  </Text>
                  <Text fontSize="sm" color="gray.600">
                    Last run: {formattedLastRun} • Duration: {formattedDuration}
                  </Text>
                  <Text fontSize="sm" color="gray.600">
                    Cores: {cpuCount ?? "—"} • GA workers: {gaWorkers ?? "—"}
                  </Text>
                </Box>

                {generationInputsQuery.isLoading && (
                  <Text color="gray.500">Loading inputs…</Text>
                )}

                {generationInputsQuery.isError && (
                  <Text color="red.500">
                    Failed to load inputs. Please try again.
                  </Text>
                )}

                {generationInputsQuery.data && (
                  <>
                    <Box>
                      <Text fontSize="sm" color="gray.600" mb={2}>
                        Summary: {generationInputsQuery.data.nurses.length} nurses •{" "}
                        {hardRequestCount} hard requests • {softRequestCount} soft requests
                      </Text>
                    </Box>

                    <Box>
                      <Text fontSize="sm" color="gray.700" fontWeight="semibold" mb={1}>
                        Staffing Requirements (per day)
                      </Text>
                      <Text fontSize="sm" color="gray.600">
                        AM: A {staffingSummary.AM.A} • B {staffingSummary.AM.B} • C{" "}
                        {staffingSummary.AM.C}
                      </Text>
                      <Text fontSize="sm" color="gray.600">
                        PM: A {staffingSummary.PM.A} • B {staffingSummary.PM.B} • C{" "}
                        {staffingSummary.PM.C}
                      </Text>
                      <Text fontSize="sm" color="gray.600">
                        NIGHT: A {staffingSummary.NIGHT.A} • B {staffingSummary.NIGHT.B} • C{" "}
                        {staffingSummary.NIGHT.C}
                      </Text>
                    </Box>

                    <Box>
                      <Text fontSize="sm" color="gray.700" fontWeight="semibold" mb={1}>
                        Request Compliance Preview
                      </Text>
                      {requestReview ? (
                        <>
                          <Text fontSize="sm" color="gray.600" mb={2}>
                            Matched: {requestReview.matchedCount} • Not matched: {requestReview.unmatchedCount}
                          </Text>
                          <Box
                            as="pre"
                            fontSize="12px"
                            bg="gray.50"
                            borderRadius="md"
                            p={3}
                            overflow="auto"
                            maxH="220px"
                            whiteSpace="pre-wrap"
                          >
                            {requestReviewText || "No requests found."}
                          </Box>
                        </>
                      ) : (
                        <Text fontSize="sm" color="gray.500">
                          Run the algorithm to preview request matches.
                        </Text>
                      )}
                    </Box>

                    <Box>
                      <Text fontSize="sm" color="gray.700" fontWeight="semibold" mb={2}>
                        Raw Inputs
                      </Text>
                      <Box
                        as="pre"
                        fontSize="12px"
                        bg="gray.50"
                        borderRadius="md"
                        p={3}
                        overflow="auto"
                        maxH="420px"
                        whiteSpace="pre-wrap"
                      >
                        {generationInputsJson}
                      </Box>
                    </Box>
                  </>
                )}
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <HStack gap={3}>
                <Button
                  variant="outline"
                  onClick={onClose}
                  borderColor="#E6E6E6"
                  color="#4A4A4A"
                >
                  Close
                </Button>
              </HStack>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

export default AlgorithmInputsDialog;
