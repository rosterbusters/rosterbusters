import { Text } from "@chakra-ui/react";
import useAuth from "@/hooks/useAuth";
import { Ward } from "@/client/types.gen";

interface StatusBannerProps {
  ward: Ward | null;
}

export default function StatusBanner({ ward }: StatusBannerProps) {
  const { user } = useAuth();
  const managerName = user?.name ?? "Name";

  const now = new Date();
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const day = now.toLocaleDateString("en-US", { weekday: "long" });
  const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <>
      <Text fontSize="2xl" color="foreground" fontWeight="semibold">
        Hi
        <Text fontSize="2xl" as="span" fontWeight="semibold" color="primary">
          {" "}
          {managerName},
        </Text>
      </Text>

      <Text fontSize="2xl" color="foreground" fontWeight="semibold">
        You are currently managing{" "}
        <Text as="span" fontSize="2xl" fontWeight="semibold" color="primary">
          {ward?.wardname ?? "your ward"}
        </Text>
        {" "}at{" "}
        <Text as="span" fontSize="2xl" fontWeight="semibold" color="primary">
          {time}
        </Text>
        , on{" "}
        <Text as="span" fontSize="2xl" fontWeight="semibold" color="primary">
          {day}, {date}.
        </Text>
      </Text>
    </>
  );
}


