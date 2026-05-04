import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation } from "@tanstack/react-query"
import {
  createFileRoute,
  Link as RouterLink,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FiArrowLeft, FiLock } from "react-icons/fi"

import type { ApiError } from "@/client"
import { PasswordInput } from "@/components/ui/password-input"
import { showSuccessToast } from "@/components/ui/toast"
import { isLoggedIn } from "@/hooks/useAuth"
import { confirmPasswordRules, handleError, passwordRules } from "@/utils"

interface NewPasswordForm {
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
      throw redirect({
        to: "/login",
      })
    }
  },
})

function ResetPassword() {
  const { token } = Route.useSearch()
  const [invalidToken, setInvalidToken] = useState(!token)
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    formState: { errors },
  } = useForm<NewPasswordForm>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      new_password: "",
      confirm_password: "",
    },
  })
  const navigate = useNavigate()

  const resetPassword = async (data: NewPasswordForm) => {
    const BASE = import.meta.env.VITE_API_URL || ""
    const response = await fetch(`${BASE}/api/v1/reset-password/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password: data.new_password }),
    })
    if (!response.ok) {
      const err = await response.json()
      throw { body: err, status: response.status } as ApiError
    }
  }

  const mutation = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => {
      showSuccessToast("Password updated successfully.")
      reset()
      navigate({ to: "/login" })
    },
    onError: (err: ApiError) => {
      const errDetail = (err.body as any)?.detail
      if (errDetail === "Invalid token") {
        setInvalidToken(true)
        return
      }
      handleError(err)
    },
  })

  const onSubmit: SubmitHandler<NewPasswordForm> = async (data) => {
    mutation.mutate(data)
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
          {invalidToken ? (
            <VStack gap={5} align="stretch">
              <VStack gap={1} align="center">
                <Heading
                  as="h1"
                  size="lg"
                  fontWeight="700"
                  color="teal.700"
                  textAlign="center"
                >
                  Invalid or expired link
                </Heading>
                <Text color="gray.500" fontSize="sm" textAlign="center">
                  This password reset link is not valid. Please request a new
                  reset link to continue.
                </Text>
              </VStack>

              <Button
                onClick={() => navigate({ to: "/recover-password" })}
                variant="solid"
                size="md"
                w="100%"
              >
                Request New Link
              </Button>

              {/* #10 — Back to Login link */}
              <Flex justify="center" pt={1}>
                <RouterLink
                  to="/login"
                  style={{
                    color: "var(--chakra-colors-teal-600)",
                    fontSize: "13px",
                    fontWeight: 600,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <FiArrowLeft />
                  Back to Login
                </RouterLink>
              </Flex>
            </VStack>
          ) : (
            <Box as="form" onSubmit={handleSubmit(onSubmit)}>
              <VStack gap={3} align="stretch">
                <VStack gap={0} align="start" mb={1}>
                  <Heading as="h1" size="lg" fontWeight="700" color="teal.700">
                    Reset Password
                  </Heading>
                  <Text color="gray.500" fontSize="sm">
                    Please enter your new password and confirm it to reset your
                    password.
                  </Text>
                </VStack>

                <PasswordInput
                  startElement={<FiLock color="gray" />}
                  type="new_password"
                  errors={errors}
                  {...register("new_password", passwordRules())}
                  placeholder="New Password"
                  size="md"
                  variant="subtle"
                  bg="gray.50"
                />
                <PasswordInput
                  startElement={<FiLock color="gray" />}
                  type="confirm_password"
                  errors={errors}
                  {...register(
                    "confirm_password",
                    confirmPasswordRules(getValues),
                  )}
                  placeholder="Confirm Password"
                  size="md"
                  variant="subtle"
                  bg="gray.50"
                />
                <Button
                  type="submit"
                  variant="solid"
                  size="md"
                  w="100%"
                  loading={mutation.isPending}
                >
                  {mutation.isPending ? "Resetting..." : "Reset Password"}
                </Button>

                {/* #10 — Back to Login link */}
                <Flex justify="center" pt={1}>
                  <RouterLink
                    to="/login"
                    style={{
                      color: "var(--chakra-colors-teal-600)",
                      fontSize: "13px",
                      fontWeight: 600,
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <FiArrowLeft />
                    Back to Login
                  </RouterLink>
                </Flex>
              </VStack>
            </Box>
          )}
        </Container>
      </Flex>
    </Flex>
  )
}
