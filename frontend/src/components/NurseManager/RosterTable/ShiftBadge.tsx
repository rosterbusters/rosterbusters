import { Box, Text } from "@chakra-ui/react";
import { type ShiftCode, SHIFT_COLOR_MAP, SHIFT_CODE_MAP } from "./types";

interface ShiftBadgeProps {
  shiftCode: ShiftCode | null;
  onClick?: () => void;
  isEditable?: boolean;
  size?: "sm" | "md";
}

export function ShiftBadge({ 
  shiftCode, 
  onClick, 
  isEditable = true,
  size = "md" 
}: ShiftBadgeProps) {
  if (!shiftCode) {
    return (
      <Box
        w={size === "sm" ? "32px" : "48px"}
        h={size === "sm" ? "24px" : "28px"}
        borderRadius="md"
        bg="gray.100"
        display="flex"
        alignItems="center"
        justifyContent="center"
        cursor={isEditable ? "pointer" : "default"}
        onClick={onClick}
        _hover={isEditable ? { bg: "gray.200" } : undefined}
        transition="background-color 0.15s ease"
      >
        <Text fontSize={size === "sm" ? "xs" : "sm"} color="gray.400">
          —
        </Text>
      </Box>
    );
  }

  const bgColor = SHIFT_COLOR_MAP[shiftCode];
  const shiftInfo = SHIFT_CODE_MAP[shiftCode];
  const isWorkingShift = shiftInfo?.isWorking ?? true;

  return (
    <Box
      w={size === "sm" ? "32px" : "48px"}
      h={size === "sm" ? "24px" : "28px"}
      borderRadius="md"
      bg={bgColor}
      display="flex"
      alignItems="center"
      justifyContent="center"
      cursor={isEditable ? "pointer" : "default"}
      onClick={onClick}
      _hover={isEditable ? { 
        opacity: 0.85,
        transform: "scale(1.02)",
      } : undefined}
      transition="all 0.15s ease"
      boxShadow={isWorkingShift ? "sm" : "none"}
      title={shiftInfo?.description || shiftCode}
    >
      <Text 
        fontSize={size === "sm" ? "xs" : "sm"} 
        fontWeight="semibold" 
        color="white"
        letterSpacing="0.02em"
      >
        {shiftCode}
      </Text>
    </Box>
  );
}

export default ShiftBadge;



