import { Heading, Stack} from "@chakra-ui/react";

const Name="John Doe";

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
          {Name},
        </Heading>
      </Heading>
      <Heading size="2xl" color={"foreground"} fontWeight={"semibold"}>
        {" "}
        You have an upcoming 
        Day Shift at 9:00AM, on Tuesday, 13/11/2001.
      </Heading>
    </Stack>
  );
}
