import { HStack, Box, Text } from "@chakra-ui/react";

interface AlgorithmGeneratedBadgeProps {
  isGenerated?: boolean;
}

export function AlgorithmGeneratedBadge({ isGenerated = true }: AlgorithmGeneratedBadgeProps) {
  if (!isGenerated) return null;

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

export default AlgorithmGeneratedBadge;

