import { Text, Stack, Highlight } from "@chakra-ui/react";

const Name = "John Doe";
interface upcomingShiftProps {
  shiftName: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
}
//get name
const userName = "John Doe";
//get upcoming shift details
const upcomingShift: upcomingShiftProps = {
  shiftName: "Day",
  shiftDate: "Tuesday, 13/11/2001",
  startTime: "9:00AM",
  endTime: "5:00PM",
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
        You have an upcoming{" "}
        <Text as="span" fontSize="2xl" fontWeight={"semibold"} color={"primary"}>
          {upcomingShift?.shiftName} Shift {" "}
        </Text>
        at
        <Text as="span" fontSize="2xl" fontWeight={"semibold"} color={"primary"}>
          {" "}{upcomingShift?.startTime}
        </Text>
        , on {" "}
        <Text as="span" fontSize="2xl" fontWeight={"semibold"} color={"primary"}>
          {upcomingShift?.shiftDate}.
        </Text>
      </Text>
    </>
  );
}
