import { HStack, Box, Text } from "@chakra-ui/react";
import { Pencil } from "lucide-react";

interface AlgorithmGeneratedBadgeProps {
  isGenerated?: boolean;
}

export function AlgorithmGeneratedBadge({ isGenerated = false }: AlgorithmGeneratedBadgeProps) {
  if (isGenerated) {
    return (
      <HStack gap={2} alignItems="center">
        <Box
          w="12px"
          h="12px"
          borderRadius="full"
          bg="#10B981"
          boxShadow="0 0 8px rgba(16, 185, 129, 0.5)"
        />
        <Text fontSize="sm" fontWeight="medium" color="#374151">
          Algorithm Generated
        </Text>
      </HStack>
    );
  }

  // Manual Editing mode badge
  return (
    <HStack gap={2} alignItems="center">
      <Box
        w="24px"
        h="24px"
        borderRadius="md"
        bg="#F3F4F6"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Pencil className="h-3 w-3" color="#6B7280" />
      </Box>
      <Text fontSize="sm" fontWeight="medium" color="#6B7280">
        Manual Editing
      </Text>
    </HStack>
  );
}

export default AlgorithmGeneratedBadge;

