import { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Flex,
  Text,
  VStack,
  HStack,
  Popover,
  Textarea,
  Input,
  Spinner,
} from "@chakra-ui/react";
import { X, ChevronDown, MessageSquarePlus, Trash2 } from "lucide-react";

import { usePopoverContext } from "@chakra-ui/react";
import {
  type ShiftCode,
  type ShiftAssignment,
  SHIFT_CODE_MAP,
  SHIFT_COLOR_MAP,
} from "./types";
import { useUpdateRosterComment } from "./useRosterData";
import { showErrorToast, showSuccessToast } from "@/components/ui/toast";

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
  const [searchQuery, setSearchQuery] = useState("");

  const selectedOption = options.find((code) => code === selectedShift);

  const filteredOptions = options.filter((code) => {
    const q = searchQuery.toLowerCase();
    return (
      code.toLowerCase().includes(q) ||
      (SHIFT_CODE_MAP[code]?.description ?? "").toLowerCase().includes(q)
    );
  });

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
        onClick={() => {
          if (isDropdownOpen) setSearchQuery("");
          setIsDropdownOpen(!isDropdownOpen);
        }}
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
          maxH="220px"
          overflowY="auto"
        >
          {/* Search input */}
          <Box
            px={2}
            py={2}
            borderBottom="1px solid"
            borderColor="gray.100"
            position="sticky"
            top={0}
            bg="white"
            zIndex={1}
          >
            <Input
              placeholder="Search..."
              size="xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              borderColor="gray.200"
              _focus={{ borderColor: "#4B8798", boxShadow: "0 0 0 1px #4B8798" }}
            />
          </Box>

          {/* Options list */}
          {filteredOptions.map((code) => (
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
                setSearchQuery("");
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
          {filteredOptions.length === 0 && (
            <Flex px={3} py={2} align="center">
              <Text fontSize="sm" color="gray.400">No results</Text>
            </Flex>
          )}
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
  const [isSavingComment, setIsSavingComment] = useState(false);

  const updateRosterComment = useUpdateRosterComment();

  // Snapshot of state at the moment the popover was opened — used for Ctrl+Z revert
  const originalShiftRef = useRef<ShiftCode | null>(null);
  const originalCommentRef = useRef<string>("");

  // Reset state when popover opens with new data and capture the original snapshot
  useEffect(() => {
    if (isOpen) {
      const origShift = currentShift?.shiftCode || null;
      const origComment = currentShift?.comment || "";
      setSelectedShift(origShift);
      setComment(origComment);
      setShowCommentInput(!!currentShift?.comment);
      // Capture snapshot for Ctrl+Z
      originalShiftRef.current = origShift;
      originalCommentRef.current = origComment;
    }
  }, [isOpen, currentShift?.shiftCode, currentShift?.comment]);

  // Ctrl+Z: revert all in-session changes back to the snapshot taken when popover opened
  const handleUndoAll = useCallback(() => {
    const origShift = originalShiftRef.current;
    const origComment = originalCommentRef.current;

    setComment(origComment);
    setShowCommentInput(!!origComment);

    if (selectedShift !== origShift) {
      setSelectedShift(origShift);
      // Revert the live grid preview too
      if (origShift) {
        onShiftChange(origShift);
      }
    }

  }, [selectedShift, onShiftChange]);

  // Listen for Ctrl+Z while the popover is open
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        handleUndoAll();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleUndoAll]);

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

  const handleCommentSave = async () => {
    const rosterId = currentShift?.rosterId;
    if (rosterId && rosterId > 0) {
      setIsSavingComment(true);
      try {
        await updateRosterComment.mutateAsync({
          rosterId,
          comment: comment || null,
        });
        showSuccessToast("Comment saved successfully.");
      } catch {
        showErrorToast("Failed to save comment. Please try again.");
        setIsSavingComment(false);
        return;
      }
      setIsSavingComment(false);
    }
    if (onCommentChange) {
      onCommentChange(comment);
    }
    onClose();
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
      <Popover.Positioner zIndex={1400} overflow="visible">
        <Popover.Content w="300px" borderRadius="lg" boxShadow="lg" overflow="auto" maxH="90vh">
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
                    <Box position="relative">
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
                        pb="24px"
                      />
                      <Box
                        as="button"
                        position="absolute"
                        bottom="12px"
                        right="8px"
                        display="flex"
                        alignItems="center"
                        cursor="pointer"
                        color="gray.400"
                        _hover={{ color: "red.400" }}
                        transition="color 0.15s ease"
                        onClick={() => setComment("")}
                        title="Clear comment"
                        zIndex={1}
                      >
                        <Trash2 size={13} />
                      </Box>
                    </Box>
                    <Flex justify="flex-end" align="center" mt={2}>
                      {/* Cancel + Save */}
                      <Flex gap={2}>
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
                          bg={isSavingComment ? "#7aacba" : "#4B8798"}
                          borderRadius="md"
                          cursor={isSavingComment ? "not-allowed" : "pointer"}
                          _hover={{ bg: isSavingComment ? "#7aacba" : "#155E75" }}
                          transition="all 0.2s ease"
                          onClick={isSavingComment ? undefined : handleCommentSave}
                          display="flex"
                          alignItems="center"
                          gap={1}
                        >
                          {isSavingComment ? <Spinner size="xs" /> : "Save"}
                        </Box>
                      </Flex>
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
