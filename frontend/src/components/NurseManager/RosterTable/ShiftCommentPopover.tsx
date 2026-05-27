import {
  Box,
  Flex,
  Popover,
  Portal,
  Text,
  Textarea,
  usePopoverContext,
  VStack,
} from "@chakra-ui/react"
import { Trash2, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

interface ShiftCommentPopoverProps {
  isOpen: boolean
  onClose: () => void
  currentComment: string
  nurseName: string
  date: string
  onCommentChange: (comment: string) => void
  anchorEl: HTMLElement | null
}

export function ShiftCommentPopover({
  isOpen,
  onClose,
  currentComment,
  nurseName,
  date,
  onCommentChange,
  anchorEl,
}: ShiftCommentPopoverProps) {
  const [comment, setComment] = useState<string>(currentComment || "")

  // Snapshot of the comment at the moment the popover was opened — used for Ctrl+Z revert
  const originalCommentRef = useRef<string>("")

  // Reset state when popover opens with new data and capture the original snapshot
  useEffect(() => {
    if (isOpen) {
      const origComment = currentComment || ""
      setComment(origComment)
      // Capture snapshot for Ctrl+Z
      originalCommentRef.current = origComment
    }
  }, [isOpen, currentComment])

  // Ctrl+Z: revert comment back to the snapshot taken when popover opened
  const handleUndoAll = useCallback(() => {
    setComment(originalCommentRef.current)
  }, [])

  // Listen for Ctrl+Z while the popover is open
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault()
        handleUndoAll()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, handleUndoAll])

  const handleSave = () => {
    onCommentChange(comment)
    onClose()
  }

  const CloseButton = () => {
    const popover = usePopoverContext()
    return (
      <X
        size={16}
        onClick={() => popover.setOpen(false)}
        style={{ cursor: "pointer" }}
      />
    )
  }

  return (
    <Popover.Root
      open={isOpen}
      onOpenChange={(details) => {
        if (!details.open) onClose()
      }}
      positioning={{
        getAnchorRect: () => anchorEl?.getBoundingClientRect() ?? null,
        placement: "bottom",
      }}
    >
      <Portal>
        <Popover.Positioner zIndex={1600} overflow="visible">
          <Popover.Content
            w="300px"
            borderRadius="lg"
            boxShadow="lg"
            overflow="auto"
            maxH="90vh"
          >
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
                    Comment
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
              <Box>
                <Text fontSize="xs" fontWeight="medium" color="gray.500" mb={1}>
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
                    _focus={{
                      borderColor: "#4B8798",
                      boxShadow: "0 0 0 1px #4B8798",
                    }}
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
                      py={3}
                      fontSize="xs"
                      fontWeight="medium"
                      color="gray.500"
                      cursor="pointer"
                      _hover={{ color: "gray.700" }}
                      onClick={() => {
                        setComment(currentComment || "")
                        onClose()
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
                      bg="#4B8798"
                      borderRadius="md"
                      cursor="pointer"
                      _hover={{ bg: "#155E75" }}
                      transition="all 0.2s ease"
                      onClick={handleSave}
                      display="flex"
                      alignItems="center"
                      gap={1}
                    >
                      Save
                    </Box>
                  </Flex>
                </Flex>
              </Box>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  )
}

export default ShiftCommentPopover
