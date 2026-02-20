import { useState, useEffect } from "react";
import {
  Box,
  Flex,
  Text,
  VStack,
  HStack,
  Popover,
  Textarea,
} from "@chakra-ui/react";
import { X, ChevronDown, MessageSquarePlus, Check } from "lucide-react";

import { usePopoverContext } from "@chakra-ui/react";
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
  onCommentChange?: (comment: string) => void;
  anchorEl: HTMLElement | null;
}

// Working shifts
const WORKING_SHIFTS: ShiftCode[] = ["D", "A", "P", "N", "N-12"];
// Leave / Off shifts
const LEAVE_SHIFTS: ShiftCode[] = [
  "DO",
  "AL",
  "MC",
  "URG",
  "BCL",
  "CCL",
  "ML",
  "CL",
  "EML",
];

interface ShiftDropdownProps {
  label: string;
  options: ShiftCode[];
  selectedShift: ShiftCode | null;
  onSelect: (code: ShiftCode) => void;
}

function ShiftDropdown({
  label,
  options,
  selectedShift,
  onSelect,
}: ShiftDropdownProps) {
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
          maxH="180px"
          overflowY="auto"
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
  onCommentChange,
  anchorEl,
}: ShiftEditPopoverProps) {
  const [selectedShift, setSelectedShift] = useState<ShiftCode | null>(
    currentShift?.shiftCode || null,
  );
  const [comment, setComment] = useState<string>(
    currentShift?.comment || "",
  );
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentSaved, setCommentSaved] = useState(false);

  // Reset state when popover opens with new data
  useEffect(() => {
    if (isOpen) {
      setSelectedShift(currentShift?.shiftCode || null);
      setComment(currentShift?.comment || "");
      setShowCommentInput(!!currentShift?.comment);
      setCommentSaved(false);
    }
  }, [isOpen, currentShift?.shiftCode, currentShift?.comment]);

  // Determine which category the current selection belongs to
  const isWorkingShift = selectedShift
    ? WORKING_SHIFTS.includes(selectedShift)
    : false;
  const isLeaveShift = selectedShift
    ? LEAVE_SHIFTS.includes(selectedShift)
    : false;

  const handleShiftSelect = (shiftCode: ShiftCode) => {
    setSelectedShift(shiftCode);
    onShiftChange(shiftCode);
  };

  const handleCommentSave = () => {
    if (onCommentChange) {
      onCommentChange(comment);
      setCommentSaved(true);
      setTimeout(() => setCommentSaved(false), 2000);
    }
  };

  const CloseButton = () => {
    const popover = usePopoverContext();
    return (
      <X
        size={16}
        onClick={() => popover.setOpen(false)}
        style={{ cursor: "pointer" }}
      />
    );
  };

  return (
    <Popover.Root
      open={isOpen}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      positioning={{
        getAnchorRect: () => anchorEl?.getBoundingClientRect() ?? null,
        placement: "bottom",
      }}
    >
      <Popover.Positioner>
        <Popover.Content w="300px" borderRadius="lg" boxShadow="lg">
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
            <VStack gap={3} align="stretch">
              {/* Shift Type Dropdown */}
              <ShiftDropdown
                label="Shift Type"
                options={WORKING_SHIFTS}
                selectedShift={isWorkingShift ? selectedShift : null}
                onSelect={handleShiftSelect}
              />

              {/* Leave Type Dropdown */}
              <ShiftDropdown
                label="Leave Type"
                options={LEAVE_SHIFTS}
                selectedShift={isLeaveShift ? selectedShift : null}
                onSelect={handleShiftSelect}
              />

              {/* Add Comment Section */}
              <Box
                borderTop="1px solid"
                borderColor="gray.100"
                pt={3}
              >
                {!showCommentInput ? (
                  <Flex
                    align="center"
                    gap={2}
                    cursor="pointer"
                    color="#4B8798"
                    _hover={{ color: "#155E75" }}
                    transition="color 0.15s ease"
                    onClick={() => setShowCommentInput(true)}
                  >
                    <MessageSquarePlus size={16} />
                    <Text fontSize="sm" fontWeight="medium">
                      Add Comment
                    </Text>
                  </Flex>
                ) : (
                  <Box>
                    <Text
                      fontSize="xs"
                      fontWeight="medium"
                      color="gray.500"
                      mb={1}
                    >
                      Comment
                    </Text>
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add a comment..."
                      size="sm"
                      borderRadius="md"
                      borderColor="gray.200"
                      _focus={{ borderColor: "#4B8798", boxShadow: "0 0 0 1px #4B8798" }}
                      resize="none"
                      rows={3}
                      fontSize="sm"
                    />
                    <Flex justify="flex-end" gap={2} mt={2}>
                      <Box
                        as="button"
                        px={3}
                        py={1}
                        fontSize="xs"
                        fontWeight="medium"
                        color="gray.500"
                        cursor="pointer"
                        _hover={{ color: "gray.700" }}
                        onClick={() => {
                          setComment(currentShift?.comment || "");
                          if (!currentShift?.comment) {
                            setShowCommentInput(false);
                          }
                        }}
                      >
                        Cancel
                      </Box>
                      <Box
                        as="button"
                        px={3}
                        py={1}
                        fontSize="xs"
                        fontWeight="medium"
                        color="white"
                        bg={commentSaved ? "#16a34a" : "#4B8798"}
                        borderRadius="md"
                        cursor="pointer"
                        _hover={{ bg: commentSaved ? "#16a34a" : "#155E75" }}
                        transition="all 0.2s ease"
                        onClick={handleCommentSave}
                        display="flex"
                        alignItems="center"
                        gap={1}
                      >
                        {commentSaved && <Check size={12} />}
                        {commentSaved ? "Saved" : "Save"}
                      </Box>
                    </Flex>
                  </Box>
                )}
              </Box>
            </VStack>
          </Popover.Body>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  );
}

export default ShiftEditPopover;
