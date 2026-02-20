import { Text, Spinner, Stack } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { HomeService } from "@/client";

export default function StatusBanner() {
  const { data: shiftData, isLoading, error } = useQuery({
    queryKey: ["upcomingShift"],
    queryFn: () => HomeService.getUpcomingShift(),
  });

  if (isLoading) {
    return (
      <Stack alignItems="center" justifyContent="center" py={4}>
        <Spinner size="lg" color="primary" />
        <Text color="foreground" fontSize="md">Loading shift information...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Text fontSize="2xl" color="foreground" fontWeight="semibold">
        Unable to load shift information. Please try again later.
      </Text>
    );
  }

  return (
    <>
      <Text fontSize="2xl" color="foreground" fontWeight="semibold">
        Hi
        <Text fontSize="2xl" as="span" fontWeight="semibold" color="primary">
          {" "}
          {shiftData?.nurse_name || "User"},
        </Text>
      </Text>
      
      {shiftData?.has_shift ? (
        <Text fontSize="2xl" color="foreground" fontWeight="semibold">
          You have an upcoming{" "}
          <Text as="span" fontSize="2xl" fontWeight="semibold" color="primary">
            {shiftData.shift_type}
          </Text>
          {" "}from{" "}
          <Text as="span" fontSize="2xl" fontWeight="semibold" color="primary">
            {shiftData.start_time}
          </Text>
          {" "}to{" "}
          <Text as="span" fontSize="2xl" fontWeight="semibold" color="primary">
            {shiftData.end_time}
          </Text>
          {" "}on{" "}
          <Text as="span" fontSize="2xl" fontWeight="semibold" color="primary">
            {shiftData.shift_day}, {shiftData.formatted_date}.
          </Text>
        </Text>
      ) : (
        <Text fontSize="2xl" color="foreground" fontWeight="semibold">
          You have no upcoming shifts scheduled.
        </Text>
      )}
    </>
  );
}