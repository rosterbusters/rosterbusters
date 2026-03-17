import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  IconButton,
  Image,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react"
import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FiEye, FiEyeOff, FiLock } from "react-icons/fi"
import { useState } from "react"

import { Field } from "@/components/ui/field"
import { InputGroup } from "@/components/ui/input-group"
import { isLoggedIn } from "@/hooks/useAuth"
import { confirmPasswordRules, passwordRules } from "@/utils"

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

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

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
          {!token ? (
            <VStack gap={3} align="stretch">
              <Heading as="h1" size="lg" fontWeight="700" color="red.500">
                Invalid Reset Link
              </Heading>
              <Text color="gray.600" fontSize="sm">
                No reset token was found in this link. Please request a new password reset.
              </Text>
              <Button onClick={() => navigate({ to: "/recover-password" })} mt={1}>
                Back to Forgot Password
              </Button>
            </VStack>
          ) : (
            <VStack gap={3} align="stretch">
              <VStack gap={0} align="start" mb={1}>
                <Heading as="h1" size="lg" fontWeight="700" color="teal.700">
                  Reset Password
                </Heading>
                <Text color="gray.500" fontSize="sm">
                  Enter your new password below.
                </Text>
              </VStack>

              <Box as="form" onSubmit={handleSubmit(onSubmit)}>
                <VStack gap={3} align="stretch">
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
                    <Text color="red.600" fontSize="sm" textAlign="center">
                      {errorMsg}
                    </Text>
                  )}

                  <Button
                    type="submit"
                    loading={isSubmitting}
                    w="full"
                    mt={1}
                  >
                    Reset Password
                  </Button>

                  <Flex justify="center" pt={1}>
                    <a
                      href="/recover-password"
                      style={{
                        color: "var(--chakra-colors-teal-600)",
                        fontSize: "13px",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      Link expired? Request a new one
                    </a>
                  </Flex>
                </VStack>
              </Box>
            </VStack>
          )}
        </Container>
      </Flex>
    </Flex>
  )
}
