import { useState } from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm, type SubmitHandler } from "react-hook-form"
import { FiLock, FiMail, FiEye, FiEyeOff } from "react-icons/fi"
import {
  Box,
  Container,
  Flex,
  Heading,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react"
import { Button } from "@chakra-ui/react"
import { Field } from "@/components/ui/field"
import { Input } from "@chakra-ui/react"
import { InputGroup } from "@/components/ui/input-group"
import { isLoggedIn } from "@/hooks/useAuth"
import { AdminService } from "@/client/adminService"
import useCustomToast from "@/hooks/useCustomToast"
import { UsersService } from "@/client"
import type { CurrentUser } from "@/hooks/useAuth"
import { passwordRules, confirmPasswordRules } from "@/utils"

export const Route = createFileRoute("/first-login-setup")({
  component: FirstLoginSetup,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({ to: "/login" })
    }
  },
})

interface SetupFormData {
  new_password: string
  confirm_password: string
  email: string
}

function FirstLoginSetup() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SetupFormData>({
    mode: "onBlur",
    defaultValues: {
      new_password: "",
      confirm_password: "",
      email: "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: { new_password: string; email?: string }) =>
      AdminService.firstLoginSetup(data),
    onSuccess: async () => {
      showSuccessToast("Account setup completed! Redirecting...")
      // Refetch user to get updated info and redirect normally
      const currentUser = (await UsersService.readUserMe()) as unknown as CurrentUser
      queryClient.setQueryData(["currentUser"], currentUser)
      if (currentUser.is_superuser) {
        navigate({ to: "/admin/dashboard" })
      } else if (currentUser.managerid) {
        navigate({ to: "/nurse-manager/home" })
      } else {
        navigate({ to: "/ward-staff/home" })
      }
    },
    onError: (err: any) => {
      showErrorToast(
        err?.body?.detail ?? err?.message ?? "Failed to complete setup.",
      )
    },
  })

  const onSubmit: SubmitHandler<SetupFormData> = (data) => {
    mutation.mutate({
      new_password: data.new_password,
      email: data.email,
    })
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
        display={{ base: "none", lg: "block" }}
      >
        <Image
          src="/assets/images/sach-entrance.jpg"
          alt="St. Andrew's Community Hospital"
          objectFit="cover"
          w="100%"
          h="100%"
          objectPosition="center"
        />
      </Box>

      {/* Form Side */}
      <Flex
        flex="1"
        align="center"
        justify="center"
        p={{ base: 6, md: 10 }}
      >
        <Container maxW="sm" w="full">
          <VStack gap={6} align="stretch">
            <Box textAlign="center">
              <Heading size="xl" mb={2} color="gray.800">
                Welcome! Set Up Your Account
              </Heading>
              <Text color="gray.500" fontSize="sm">
                Please set a new password and link your email address to your account.
              </Text>
            </Box>

            <form onSubmit={handleSubmit(onSubmit)}>
              <VStack gap={4}>
                {/* Email (required) */}
                <Field
                  label="Email"
                  invalid={!!errors.email}
                  errorText={errors.email?.message}
                  required
                >
                  <InputGroup
                    flex="1"
                    startElement={<FiMail color="gray" />}
                    w="full"
                  >
                    <Input
                      {...register("email", {
                        required: "Email is required",
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: "Invalid email address",
                        },
                      })}
                      placeholder="your.email@example.com"
                      type="email"
                      size="lg"
                    />
                  </InputGroup>
                </Field>

                {/* New Password */}
                <Field
                  label="New Password"
                  invalid={!!errors.new_password}
                  errorText={errors.new_password?.message}
                  required
                >
                  <InputGroup
                    flex="1"
                    startElement={<FiLock color="gray" />}
                    endElement={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {showPassword ? (
                          <FiEyeOff color="gray" />
                        ) : (
                          <FiEye color="gray" />
                        )}
                      </button>
                    }
                    w="full"
                  >
                    <Input
                      {...register("new_password", passwordRules())}
                      placeholder="At least 8 characters"
                      type={showPassword ? "text" : "password"}
                      size="lg"
                    />
                  </InputGroup>
                </Field>

                {/* Confirm Password */}
                <Field
                  label="Confirm Password"
                  invalid={!!errors.confirm_password}
                  errorText={errors.confirm_password?.message}
                  required
                >
                  <InputGroup
                    flex="1"
                    startElement={<FiLock color="gray" />}
                    endElement={
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {showConfirm ? (
                          <FiEyeOff color="gray" />
                        ) : (
                          <FiEye color="gray" />
                        )}
                      </button>
                    }
                    w="full"
                  >
                    <Input
                      {...register("confirm_password", {
                        required: "Please confirm your password",
                        validate: (value) =>
                          value === getValues("new_password") ||
                          "Passwords do not match",
                      })}
                      placeholder="Repeat your password"
                      type={showConfirm ? "text" : "password"}
                      size="lg"
                    />
                  </InputGroup>
                </Field>

                <Button
                  type="submit"
                  colorScheme="blue"
                  size="lg"
                  w="full"
                  loading={isSubmitting || mutation.isPending}
                  mt={2}
                >
                  Complete Setup
                </Button>
              </VStack>
            </form>
          </VStack>
        </Container>
      </Flex>
    </Flex>
  )
}
