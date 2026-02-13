import { useState, useEffect } from "react";
import {
  Box,
  Flex,
  Text,
  VStack,
  Portal,
  HStack,
  Popover,
  IconButton
} from "@chakra-ui/react";
import { X, ChevronDown } from "lucide-react";
  
import { usePopoverContext } from "@chakra-ui/react"
import { ShiftBadge } from "./ShiftBadge";
import {
  type ShiftCode,
  type ShiftAssignment,
  SHIFT_CODE_MAP,
  SHIFT_COLOR_MAP,
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
const WORKING_SHIFTS: ShiftCode[] = ['D', 'A', 'P', 'N', 'N-12'];
// Non-working shifts
const NON_WORKING_SHIFTS: ShiftCode[] = ['DO', 'AL', 'MC', 'URG'];

interface ShiftDropdownProps {
  label: string;
  options: ShiftCode[];
  selectedShift: ShiftCode | null;
  onSelect: (code: ShiftCode) => void;
}

function ShiftDropdown({ label, options, selectedShift, onSelect }: ShiftDropdownProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const selectedOption = options.find((code) => code === selectedShift);

  return (
    <Box>
      <Text fontSize="xs" fontWeight="medium" color="gray.500" mb={1}>
        {label}
      </Text>
      {/* Dropdown trigger */}
      <Box
        border="1px solid"
        borderColor={isDropdownOpen ? "#4B8798" : "gray.200"}
        borderRadius="md"
        px={3}
        py={2}
        cursor="pointer"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        _hover={{ borderColor: "#4B8798" }}
        transition="all 0.15s ease"
        bg="white"
      >
        <Flex justify="space-between" align="center">
          {selectedOption ? (
            <HStack gap={2}>
              <Box
                bg={SHIFT_COLOR_MAP[selectedOption]}
                color="white"
                px={2}
                py={0.5}
                borderRadius="md"
                fontSize="xs"
                fontWeight="semibold"
                minW="32px"
                textAlign="center"
              >
                {selectedOption}
              </Box>
              <Text fontSize="sm" color="gray.700">
                {SHIFT_CODE_MAP[selectedOption]?.description}
              </Text>
            </HStack>
          ) : (
            <Text fontSize="sm" color="gray.400">
              Select {label.toLowerCase()}
            </Text>
          )}
          <Box
            transform={isDropdownOpen ? "rotate(180deg)" : "rotate(0deg)"}
            transition="transform 0.15s ease"
          >
            <ChevronDown size={16} color="#9CA3AF" />
          </Box>
        </Flex>
      </Box>

      {/* Dropdown list */}
      {isDropdownOpen && (
        <Box
          border="1px solid"
          borderColor="gray.200"
          borderRadius="md"
          mt={1}
          overflow="hidden"
          bg="white"
          boxShadow="sm"
        >
          {options.map((code) => (
            <Flex
              key={code}
              align="center"
              gap={2}
              px={3}
              py={2}
              cursor="pointer"
              bg={selectedShift === code ? "gray.50" : "white"}
              _hover={{ bg: "gray.50" }}
              transition="background 0.1s ease"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(code);
                setIsDropdownOpen(false);
              }}
            >
              <Box
                bg={SHIFT_COLOR_MAP[code]}
                color="white"
                px={2}
                py={0.5}
                borderRadius="md"
                fontSize="xs"
                fontWeight="semibold"
                minW="32px"
                textAlign="center"
              >
                {code}
              </Box>
              <Text fontSize="sm" color="gray.700">
                {SHIFT_CODE_MAP[code]?.description}
              </Text>
            </Flex>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function ShiftEditPopover({
  isOpen,
  onClose,
  currentShift,
  nurseName,
  date,
  onShiftChange,
  anchorEl,
}: ShiftEditPopoverProps) {
  // Track selected shift locally to show immediate feedback
  const [selectedShift, setSelectedShift] = useState<ShiftCode | null>(currentShift?.shiftCode || null);

  // Reset selected shift when popover opens with new data
  useEffect(() => {
    if (isOpen) {
      setSelectedShift(currentShift?.shiftCode || null);
    }
  }, [isOpen, currentShift?.shiftCode]);

  // Calculate position based on anchor element
  // useEffect(() => {
  //   if (anchorEl && isOpen) {
  //     const rect = anchorEl.getBoundingClientRect();
  //     const popoverWidth = 280;
  //     const popoverHeight = 380;

  //     let left = rect.left + rect.width / 2 - popoverWidth / 2;
  //     let top = rect.bottom + 8;

  //     // Adjust if going off screen
  //     if (left < 10) left = 10;
  //     if (left + popoverWidth > window.innerWidth - 10) {
  //       left = window.innerWidth - popoverWidth - 10;
  //     }
  //     if (top + popoverHeight > window.innerHeight - 10) {
  //       top = rect.top - popoverHeight - 8;
  //     }

  //     setPosition({ top, left });
  //   }
  // }, [anchorEl, isOpen]);

  // // Close on click outside
  // useEffect(() => {
  //   const handleClickOutside = (event: MouseEvent) => {
  //     if (
  //       popoverRef.current &&
  //       !popoverRef.current.contains(event.target as Node) &&
  //       anchorEl &&
  //       !anchorEl.contains(event.target as Node)
  //     ) {
  //       onClose();
  //     }
  //   };

  //   if (isOpen) {
  //     document.addEventListener("mousedown", handleClickOutside);
  //   }

  //   return () => {
  //     document.removeEventListener("mousedown", handleClickOutside);
  //   };
  // }, [isOpen, onClose, anchorEl]);

  // // Close on Escape key
  // useEffect(() => {
  //   const handleEscape = (event: KeyboardEvent) => {
  //     if (event.key === "Escape") {
  //       onClose();
  //     }
  //   };

  //   if (isOpen) {
  //     document.addEventListener("keydown", handleEscape);
  //   }

  //   return () => {
  //     document.removeEventListener("keydown", handleEscape);
  //   };
  // }, [isOpen, onClose]);

  // if (!isOpen) return null;

  const handleShiftSelect = (shiftCode: ShiftCode) => {
    setSelectedShift(shiftCode);
    onShiftChange(shiftCode);
  };
  const CloseButton = () => {
    const popover = usePopoverContext()
    return (
      <X size={16} onClick={() => popover.setOpen(false)} style={{ cursor: "pointer" }} />
    )
  }

  return (
    <Popover.Root
      open={isOpen}
      onOpenChange={(details) => { if (!details.open) onClose(); }}
      positioning={{
        getAnchorRect: () => anchorEl?.getBoundingClientRect() ?? null,
        placement: "bottom",
      }}
    >
      <Popover.Positioner>
        <Popover.Content w="280px" borderRadius="lg" boxShadow="lg">
   
          {/* Header */}
          <Popover.Header
            p={3}
            bg="gray.50"
            borderBottom="1px solid"
            borderColor="gray.100"
          >
            <Flex justify="space-between" align="center">
              <VStack align="start" gap={0}>
                <Text fontSize="sm" fontWeight="semibold" color="#155E75">
                  Edit Shift
                </Text>
                <Text fontSize="xs" color="gray.500">
                  {nurseName} • {date}
                </Text>
              </VStack>
              <CloseButton />
            </Flex>
          </Popover.Header>

          {/* Content */}
          <Popover.Body p={3}>
            {/* Current/Selected Shift Display */}
            {selectedShift && (
              <Flex align="center" gap={2} mb={3} pb={3} borderBottom="1px solid" borderColor="gray.100">
                <Text fontSize="xs" color="gray.500">Current:</Text>
                <ShiftBadge
                  shiftCode={selectedShift}
                  isEditable={false}
                  size="sm"
                />
                <Text fontSize="xs" color="gray.600">
                  {SHIFT_CODE_MAP[selectedShift]?.description}
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
                    borderColor={selectedShift === code ? "#4B8798" : "transparent"}
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
                    borderColor={selectedShift === code ? "#4B8798" : "transparent"}
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
          </Popover.Body>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  );
}

export default ShiftEditPopover;
