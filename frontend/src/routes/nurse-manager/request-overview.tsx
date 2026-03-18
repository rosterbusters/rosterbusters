import { createFileRoute } from "@tanstack/react-router";
import {
  Flex,
  HStack,
  Select,
  Text,
  VStack,
  Portal,
  createListCollection,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequestsOverviewTable } from "@/components/NurseManager/Requests/RequestsOverviewTable";
import useAuth from "@/hooks/useAuth";
import { WardsService, type Ward } from "@/client";

export const Route = createFileRoute("/nurse-manager/request-overview")({
  component: ShiftOverviewPage,
});

function ShiftOverviewPage() {
  const { user } = useAuth();
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null);

  const { data: wards = [] } = useQuery<Ward[]>({
    queryKey: ["wards"],
    queryFn: WardsService.getWards,
  });

  useEffect(() => {
    if (wards.length === 0 || selectedWard !== null) return;

    const defaultWard =
      wards.find((ward) => ward.wardid === user?.wardid) ??
      wards[0];

    setSelectedWard(defaultWard);
  }, [selectedWard, user, wards]);

  const wardCollection = useMemo(
    () =>
      createListCollection({
        items: wards,
        itemToString: (ward) => ward.wardname,
        itemToValue: (ward) => String(ward.wardid),
      }),
    [wards],
  );

  return (
    <Flex
      minH="100vh"
      w="100vw"
      height="100%"
      direction={{ base: "column" }}
      bgColor="background2"
      p={5}
    >
      <VStack
        gap={4}
        justifyItems="center"
        w="full"
        height="100%"
        bgColor="white"
        rounded="lg"
        p={7}
        textAlign="center"
      >
        <RequestsOverviewTable
          wardId={selectedWard?.wardid ?? (user as any)?.wardid}
          wardSelector={
            <HStack justify="flex-end" w="full" gap={2}>
              <Text fontSize="sm" color="#6B7280" fontWeight="medium">
                Ward:
              </Text>
              <Select.Root
                collection={wardCollection}
                size="sm"
                width="140px"
                color="foreground"
                value={selectedWard ? [String(selectedWard.wardid)] : []}
                onValueChange={(details) => {
                  const ward = wards.find(
                    (candidate) => String(candidate.wardid) === details.value[0],
                  );
                  if (ward) setSelectedWard(ward);
                }}
              >
                <Select.HiddenSelect />
                <Select.Control>
                  <Select.Trigger>
                    <Select.ValueText placeholder="Select Ward" />
                  </Select.Trigger>
                  <Select.IndicatorGroup>
                    <Select.Indicator />
                  </Select.IndicatorGroup>
                </Select.Control>
                <Portal>
                  <Select.Positioner zIndex={1500}>
                    <Select.Content>
                      {wardCollection.items.map((ward) => (
                        <Select.Item key={ward.wardid} item={ward}>
                          {ward.wardname}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Portal>
              </Select.Root>
            </HStack>
          }
        />
      </VStack>
    </Flex>
  );
}

export default ShiftOverviewPage;
