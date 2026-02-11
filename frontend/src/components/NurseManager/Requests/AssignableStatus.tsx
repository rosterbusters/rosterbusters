import { Text, Badge, HStack } from "@chakra-ui/react";
export function AssignableStatus() {
  return (
    <>
      <HStack>
        <Text color="foreground" fontWeight="light">
          Assignable:
        </Text>
        <Badge variant="requests">Requests: 1</Badge>
      </HStack>
    </>
  );
}
