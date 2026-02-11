import { Text } from "@chakra-ui/react";

interface WardManagementProps {
  wardName: string;
  currentTime: string;
  currentDate: string;
}

// TODO: Replace with actual backend data
const userName = "{Name}";
const wardInfo: WardManagementProps = {
  wardName: "Cedar Ward",
  currentTime: "9:00AM",
  currentDate: "Tuesday, 13/11/2001",
};

export default function StatusBanner() {
  return (
    <>
      <Text fontSize="2xl" color={"foreground"} fontWeight={"semibold"}>
        Hi
        <Text fontSize="2xl" as="span" fontWeight={"semibold"} color={"primary"}>
          {" "}
          {userName},
        </Text>
      </Text>
      <Text fontSize="2xl" color={"foreground"} fontWeight={"semibold"}>
        You are currently managing{" "}
        <Text as="span" fontSize="2xl" fontWeight={"semibold"} color={"primary"}>
          {wardInfo.wardName}
        </Text>
        {" "}at
        <Text as="span" fontSize="2xl" fontWeight={"semibold"} color={"primary"}>
          {" "}{wardInfo.currentTime}
        </Text>
        , on{" "}
        <Text as="span" fontSize="2xl" fontWeight={"semibold"} color={"primary"}>
          {wardInfo.currentDate}.
        </Text>
      </Text>
    </>
  );
}




