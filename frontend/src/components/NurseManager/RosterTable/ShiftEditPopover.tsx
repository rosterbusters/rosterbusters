import { useState, useRef, useEffect } from "react";
import {
  Box,
  Flex,
  Text,
  Button,
  VStack,
  Portal,
} from "@chakra-ui/react";
import { X } from "lucide-react";
import { ShiftBadge } from "./ShiftBadge";
import { 
  type ShiftCode, 
  type ShiftAssignment,
  SHIFT_CODE_MAP,
} from "./types";

interface ShiftEditPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  currentShift: ShiftAssignment | null;
  nurseName: string;
  date: string;
  onShiftChange: (shiftCode: ShiftCode) => void;
  anchorEl: HTMLElement | null;
}

// Working shifts
const WORKING_SHIFTS: ShiftCode[] = ['D', 'A', 'PM', 'N', 'N-12'];
// Non-working shifts
const NON_WORKING_SHIFTS: ShiftCode[] = ['DO', 'AL', 'MC', 'URG'];

export function ShiftEditPopover({
  isOpen,
  onClose,
  currentShift,
  nurseName,
  date,
  onShiftChange,
  anchorEl,
}: ShiftEditPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Calculate position based on anchor element
  useEffect(() => {
    if (anchorEl && isOpen) {
      const rect = anchorEl.getBoundingClientRect();
      const popoverWidth = 280;
      const popoverHeight = 320;
      
      let left = rect.left + rect.width / 2 - popoverWidth / 2;
      let top = rect.bottom + 8;

      // Adjust if going off screen
      if (left < 10) left = 10;
      if (left + popoverWidth > window.innerWidth - 10) {
        left = window.innerWidth - popoverWidth - 10;
      }
      if (top + popoverHeight > window.innerHeight - 10) {
        top = rect.top - popoverHeight - 8;
      }

      setPosition({ top, left });
    }
  }, [anchorEl, isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(event.target as Node) &&
        anchorEl &&
        !anchorEl.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose, anchorEl]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleShiftSelect = (shiftCode: ShiftCode) => {
    onShiftChange(shiftCode);
    onClose();
  };

  return (
    <Portal>
      <Box
        ref={popoverRef}
        position="fixed"
        top={`${position.top}px`}
        left={`${position.left}px`}
        zIndex={1000}
        bg="white"
        borderRadius="lg"
        boxShadow="lg"
        border="1px solid"
        borderColor="gray.200"
        w="280px"
        overflow="hidden"
      >
        {/* Header */}
        <Flex
          justify="space-between"
          align="center"
          p={3}
          borderBottom="1px solid"
          borderColor="gray.100"
          bg="gray.50"
        >
          <VStack align="start" gap={0}>
            <Text fontSize="sm" fontWeight="semibold" color="#155E75">
              Edit Shift
            </Text>
            <Text fontSize="xs" color="gray.500">
              {nurseName} • {date}
            </Text>
          </VStack>
          <Button
            size="xs"
            variant="ghost"
            onClick={onClose}
            p={1}
            minW="auto"
            h="auto"
            color="gray.400"
            _hover={{ color: "gray.600", bg: "gray.100" }}
          >
            <X className="h-4 w-4" />
          </Button>
        </Flex>

        {/* Content */}
        <Box p={3}>
          {/* Current Shift Display */}
          {currentShift && (
            <Flex align="center" gap={2} mb={3} pb={3} borderBottom="1px solid" borderColor="gray.100">
              <Text fontSize="xs" color="gray.500">Current:</Text>
              <ShiftBadge 
                shiftCode={currentShift.shiftCode} 
                isEditable={false} 
                size="sm" 
              />
              <Text fontSize="xs" color="gray.600">
                {SHIFT_CODE_MAP[currentShift.shiftCode]?.description}
              </Text>
            </Flex>
          )}

          {/* Working Shifts Section */}
          <Box mb={3}>
            <Text fontSize="xs" fontWeight="medium" color="gray.500" mb={2}>
              Working Shifts
            </Text>
            <Flex flexWrap="wrap" gap={2}>
              {WORKING_SHIFTS.map((code) => (
                <Box
                  key={code}
                  onClick={() => handleShiftSelect(code)}
                  cursor="pointer"
                  borderRadius="md"
                  p={1}
                  border="2px solid"
                  borderColor={currentShift?.shiftCode === code ? "#4B8798" : "transparent"}
                  _hover={{ borderColor: "#4B8798", bg: "gray.50" }}
                  transition="all 0.15s ease"
                >
                  <VStack gap={0}>
                    <ShiftBadge shiftCode={code} isEditable={false} size="sm" />
                    <Text fontSize="xs" color="gray.500" mt={1}>
                      {SHIFT_CODE_MAP[code]?.description.split(" ")[0]}
                    </Text>
                  </VStack>
                </Box>
              ))}
            </Flex>
          </Box>

          {/* Non-Working Shifts Section */}
          <Box>
            <Text fontSize="xs" fontWeight="medium" color="gray.500" mb={2}>
              Off / Leave
            </Text>
            <Flex flexWrap="wrap" gap={2}>
              {NON_WORKING_SHIFTS.map((code) => (
                <Box
                  key={code}
                  onClick={() => handleShiftSelect(code)}
                  cursor="pointer"
                  borderRadius="md"
                  p={1}
                  border="2px solid"
                  borderColor={currentShift?.shiftCode === code ? "#4B8798" : "transparent"}
                  _hover={{ borderColor: "#4B8798", bg: "gray.50" }}
                  transition="all 0.15s ease"
                >
                  <VStack gap={0}>
                    <ShiftBadge shiftCode={code} isEditable={false} size="sm" />
                    <Text fontSize="xs" color="gray.500" mt={1}>
                      {code}
                    </Text>
                  </VStack>
                </Box>
              ))}
            </Flex>
          </Box>
        </Box>
      </Box>
    </Portal>
  );
}

export default ShiftEditPopover;

