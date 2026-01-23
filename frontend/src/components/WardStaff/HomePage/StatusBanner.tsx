import { Heading, Stack, Highlight } from "@chakra-ui/react";

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
    <Stack
      bgColor={"white"}
      p={12}
      width="100%"
      rounded={"lg"}
      height={"100%"}
      alignItems={"start"}
      justifyContent={"center"}
    >
      <Heading size="2xl" color={"foreground"} fontWeight={"semibold"}>
        Hi
        <Heading size="2xl" as="span" fontWeight={"semibold"} color={"primary"}>
          {" "}
          {userName},
        </Heading>
      </Heading>
      <Heading size="2xl" color={"foreground"} fontWeight={"semibold"}>
        You have an upcoming{" "}
        <Heading as="span" size="2xl" fontWeight={"semibold"} color={"primary"}>
          {upcomingShift?.shiftName} Shift {" "}
        </Heading>
        at
        <Heading as="span" size="2xl" fontWeight={"semibold"} color={"primary"}>
          {" "}{upcomingShift?.startTime}
        </Heading>
        , on {" "}
        <Heading as="span" size="2xl" fontWeight={"semibold"} color={"primary"}>
          {upcomingShift?.shiftDate}.
        </Heading>
      </Heading>
    </Stack>
  );
}
