import { Box, Text, VStack } from "@chakra-ui/react";
import { MessageSquare, Clock, Check, X } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import {
  type ShiftCode,
  type ViewMode,
  type ShiftRequestOverlay,
  SHIFT_COLOR_MAP,
  SHIFT_CODE_MAP,
} from "./types";

interface ShiftBadgeProps {
  shiftCode: ShiftCode | null;
  onClick?: () => void;
  isEditable?: boolean;
  size?: "sm" | "md";
  viewMode?: ViewMode;
  comment?: string;
  onCommentIconClick?: (e: React.MouseEvent) => void;
  shiftRequestOverlay?: ShiftRequestOverlay;
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
  if (
    !shiftInfo?.isWorking ||
    !shiftInfo.defaultStart ||
    !shiftInfo.defaultEnd
  ) {
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
  comment,
  onCommentIconClick,
  shiftRequestOverlay,
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
        _hover={
          isEditable ? { bg: "gray.200", borderColor: "#4B8798" } : undefined
        }
        transition="all 0.15s ease"
      >
        <Text
          fontSize={isWeekView ? "sm" : size === "sm" ? "xs" : "xs"}
          color="gray.400"
        >
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

  const hasOverlay = !!shiftRequestOverlay;

  const OVERLAY_CONFIG = {
    Pending: { borderColor: "#f97316", Icon: Clock, iconBg: "#f97316" },
    Approved: { borderColor: "#22c55e", Icon: Check, iconBg: "#22c55e" },
    Rejected: { borderColor: "#ef4444", Icon: X, iconBg: "#ef4444" },
  } as const;

  const overlayConfig = hasOverlay
    ? OVERLAY_CONFIG[shiftRequestOverlay!.status]
    : null;

  // Tooltip content for comment
  const commentTooltipContent = hasComment ? (
    <Text fontSize="xs" color="whiteAlpha.900" fontStyle="italic" py={1}>
      "{comment}"
    </Text>
  ) : null;

  // Comment indicator icon - always top-right circle
  const commentIcon = hasComment ? (
    <Tooltip content={commentTooltipContent} showArrow>
      <Box
        position="absolute"
        top="-4px"
        right="-4px"
        bg="#edc001"
        borderRadius="full"
        w={isWeekView ? "20px" : "18px"}
        h={isWeekView ? "20px" : "18px"}
        display="flex"
        alignItems="center"
        justifyContent="center"
        boxShadow="0 0 0 1.5px white, 0 1px 3px rgba(0,0,0,0.2)"
        cursor="pointer"
        onClick={(e) => {
          e.stopPropagation();
          onCommentIconClick?.(e);
        }}
      >
        <MessageSquare size={isWeekView ? 12 : 10} color="white" fill="white" />
      </Box>
    </Tooltip>
  ) : null;

  // Shift request status icon - bottom-left rounded square, inside the border
  const requestStatusIcon =
    hasOverlay && overlayConfig ? (
      <Tooltip
        content={
          <Text fontSize="xs" color="whiteAlpha.900" py={1}>
            {shiftRequestOverlay!.category}: {shiftRequestOverlay!.reason}
          </Text>
        }
        showArrow
      >
        <Box
          position="absolute"
          bottom="-1px"
          left="-2px"
          bg={overlayConfig.iconBg}
          borderRadius="sm"
          w={isWeekView ? "16px" : "14px"}
          h={isWeekView ? "16px" : "14px"}
          display="flex"
          alignItems="center"
          justifyContent="center"
          zIndex={1}
        >
          <overlayConfig.Icon
            size={isWeekView ? 10 : 9}
            color="white"
            strokeWidth={3}
          />
        </Box>
      </Tooltip>
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
          _hover={
            isEditable
              ? {
                  opacity: 0.85,
                  transform: "scale(1.02)",
                }
              : undefined
          }
          transition="all 0.15s ease"
          boxShadow={isWorkingShift ? "sm" : "none"}
          title={!hasComment ? shiftInfo?.description || shiftCode : undefined}
          outline={
            hasOverlay && overlayConfig
              ? `2.5px solid ${overlayConfig.borderColor}`
              : undefined
          }
          outlineOffset="1px"
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
        {requestStatusIcon}
      </Box>
    );

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
        _hover={
          isEditable
            ? {
                opacity: 0.85,
                transform: "scale(1.02)",
              }
            : undefined
        }
        transition="all 0.15s ease"
        boxShadow={isWorkingShift ? "sm" : "none"}
        title={
          !showShiftTooltip && !hasComment
            ? shiftInfo?.description || shiftCode
            : undefined
        }
        outline={
          hasOverlay && overlayConfig
            ? `2.5px solid ${overlayConfig.borderColor}`
            : undefined
        }
        outlineOffset="1px"
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
      {requestStatusIcon}
    </Box>
  );

  // Wrap with tooltip for 2-week shift info (comment tooltip is on the icon itself)
  if (showShiftTooltip) {
    return (
      <Tooltip
        content={
          <VStack gap={0} py={1}>
            <Text fontSize="xs" fontWeight="medium">
              {shiftInfo?.description}
            </Text>
            <Text fontSize="xs" color="whiteAlpha.800">
              {timeRange}
            </Text>
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
