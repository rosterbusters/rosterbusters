import { Box, Flex, Grid, GridItem, Text, VStack } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"

import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/ward-staff/profile")({
  component: ProfilePage,
})

function formatValue(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : "Not available"
}

function formatJoinDate(value: string | null | undefined) {
  if (!value) return "Not available"
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed)
}

function ProfilePage() {
  const { user } = useAuth()

  const profileName = formatValue(user?.name ?? user?.username ?? user?.email)
  const email = formatValue(user?.email)
  const designation = user?.managerid ? "Nurse Manager" : "Ward Staff"
  const ward = user?.wardid ? `Ward ${user.wardid}` : "Not available"
  const phoneNumber = "Not available"
  const joinDate = formatJoinDate(user?.join_date)

  const details = [
    { label: "Ward", value: ward },
    { label: "Designation", value: designation },
    { label: "Join Date", value: joinDate },
    { label: "Email", value: email },
    { label: "Phone Number", value: phoneNumber },
  ]

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
        gap={6}
        justifyItems="center"
        w="full"
        maxW="720px"
        height="100%"
        bgColor="white"
        rounded="lg"
        p={{ base: 6, md: 7 }}
        align="stretch"
        mx="auto"
      >
        <Text
          color="primary"
          fontWeight="semibold"
          fontSize="lg"
          textAlign="center"
        >
          Profile
        </Text>

        <Box>
          <Text
            color="foreground"
            fontWeight="semibold"
            fontSize={{ base: "2xl", md: "3xl" }}
          >
            {profileName}
          </Text>
        </Box>

        <Grid
          templateColumns={{ base: "1fr", md: "160px 1fr" }}
          gap={4}
          maxW="2xl"
        >
          {details.map((item) => (
            <GridItem key={item.label} colSpan={2}>
              <Grid templateColumns={{ base: "1fr", md: "160px 1fr" }} gap={2}>
                <GridItem>
                  <Text color="foreground" fontWeight="medium">
                    {item.label}:
                  </Text>
                </GridItem>
                <GridItem>
                  <Text color="gray.500">{item.value}</Text>
                </GridItem>
              </Grid>
            </GridItem>
          ))}
        </Grid>
      </VStack>
    </Flex>
  )
}

export default ProfilePage
