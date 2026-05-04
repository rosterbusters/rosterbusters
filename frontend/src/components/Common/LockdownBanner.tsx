import { Box, Text } from "@chakra-ui/react"

interface LockdownBannerProps {
  nextWindowStart?: string
  nextWindowEnd?: string
  title?: string
  nextLabel?: string
}

export function LockdownBanner({
  nextWindowStart,
  nextWindowEnd,
  title = "Shift & Leave Request Application Period Closed.",
  nextLabel = "Next Application Window:",
}: LockdownBannerProps) {
  const hasNextWindow = nextWindowStart && nextWindowEnd

  return (
    <Box w="100%" bgColor="primary" py={2.5} textAlign="center">
      <Text color="white" fontSize="sm" fontWeight="medium">
        {title}
        {hasNextWindow && (
          <>
            {" "}
            {nextLabel} {nextWindowStart} – {nextWindowEnd}
          </>
        )}
      </Text>
    </Box>
  )
}
