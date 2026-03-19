import { Box, Text } from "@chakra-ui/react";

interface LockdownBannerProps {
  nextWindowStart?: string;
  nextWindowEnd?: string;
}

export function LockdownBanner({ nextWindowStart, nextWindowEnd }: LockdownBannerProps) {
  const hasNextWindow = nextWindowStart && nextWindowEnd;

  return (
    <Box w="100%" bgColor="primary" py={2.5} textAlign="center">
      <Text color="white" fontSize="sm" fontWeight="medium">
        Shift &amp; Leave Request Application Period Closed.
        {hasNextWindow && (
          <> Next Application Window: {nextWindowStart} – {nextWindowEnd}</>
        )}
      </Text>
    </Box>
  );
}
