import { Box, Button, Container, Flex, Heading, Image, Input, Text, VStack } from "@chakra-ui/react"
import { createFileRoute, redirect, Link as RouterLink } from "@tanstack/react-router"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FiMail } from "react-icons/fi"
import { useState } from "react"

import { Field } from "@/components/ui/field"
import { InputGroup } from "@/components/ui/input-group"
import { isLoggedIn } from "@/hooks/useAuth"
import { emailPattern } from "@/utils"

interface FormData {
  email: string
}

export const Route = createFileRoute("/recover-password")({
  component: RecoverPassword,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({ to: "/login", search: { message: "You are already logged in.", error: "" } })
    }
  },
})

function RecoverPassword() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>()

  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    setSuccessMsg(null)
    setErrorMsg(null)

    try {
      const BASE = import.meta.env.VITE_API_URL || ""
      const res = await fetch(`${BASE}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      })

      const json = await res.json()

      if (!res.ok) {
        const detail = json?.detail
        setErrorMsg(
          typeof detail === "string"
            ? detail
            : "Failed to send reset email. Please try again."
        )
        return
      }

      setSuccessMsg(
        json?.message ??
          "If that email is registered, a password reset link has been sent. Check your inbox."
      )
    } catch {
      setErrorMsg(
        "Unable to reach the server. Please check your connection and try again."
      )
    }
  }

  return (
    <Flex
      h="100vh"
      w="100vw"
      direction={{ base: "column", lg: "row" }}
      overflowY={{ base: "auto", lg: "hidden" }}
      bg="white"
    >
      {/* Visual Side */}
      <Box
        flex={{ base: "0 0 50%", lg: "1" }}
        position="relative"
        overflow="hidden"
      >
        <Image
          src="/assets/images/sach-entrance.jpg"
          alt="St. Andrew's Community Hospital"
          objectFit="cover"
          w="100%"
          h="100%"
          objectPosition="center"
        />
        <Box
          position="absolute"
          bottom="0"
          left="0"
          right="0"
          h="32"
          bgGradient="to-t"
          gradientFrom="blackAlpha.700"
          gradientTo="transparent"
        />
      </Box>

      {/* Form Side */}
      <Flex
        flex="1"
        direction="column"
        bg="white"
        mt={{ base: "-10vh", lg: "0" }}
        roundedTop="none"
        position="relative"
        zIndex="2"
        align="center"
        justify={{ base: "start", lg: "center" }}
        pt={{ base: 6, lg: 0 }}
        pb={4}
      >
        <Container maxW="md" w="100%" px={6}>
          <VStack gap={3} align="stretch">
            <VStack gap={0} align="start" mb={1}>
              <Heading as="h1" size="lg" fontWeight="700" color="teal.700">
                Forgot Password
              </Heading>
              <Text color="gray.500" fontSize="sm">
                Enter your <Text as="span" fontWeight="700" color="teal.600">SACH</Text> email address, a reset link will be sent to you.
              </Text>
            </VStack>

            <Box as="form" onSubmit={handleSubmit(onSubmit)}>
              <VStack gap={3} align="stretch">
                <Field
                  label="Email Address"
                  invalid={!!errors.email}
                  errorText={errors.email?.message}
                >
                  <InputGroup w="100%" startElement={<FiMail color="gray" />}>
                    <Input
                      {...register("email", {
                        required: "Email address is required.",
                        pattern: emailPattern,
                      })}
                      placeholder="you@sach.com.sg"
                      type="email"
                      size="md"
                      variant="subtle"
                      bg="gray.50"
                    />
                  </InputGroup>
                </Field>

                {errorMsg && (
                  <Text color="red.600" fontSize="sm" textAlign="center">
                    {errorMsg}
                  </Text>
                )}

                {successMsg && (
                  <Text color="green.600" fontSize="sm" textAlign="center">
                    {successMsg}
                  </Text>
                )}

                <Button
                  type="submit"
                  variant="solid"
                  size="md"
                  w="100%"
                  loading={isSubmitting}
                  mt={1}
                >
                  Send Reset Link
                </Button>

                <Flex justify="center" pt={1}>
                  <RouterLink
                    to="/login"
                    search={{ message: "", error: "" }}
                    style={{
                      color: "var(--chakra-colors-teal-600)",
                      fontSize: "13px",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Back to Login
                  </RouterLink>
                </Flex>
              </VStack>
            </Box>
          </VStack>
        </Container>
      </Flex>
    </Flex>
  )
}
