import { Badge, Box, HStack, Text } from "@chakra-ui/react"
import { Check, X } from "lucide-react"
import { Tooltip } from "@/components/ui/tooltip"

export interface NurseStatus {
  name: string
  status: string
  reason?: string | null
}

interface CalendarRequestBlockProps {
  shift: string
  owned?: boolean
  nurseName?: string
  nurseStatuses?: NurseStatus[]
  onClick?: () => void
}

const OVERLAY_CONFIG = {
  Approved: { outlineColor: "#22c55e", Icon: Check, iconBg: "#22c55e" },
  Rejected: { outlineColor: "#ef4444", Icon: X, iconBg: "#ef4444" },
} as const

export function CalendarRequestBlock({
  shift,
  owned,
  nurseName,
  nurseStatuses,
  onClick,
}: CalendarRequestBlockProps) {
  const hasStatuses = nurseStatuses && nurseStatuses.length > 0

  return (
    <Badge
      textWrap="wrap"
      variant={owned ? `${shift}ShiftSolid` : (`${shift}ShiftOutline` as any)}
      py={2}
      gap={2}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation()
              onClick()
            }
          : undefined
      }
      cursor={onClick ? "pointer" : undefined}
      alignItems="center"
    >
      <Badge variant={`${shift}Shift` as any} flexShrink={0}>
        {shift}
      </Badge>
      {hasStatuses ? (
        <HStack gap={1} flexWrap="wrap" align="center">
          {nurseStatuses!.flatMap((nurse, i) => {
            const isLast = i === nurseStatuses!.length - 1
            const config =
              OVERLAY_CONFIG[nurse.status as keyof typeof OVERLAY_CONFIG]

            const chip = config ? (
              <Box
                position="relative"
                display="inline-block"
                px={3}
                py="1px"
                borderRadius="2px"
                outline={`2px solid ${config.outlineColor}`}
                outlineOffset="1px"
                lineHeight="1.4"
                fontSize="inherit"
                bg="whiteAlpha.600"
                color="#4A4A4A"
              >
                {nurse.name}
                <Box
                  position="absolute"
                  bottom="-4px"
                  left="-4px"
                  bg={config.iconBg}
                  borderRadius="sm"
                  w="12px"
                  h="12px"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  zIndex={1}
                >
                  <config.Icon size={8} color="white" strokeWidth={3} />
                </Box>
              </Box>
            ) : (
              <span key={`name-${i}`}>{nurse.name}</span>
            )

            const withTooltip =
              config && nurse.reason ? (
                <Tooltip
                  key={`chip-${i}`}
                  content={
                    <Text fontSize="xs" color="whiteAlpha.900" py={1}>
                      {nurse.reason}
                    </Text>
                  }
                  showArrow
                >
                  {chip}
                </Tooltip>
              ) : (
                <Box key={`chip-${i}`} display="contents">
                  {chip}
                </Box>
              )

            return isLast
              ? [withTooltip]
              : [
                  withTooltip,
                  <span key={`comma-${i}`} style={{ marginInline: "1px" }}>
                    ,
                  </span>,
                ]
          })}
        </HStack>
      ) : (
        (nurseName ?? "")
      )}
    </Badge>
  )
}
