import { useState, useMemo } from "react";
import {
  Box,
  Button,
  Flex,
  Text,
  Table,
  Input,
  HStack,
  IconButton,
} from "@chakra-ui/react";
import { X, Filter, MessageSquare } from "lucide-react";
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShiftBadge } from "./ShiftBadge";
import type { EditHistoryEntry } from "./types";
import moment from "moment";

interface EditHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entries: EditHistoryEntry[];
  onUndo?: (entryId: number) => void;
}

function formatDateTime(dateStr: string): string {
  return moment(dateStr).format("M/D/YYYY h:mmA");
}

export function EditHistoryDialog({
  isOpen,
  onClose,
  entries,
  onUndo,
}: EditHistoryDialogProps) {
  const [filterModifiedBy, setFilterModifiedBy] = useState("");
  const [filterShiftDate, setFilterShiftDate] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (
        filterModifiedBy &&
        !entry.modifiedBy.toLowerCase().includes(filterModifiedBy.toLowerCase())
      ) {
        return false;
      }
      if (
        filterShiftDate &&
        !moment(entry.shiftDate).format("M/D/YYYY").includes(filterShiftDate)
      ) {
        return false;
      }
      return true;
    });
  }, [entries, filterModifiedBy, filterShiftDate]);

  const toggleFilter = (column: string) => {
    setActiveFilter(activeFilter === column ? null : column);
  };

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      size="xl"
      placement="center"
      motionPreset="scale"
    >
      <DialogContent
        maxW="950px"
        maxH="80vh"
        borderRadius="xl"
        overflow="hidden"
        display="flex"
        flexDirection="column"
      >
        <DialogHeader
          px={6}
          py={4}
          borderBottom="1px solid"
          borderColor="gray.100"
          flexShrink={0}
        >
          <Flex justify="space-between" align="center" w="full">
            <DialogTitle fontSize="lg" fontWeight="bold" color="#155E75">
              Version History
            </DialogTitle>
            <IconButton
              aria-label="Close"
              size="sm"
              variant="ghost"
              onClick={onClose}
              color="gray.500"
              _hover={{ bg: "gray.100" }}
            >
              <X size={18} />
            </IconButton>
          </Flex>
        </DialogHeader>

        <DialogBody p={0} overflow="hidden" display="flex" flexDirection="column" flex={1}>
          <Box overflowY="auto" overflowX="auto" flex={1}>
            <Table.Root size="sm" variant="outline">
              <Table.Header position="sticky" top={0} zIndex={1}>
                <Table.Row bg="gray.50">
                  <Table.ColumnHeader
                    px={5}
                    py={3}
                    fontSize="xs"
                    fontWeight="semibold"
                    color="gray.600"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    borderBottom="2px solid"
                    borderColor="gray.200"
                    bg="gray.50"
                    w="180px"
                  >
                    <Flex align="center" gap={2}>
                      Modified Date
                    </Flex>
                  </Table.ColumnHeader>
                  <Table.ColumnHeader
                    px={5}
                    py={3}
                    fontSize="xs"
                    fontWeight="semibold"
                    color="gray.600"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    borderBottom="2px solid"
                    borderColor="gray.200"
                    bg="gray.50"
                    w="200px"
                  >
                    Nurse
                  </Table.ColumnHeader>
                  <Table.ColumnHeader
                    px={5}
                    py={3}
                    fontSize="xs"
                    fontWeight="semibold"
                    color="gray.600"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    borderBottom="2px solid"
                    borderColor="gray.200"
                    bg="gray.50"
                    w="250px"
                  >
                    Changes
                  </Table.ColumnHeader>
                  <Table.ColumnHeader
                    px={5}
                    py={3}
                    fontSize="xs"
                    fontWeight="semibold"
                    color="gray.600"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    borderBottom="2px solid"
                    borderColor="gray.200"
                    bg="gray.50"
                    w="180px"
                  >
                    <Flex align="center" gap={2}>
                      Shift Date
                      <Box
                        as="button"
                        onClick={() => toggleFilter("shiftDate")}
                        cursor="pointer"
                        color={
                          activeFilter === "shiftDate" ? "#4B8798" : "gray.400"
                        }
                        _hover={{ color: "#4B8798" }}
                      >
                        <Filter size={14} />
                      </Box>
                    </Flex>
                    {activeFilter === "shiftDate" && (
                      <Input
                        mt={1}
                        size="xs"
                        placeholder="Filter date..."
                        value={filterShiftDate}
                        onChange={(e) => setFilterShiftDate(e.target.value)}
                        borderColor="gray.300"
                        _focus={{ borderColor: "#4B8798" }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </Table.ColumnHeader>
                  <Table.ColumnHeader
                    px={5}
                    py={3}
                    fontSize="xs"
                    fontWeight="semibold"
                    color="gray.600"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    borderBottom="2px solid"
                    borderColor="gray.200"
                    bg="gray.50"
                    w="160px"
                  >
                    <Flex align="center" gap={2}>
                      Modified By
                      <Box
                        as="button"
                        onClick={() => toggleFilter("modifiedBy")}
                        cursor="pointer"
                        color={
                          activeFilter === "modifiedBy" ? "#4B8798" : "gray.400"
                        }
                        _hover={{ color: "#4B8798" }}
                      >
                        <Filter size={14} />
                      </Box>
                    </Flex>
                    {activeFilter === "modifiedBy" && (
                      <Input
                        mt={1}
                        size="xs"
                        placeholder="Filter name..."
                        value={filterModifiedBy}
                        onChange={(e) => setFilterModifiedBy(e.target.value)}
                        borderColor="gray.300"
                        _focus={{ borderColor: "#4B8798" }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </Table.ColumnHeader>
                  <Table.ColumnHeader
                    px={5}
                    py={3}
                    fontSize="xs"
                    fontWeight="semibold"
                    color="gray.600"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    borderBottom="2px solid"
                    borderColor="gray.200"
                    bg="gray.50"
                    w="100px"
                  />
                </Table.Row>
              </Table.Header>

              <Table.Body>
                {filteredEntries.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={6} textAlign="center" py={8}>
                      <Text color="gray.400" fontSize="sm">
                        No edit history found
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  filteredEntries.map((entry) => (
                    <Table.Row
                      key={entry.id}
                      _hover={{ bg: "gray.50" }}
                      borderBottom="1px solid"
                      borderColor="gray.100"
                    >
                      {/* Modified Date */}
                      <Table.Cell px={5} py={4}>
                        <Text fontSize="sm" color="gray.700">
                          {formatDateTime(entry.modifiedDate)}
                        </Text>
                      </Table.Cell>

                      {/* Nurse */}
                      <Table.Cell px={5} py={4}>
                        <Text fontSize="sm" color="gray.700">
                          {entry.nurseName}
                        </Text>
                      </Table.Cell>

                      {/* Changes */}
                      <Table.Cell px={5} py={4}>
                        {entry.changeType === "shift_change" &&
                        entry.previousShiftCode &&
                        entry.newShiftCode ? (
                          <HStack gap={2} align="center">
                            <ShiftBadge
                              shiftCode={entry.previousShiftCode}
                              isEditable={false}
                              size="sm"
                            />
                            <Text
                              fontSize="sm"
                              color="gray.500"
                              fontWeight="medium"
                            >
                              →
                            </Text>
                            <ShiftBadge
                              shiftCode={entry.newShiftCode}
                              isEditable={false}
                              size="sm"
                            />
                          </HStack>
                        ) : entry.changeType === "comment" ? (
                          <HStack gap={2} align="center">
                            <MessageSquare size={14} color="#6B7280" />
                            <Text fontSize="sm" color="gray.600">
                              Comment Added:{" "}
                              <Text as="span" fontStyle="italic">
                                {entry.comment}
                              </Text>
                            </Text>
                          </HStack>
                        ) : null}
                      </Table.Cell>

                      {/* Shift Date */}
                      <Table.Cell px={5} py={4}>
                        <Text fontSize="sm" color="gray.700">
                          {formatDateTime(entry.shiftDate)}
                        </Text>
                      </Table.Cell>

                      {/* Modified By */}
                      <Table.Cell px={5} py={4}>
                        <Text fontSize="sm" color="gray.700">
                          {entry.modifiedBy}
                        </Text>
                      </Table.Cell>

                      {/* Actions */}
                      <Table.Cell px={5} py={4}>
                        <Button
                          size="xs"
                          variant="outline"
                          colorScheme="red"
                          onClick={() => onUndo?.(entry.id)}
                          disabled={!onUndo}
                        >
                          Undo
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
}

export default EditHistoryDialog;
