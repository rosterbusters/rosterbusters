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
  IconButton,
  Image,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react"
import { Button } from "@chakra-ui/react"
import { Field } from "@/components/ui/field"
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
      throw redirect({ to: "/login", search: { message: "Please log in", error: "" } })
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

            {/* Header */}
            <VStack gap={0} align="start" mb={1}>
              <Heading
                as="h1"
                size="lg"
                fontWeight="700"
                color="teal.700"
              >
                Welcome! Set Up Your Account
              </Heading>
              <Text color="gray.500" fontSize="sm">
                Please set a new password and link your email to complete setup.
              </Text>
            </VStack>

            <Box as="form" onSubmit={handleSubmit(onSubmit)}>
              <VStack gap={3} align="stretch">

                {/* Email */}
                <Field
                  label="Email"
                  invalid={!!errors.email}
                  errorText={errors.email?.message}
                  required
                >
                  <InputGroup startElement={<FiMail color="gray" />} w="100%">
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
                      size="md"
                      variant="subtle"
                      bg="gray.50"
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
                    startElement={<FiLock color="gray" />}
                    endElement={
                      <IconButton
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword(!showPassword)}
                        variant="ghost"
                        size="sm"
                        color="gray.400"
                      >
                        {showPassword ? <FiEyeOff /> : <FiEye />}
                      </IconButton>
                    }
                    w="100%"
                  >
                    <Input
                      {...register("new_password", passwordRules())}
                      placeholder="At least 8 characters"
                      type={showPassword ? "text" : "password"}
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
                  required
                >
                  <InputGroup
                    startElement={<FiLock color="gray" />}
                    endElement={
                      <IconButton
                        aria-label={showConfirm ? "Hide password" : "Show password"}
                        onClick={() => setShowConfirm(!showConfirm)}
                        variant="ghost"
                        size="sm"
                        color="gray.400"
                      >
                        {showConfirm ? <FiEyeOff /> : <FiEye />}
                      </IconButton>
                    }
                    w="100%"
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
                      size="md"
                      variant="subtle"
                      bg="gray.50"
                    />
                  </InputGroup>
                </Field>

                <Button
                  type="submit"
                  variant="solid"
                  size="md"
                  w="100%"
                  loading={isSubmitting || mutation.isPending}
                  mt={1}
                >
                  Complete Setup
                </Button>

              </VStack>
            </Box>

          </VStack>
        </Container>
      </Flex>
    </Flex>
  )
}
