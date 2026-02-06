import { Box, Text } from "@chakra-ui/react";

export const RequestCalendar = () => {
  return (
    <Box
      p={5}
      shadow="sm"
      borderWidth="1px"
      borderRadius="lg"
      height="500px"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="white"
    >
      <Text color="gray.500" fontSize="lg">
        Calendar system is updating...
      </Text>
    </Box>
  );
};
