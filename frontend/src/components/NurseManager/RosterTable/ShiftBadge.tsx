import { Box, Text, VStack } from "@chakra-ui/react";
import { MessageSquare } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { type ShiftCode, type ViewMode, SHIFT_COLOR_MAP, SHIFT_CODE_MAP } from "./types";

interface ShiftBadgeProps {
  shiftCode: ShiftCode | null;
  onClick?: () => void;
  isEditable?: boolean;
  size?: "sm" | "md";
  viewMode?: ViewMode;
  comment?: string;
}

// Format time from "HH:MM" to "H:MMAM/PM" format
function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")}${period}`;
}

// Get formatted time range for a shift
function getTimeRange(shiftCode: ShiftCode): string | null {
  const shiftInfo = SHIFT_CODE_MAP[shiftCode];
  if (!shiftInfo?.isWorking || !shiftInfo.defaultStart || !shiftInfo.defaultEnd) {
    return null;
  }
  return `${formatTime(shiftInfo.defaultStart)}-${formatTime(shiftInfo.defaultEnd)}`;
}

export function ShiftBadge({
  shiftCode,
  onClick,
  isEditable = true,
  size = "md",
  viewMode,
  comment
}: ShiftBadgeProps) {
  if (!shiftCode) {
    // Empty shift - show "Select" placeholder
    const isWeekView = viewMode === "week";
    return (
      <Box
        w={isWeekView ? "140px" : size === "sm" ? "32px" : "60px"}
        h={isWeekView ? "44px" : size === "sm" ? "24px" : "28px"}
        borderRadius="md"
        bg="gray.100"
        border="1px dashed"
        borderColor="gray.300"
        display="flex"
        alignItems="center"
        justifyContent="center"
        cursor={isEditable ? "pointer" : "default"}
        onClick={onClick}
        _hover={isEditable ? { bg: "gray.200", borderColor: "#4B8798" } : undefined}
        transition="all 0.15s ease"
      >
        <Text fontSize={isWeekView ? "sm" : size === "sm" ? "xs" : "xs"} color="gray.400">
          Select
        </Text>
      </Box>
    );
  }

  const bgColor = SHIFT_COLOR_MAP[shiftCode];
  const shiftInfo = SHIFT_CODE_MAP[shiftCode];
  const isWorkingShift = shiftInfo?.isWorking ?? true;
  const timeRange = getTimeRange(shiftCode);
  const isWeekView = viewMode === "week";
  const hasComment = !!comment;

  // Comment indicator icon (positioned absolutely)
  const commentIcon = hasComment ? (
    <Box
      position="absolute"
      top="-4px"
      right="-4px"
      bg="white"
      borderRadius="full"
      w={isWeekView ? "16px" : "14px"}
      h={isWeekView ? "16px" : "14px"}
      display="flex"
      alignItems="center"
      justifyContent="center"
      boxShadow="0 1px 3px rgba(0,0,0,0.2)"
    >
      <MessageSquare size={isWeekView ? 10 : 8} color="#4B8798" fill="#4B8798" />
    </Box>
  ) : null;

  // Tooltip content for comment
  const commentTooltipContent = hasComment ? (
    <VStack gap={1} py={1} align="start">
      {shiftInfo?.description && (
        <Text fontSize="xs" fontWeight="medium">{shiftInfo.description}</Text>
      )}
      {timeRange && (
        <Text fontSize="xs" color="whiteAlpha.800">{timeRange}</Text>
      )}
      <Box borderTop="1px solid" borderColor="whiteAlpha.300" w="100%" pt={1}>
        <Text fontSize="xs" color="whiteAlpha.900" fontStyle="italic">
          "{comment}"
        </Text>
      </Box>
    </VStack>
  ) : null;

  // Week view - all badges same size (with or without time)
  if (isWeekView) {
    const weekBadge = (
      <Box position="relative" display="inline-block">
        <Box
          w="140px"
          h="44px"
          borderRadius="md"
          bg={bgColor}
          display="flex"
          flexDirection="column"
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
          title={!hasComment ? (shiftInfo?.description || shiftCode) : undefined}
          py={1}
        >
          <Text
            fontSize="sm"
            fontWeight="semibold"
            color="white"
            letterSpacing="0.02em"
            lineHeight="1.2"
          >
            {shiftCode}
          </Text>
          {timeRange && (
            <Text
              fontSize="9px"
              fontWeight="medium"
              color="whiteAlpha.900"
              lineHeight="1.2"
              mt="2px"
            >
              {timeRange}
            </Text>
          )}
        </Box>
        {commentIcon}
      </Box>
    );

    if (hasComment) {
      return (
        <Tooltip content={commentTooltipContent} showArrow>
          {weekBadge}
        </Tooltip>
      );
    }

    return weekBadge;
  }

  // 2-week view - compact badges with tooltip on hover
  const showShiftTooltip = viewMode === "twoWeeks" && timeRange;

  const twoWeekBadge = (
    <Box position="relative" display="inline-block">
      <Box
        w={size === "sm" ? "32px" : "60px"}
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
        title={!showShiftTooltip && !hasComment ? (shiftInfo?.description || shiftCode) : undefined}
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
      {commentIcon}
    </Box>
  );

  // Wrap with tooltip if comment exists or for 2-week shift info
  if (hasComment) {
    return (
      <Tooltip content={commentTooltipContent} showArrow>
        {twoWeekBadge}
      </Tooltip>
    );
  }

  if (showShiftTooltip) {
    return (
      <Tooltip
        content={
          <VStack gap={0} py={1}>
            <Text fontSize="xs" fontWeight="medium">{shiftInfo?.description}</Text>
            <Text fontSize="xs" color="whiteAlpha.800">{timeRange}</Text>
          </VStack>
        }
        showArrow
      >
        {twoWeekBadge}
      </Tooltip>
    );
  }

  return twoWeekBadge;
}

export default ShiftBadge;
