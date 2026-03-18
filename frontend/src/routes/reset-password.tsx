import { Container, Flex, Heading, Text } from "@chakra-ui/react"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link as RouterLink, redirect, useNavigate } from "@tanstack/react-router"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FiArrowLeft, FiLock } from "react-icons/fi"

import { type ApiError } from "@/client"
import { Button } from "@/components/ui/button"
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
      handleError(err)
    },
  })

  const onSubmit: SubmitHandler<NewPasswordForm> = async (data) => {
    mutation.mutate(data)
  }

  return (
    <Container
      as="form"
      onSubmit={handleSubmit(onSubmit)}
      h="100vh"
      maxW="sm"
      alignItems="stretch"
      justifyContent="center"
      gap={4}
      centerContent
    >
      <Heading size="xl" color="ui.main" textAlign="center" mb={2}>
        Reset Password
      </Heading>
      <Text textAlign="center">
        Please enter your new password and confirm it to reset your password.
      </Text>
      <PasswordInput
        startElement={<FiLock />}
        type="new_password"
        errors={errors}
        {...register("new_password", passwordRules())}
        placeholder="New Password"
      />
      <PasswordInput
        startElement={<FiLock />}
        type="confirm_password"
        errors={errors}
        {...register("confirm_password", confirmPasswordRules(getValues))}
        placeholder="Confirm Password"
      />
      <Button variant="default" type="submit" disabled={mutation.isPending}>
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
    </Container>
  )
}