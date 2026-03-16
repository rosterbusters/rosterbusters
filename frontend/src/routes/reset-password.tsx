import {
  Box,
  Button as ChakraButton,
  Container,
  Flex,
  Heading,
  Input,
  Text,
  VStack,
  IconButton,
} from "@chakra-ui/react"
import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FiEye, FiEyeOff, FiLock } from "react-icons/fi"
import { useState } from "react"

import { type ApiError } from "@/client"
interface NewPassword {
  new_password: string
}
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { showSuccessToast } from "@/components/ui/toast"
import { isLoggedIn } from "@/hooks/useAuth"
import { confirmPasswordRules, handleError, passwordRules } from "@/utils"

interface ResetForm {
  new_password: string
  confirm_password: string
}

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) ?? "",
  }),
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({ to: "/login", search: { message: "You are already logged in.", error: "" } })
    }
  },
})

function ResetPassword() {
  const { token } = useSearch({ from: "/reset-password" })
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: { new_password: "", confirm_password: "" },
  })
  const navigate = useNavigate()

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // If no token in URL, show explicit error immediately
  if (!token) {
    return (
      <Flex minH="100vh" align="center" justify="center" bg="gray.50">
        <Container maxW="sm">
          <Box bg="white" p={8} rounded="xl" shadow="md" textAlign="center">
            <Heading size="md" color="red.500" mb={3}>
              Invalid Reset Link
            </Heading>
            <Text color="gray.600" mb={5}>
              No reset token was found in this link. Please request a new password reset.
            </Text>
            <Button onClick={() => navigate({ to: "/recover-password" })}>
              Back to Forgot Password
            </Button>
          </Box>
        </Container>
      </Flex>
    )
  }

  const onSubmit: SubmitHandler<ResetForm> = async (data) => {
    setErrorMsg(null)

    try {
      const BASE = import.meta.env.VITE_API_URL || ""
      const res = await fetch(`${BASE}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: data.new_password }),
      })

      const json = await res.json()

      if (!res.ok) {
        const detail = json?.detail
        setErrorMsg(
          typeof detail === "string"
            ? detail
            : "Failed to reset password. Please try again."
        )
        return
      }

      // Success – navigate to login with a flag to show success toast
      navigate({
        to: "/login",
        search: { message: "Password reset successfully. Please log in with your new password.", error: "" },
      })
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
              Reset Password
            </Heading>
            <Text color="gray.500" fontSize="sm">
              Enter your new password below.
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
              {/* New Password */}
              <Field
                label="New Password"
                invalid={!!errors.new_password}
                errorText={errors.new_password?.message}
              >
                <InputGroup
                  w="100%"
                  startElement={<FiLock color="gray" />}
                  endElement={
                    <IconButton
                      aria-label={showNew ? "Hide password" : "Show password"}
                      onClick={() => setShowNew((p) => !p)}
                      variant="ghost"
                      size="sm"
                      color="gray.400"
                    >
                      {showNew ? <FiEyeOff /> : <FiEye />}
                    </IconButton>
                  }
                >
                  <Input
                    {...register("new_password", passwordRules())}
                    placeholder="New Password"
                    type={showNew ? "text" : "password"}
                    size="md"
                    variant="subtle"
                    bg="gray.50"
                  />
                </InputGroup>
              </Field>

              {/* Confirm Password */}
              <Field
                label="Confirm Password"
                invalid={!!errors.confirm_password}
                errorText={errors.confirm_password?.message}
              >
                <InputGroup
                  w="100%"
                  startElement={<FiLock color="gray" />}
                  endElement={
                    <IconButton
                      aria-label={showConfirm ? "Hide password" : "Show password"}
                      onClick={() => setShowConfirm((p) => !p)}
                      variant="ghost"
                      size="sm"
                      color="gray.400"
                    >
                      {showConfirm ? <FiEyeOff /> : <FiEye />}
                    </IconButton>
                  }
                >
                  <Input
                    {...register("confirm_password", confirmPasswordRules(getValues))}
                    placeholder="Confirm Password"
                    type={showConfirm ? "text" : "password"}
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

              <Box w="full">
                <ChakraButton
                  type="submit"
                  loading={isSubmitting}
                  w="full"
                >
                  Reset Password
                </ChakraButton>
              </Box>

              <Text fontSize="sm" color="gray.500" textAlign="center">
                Link expired?{" "}
                <a
                  href="/recover-password"
                  style={{ color: "var(--chakra-colors-teal-600)", fontWeight: 600 }}
                >
                  Request a new one
                </a>
              </Text>
            </VStack>
          </Box>
        </VStack>
      </Container>
    </Flex>
  )
}