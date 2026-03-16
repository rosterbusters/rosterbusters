import { Box, Container, Flex, Heading, Input, Text, VStack } from "@chakra-ui/react"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FiMail } from "react-icons/fi"
import { useState } from "react"

import { Button } from "@chakra-ui/react"
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
        // Use the backend's explicit detail message
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
    <Flex minH="100vh" align="center" justify="center" bg="gray.50">
      <Container maxW="sm" py={8}>
        <VStack gap={6}>
          <VStack gap={1} textAlign="center">
            <Heading size="xl" color="teal.700">
              Forgot Password
            </Heading>
            <Text color="gray.500" fontSize="sm">
              Enter your SACH email address, a reset link will be sent to you to reset your password.
            </Text>
          </VStack>

          <Box
            as="form"
            onSubmit={handleSubmit(onSubmit)}
            bg="white"
            p={8}
            rounded="xl"
            shadow="md"
            w="full"
          >
            <VStack gap={5}>
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
                <Text color="red.600" fontSize="sm" textAlign="center" w="full">
                  {errorMsg}
                </Text>
              )}

              {successMsg && (
                <Text color="green.600" fontSize="sm" textAlign="center" w="full">
                  {successMsg}
                </Text>
              )}

              <Button
                type="submit"
                variant="solid"
                colorScheme="teal"
                size="md"
                w="full"
                loading={isSubmitting}
              >
                Send Reset Link
              </Button>

              <Text fontSize="sm" color="gray.500" textAlign="center">
                Remembered your password?{" "}
                <a
                  href="/login"
                  style={{ color: "var(--chakra-colors-teal-600)", fontWeight: 600 }}
                >
                  Log In
                </a>
              </Text>
            </VStack>
          </Box>
        </VStack>
      </Container>
    </Flex>
  )
}