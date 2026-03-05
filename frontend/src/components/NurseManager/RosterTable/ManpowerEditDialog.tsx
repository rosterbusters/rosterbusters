import { useState, useEffect } from "react";
import {
  Button,
  ButtonGroup,
  Text,
  VStack,
  Box,
  Input,
  Flex,
  Stack,
} from "@chakra-ui/react";
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogCloseTrigger,
} from "@/components/ui/dialog";
import type { StaffRole, SummaryShiftType } from "./types";

const ROLE_LABEL: Record<StaffRole, string> = {
  RN: "RN",
  EN: "EN",
  NA: "NA",
  HCA12: "HCA1&2",
  HCA3: "HCA3",
};

const SHIFT_LABEL: Record<SummaryShiftType, string> = {
  A: "AM",
  P: "PM",
  N: "Night",
};

interface ManpowerEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  role: StaffRole;
  shiftType: SummaryShiftType;
  /** Human-readable date label, e.g. "Mon, Feb 24" */
  dateLabel: string;
  currentMin: number;
  currentMax?: number;
  /** Original unmodified ward default values — used for the reset action. */
  originalMin: number;
  originalMax?: number;
  onSave: (
    min: number,
    max: number | undefined,
    applyToAllDays: boolean,
  ) => void;
}

export function ManpowerEditDialog({
  isOpen,
  onClose,
  role,
  shiftType,
  dateLabel,
  currentMin,
  currentMax,
  originalMin,
  originalMax,
  onSave,
}: ManpowerEditDialogProps) {
  const [minValue, setMinValue] = useState<string>(String(currentMin));
  const [maxValue, setMaxValue] = useState<string>(
    currentMax !== undefined ? String(currentMax) : "",
  );
  const [applyToAllDays, setApplyToAllDays] = useState(true);

  // Reset form whenever the dialog opens or the cell selection changes
  useEffect(() => {
    if (isOpen) {
      setMinValue(String(currentMin));
      setMaxValue(currentMax !== undefined ? String(currentMax) : "");
      setApplyToAllDays(true);
    }
  }, [isOpen, currentMin, currentMax]);

  const handleSave = () => {
    const parsedMin = Math.max(0, parseInt(minValue, 10) || 0);
    const parsedMax =
      maxValue.trim() === ""
        ? undefined
        : Math.max(0, parseInt(maxValue, 10) || 0);
    onSave(parsedMin, parsedMax, applyToAllDays);
    onClose();
  };

  return (
    <DialogRoot
      size={{ base: "xl", md: "sm" }}
      placement="center"
      open={isOpen}
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogCloseTrigger />

        <DialogHeader pb={1}>
          <Stack gap={0} align="start">
            <DialogTitle color="#155E75" fontWeight="semibold">
              Edit Staffing Requirements
            </DialogTitle>
            <Text fontSize="xs" color="gray.500" mt={1}>
              {ROLE_LABEL[role]} &bull; {SHIFT_LABEL[shiftType]} Shift &bull; {dateLabel}
            </Text>
          </Stack>
        </DialogHeader>

        <DialogBody>
          <VStack gap={4} align="stretch">
            {/* Min / Max inputs */}
            <Box>
              <Text fontSize="xs" fontWeight="medium" color="gray.500" mb={1.5}>
                Minimum
              </Text>
              <Input
                type="number"
                value={minValue}
                onChange={(e) => setMinValue(e.target.value)}
                min={0}
                size="sm"
                borderColor="gray.200"
                _focus={{
                  borderColor: "#4B8798",
                  boxShadow: "0 0 0 1px #4B8798",
                }}
              />
            </Box>

            <Box>
              <Text fontSize="xs" fontWeight="medium" color="gray.500" mb={1.5}>
                Maximum{" "}
                <Text as="span" color="gray.400" fontWeight="normal">
                  (optional)
                </Text>
              </Text>
              <Input
                type="number"
                value={maxValue}
                onChange={(e) => setMaxValue(e.target.value)}
                min={0}
                placeholder="No maximum"
                size="sm"
                borderColor="gray.200"
                _focus={{
                  borderColor: "#4B8798",
                  boxShadow: "0 0 0 1px #4B8798",
                }}
              />
            </Box>

            {/* Scope toggle */}
            <Box borderTop="1px solid" borderColor="gray.100" pt={3}>
              <Text fontSize="xs" fontWeight="medium" color="gray.500" mb={2}>
                Apply to
              </Text>
              <Flex bg="gray.100" borderRadius="md" p="1" gap={1}>
                <Box
                  as="button"
                  flex={1}
                  px={3}
                  py={1.5}
                  borderRadius="sm"
                  fontSize="xs"
                  fontWeight="medium"
                  bg={applyToAllDays ? "#4B8798" : "transparent"}
                  color={applyToAllDays ? "white" : "gray.500"}
                  onClick={() => setApplyToAllDays(true)}
                  transition="all 0.15s ease"
                  textAlign="center"
                >
                  All future rosters
                </Box>
                <Box
                  as="button"
                  flex={1}
                  px={3}
                  py={1.5}
                  borderRadius="sm"
                  fontSize="xs"
                  fontWeight="medium"
                  bg={!applyToAllDays ? "#4B8798" : "transparent"}
                  color={!applyToAllDays ? "white" : "gray.500"}
                  onClick={() => setApplyToAllDays(false)}
                  transition="all 0.15s ease"
                  textAlign="center"
                >
                  Current roster only
                </Box>
              </Flex>
            </Box>
          </VStack>
        </DialogBody>

        <DialogFooter>
          <Flex w="100%" justify="space-between" align="center">
            {/* Reset link — left side */}
            <Box
              as="button"
              fontSize="xs"
              color="gray.400"
              _hover={{ color: "#C62828", textDecoration: "underline" }}
              transition="color 0.15s ease"
              onClick={() => {
                onSave(originalMin, originalMax, applyToAllDays);
                onClose();
              }}
            >
              ↺ Reset to ward default
            </Box>

            {/* Action buttons — right side */}
            <ButtonGroup size="sm">
              <Button
                variant="outline"
                borderColor="gray.200"
                color="gray.600"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                bg="#4B8798"
                color="white"
                _hover={{ bg: "#155E75" }}
                onClick={handleSave}
              >
                Save
              </Button>
            </ButtonGroup>
          </Flex>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
