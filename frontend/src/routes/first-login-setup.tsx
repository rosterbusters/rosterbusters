import { useEffect, useState } from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import { useForm, type SubmitHandler } from "react-hook-form"
import { z } from "zod"
import { FiLock, FiMail, FiEye, FiEyeOff, FiCheck } from "react-icons/fi"
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
  Spinner,
} from "@chakra-ui/react"
import { Button } from "@chakra-ui/react"
import { showErrorToast, showSuccessToast } from "@/components/ui/toast"
import { Field } from "@/components/ui/field"
import { InputGroup } from "@/components/ui/input-group"
import { isLoggedIn } from "@/hooks/useAuth"
import {
  AdminService,
  type FirstLoginSetupContext as PublicFirstLoginSetupContext,
} from "@/client/adminService"
import { UsersService } from "@/client"
import type { CurrentUser } from "@/hooks/useAuth"
import { passwordRules } from "@/utils"

const normalizeEmail = (value: string | undefined | null) =>
  (value ?? "").trim().toLowerCase()

const normalizeVerificationCode = (value: string | undefined | null) =>
  (value ?? "").replace(/\D/g, "").slice(0, 6)

const firstLoginSearchSchema = z.object({
  token: z.string().optional(),
})

export const Route = createFileRoute("/first-login-setup")({
  component: FirstLoginSetup,
  validateSearch: (search) => firstLoginSearchSchema.parse(search),
  beforeLoad: async ({ search }) => {
    if (!search.token && !isLoggedIn()) {
      throw redirect({ to: "/login" })
    }
    if (!search.token) {
      const user = (await UsersService.readUserMe()) as unknown as CurrentUser
      if (!user.must_change_password) {
        if (user.is_superuser) {
          throw redirect({ to: "/admin/dashboard" })
        }
        if (user.managerid) {
          throw redirect({ to: "/nurse-manager/home" })
        }
        throw redirect({ to: "/ward-staff/home" })
      }
    }
  },
})

interface SetupFormData {
  new_password: string
  confirm_password: string
  email: string
  employee_id: string
}

function FirstLoginSetup() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isTokenMode = Boolean(token)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [emailVerificationStep, setEmailVerificationStep] = useState<"idle" | "code-sent" | "verified">("idle")
  const [verificationCode, setVerificationCode] = useState("")
  const [isLoadingSendCode, setIsLoadingSendCode] = useState(false)
  const [isLoadingVerifyCode, setIsLoadingVerifyCode] = useState(false)
  const [codeError, setCodeError] = useState("")
  const [resendCooldown, setResendCooldown] = useState(0)

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["currentUser"],
    queryFn: () => UsersService.readUserMe() as unknown as Promise<CurrentUser>,
    enabled: !isTokenMode,
  })

  const {
    data: publicSetupContext,
    isLoading: isLoadingSetupContext,
    isError: isSetupContextError,
  } = useQuery<PublicFirstLoginSetupContext>({
    queryKey: ["public-first-login-setup", token],
    queryFn: () => AdminService.getPublicFirstLoginSetupContext(token!),
    enabled: isTokenMode,
  })
  const requiresEmployeeId = isTokenMode
    ? !!publicSetupContext?.requires_employee_id
    : !!(currentUser?.nurseid || currentUser?.managerid)

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SetupFormData>({
    mode: "onBlur",
    defaultValues: {
      new_password: "",
      confirm_password: "",
      email: "",
      employee_id: "",
    },
  })

  // Cooldown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return
    
    const timer = setTimeout(() => {
      setResendCooldown(resendCooldown - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [resendCooldown])

  useEffect(() => {
    if (isTokenMode) return
    const existingEmail = currentUser?.email?.trim()
    if (!existingEmail) return

    // Prefill with the account email only if the field is still blank.
    if (!getValues("email")) {
      setValue("email", existingEmail)
    }

    if (currentUser?.email_verified) {
      setEmailVerificationStep("verified")
    }
  }, [currentUser?.email, currentUser?.email_verified, getValues, setValue])

  useEffect(() => {
    const existingEmployeeId = isTokenMode
      ? publicSetupContext?.employee_id?.trim()
      : currentUser?.employee_id?.trim()
    if (!existingEmployeeId) return

    if (!getValues("employee_id")) {
      setValue("employee_id", existingEmployeeId)
    }
  }, [
    currentUser?.employee_id,
    getValues,
    isTokenMode,
    publicSetupContext?.employee_id,
    setValue,
  ])

  useEffect(() => {
    if (!isTokenMode) return
    if (!publicSetupContext?.email) return
    if (!getValues("email")) {
      setValue("email", publicSetupContext.email)
    }
    setEmailVerificationStep("verified")
  }, [getValues, isTokenMode, publicSetupContext?.email, setValue])

  const sendVerificationCode = async () => {
    const email = normalizeEmail(getValues("email"))
    
    if (!email) {
      showErrorToast("Please enter an email address first")
      return
    }

    // Email format validation regex
    const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i
    
    if (!emailRegex.test(email)) {
      showErrorToast("Invalid email format")
      return
    }

    setIsLoadingSendCode(true)
    setCodeError("")
    
    try {
      await UsersService.sendEmailVerificationCode({
        requestBody: {
          email,
        },
      })
      showSuccessToast("Verification code sent to your email!")
      setEmailVerificationStep("code-sent")
      setVerificationCode("")
      setResendCooldown(60) // 60 second cooldown
    } catch (err: any) {
      const errorMsg = err?.body?.detail ?? err?.message ?? "Failed to send verification code"
      showErrorToast(errorMsg)
      setCodeError(errorMsg)
    } finally {
      setIsLoadingSendCode(false)
    }
  }

  const confirmVerificationCode = async () => {
    const email = normalizeEmail(getValues("email"))
    const code = normalizeVerificationCode(verificationCode)
    
    if (!code || code.length !== 6) {
      setCodeError("Please enter a 6-digit code")
      return
    }

    setIsLoadingVerifyCode(true)
    setCodeError("")
    
    try {
      await UsersService.verifyEmailCode({
        requestBody: {
          email,
          code,
        },
      })
      const refreshedUser = (await UsersService.readUserMe()) as unknown as CurrentUser
      queryClient.setQueryData(["currentUser"], refreshedUser)
      showSuccessToast("Email verified successfully!")
      setEmailVerificationStep("verified")
    } catch (err: any) {
      const errorMsg = err?.body?.detail ?? err?.message ?? "Invalid verification code"
      showErrorToast(errorMsg)
      setCodeError(errorMsg)
    } finally {
      setIsLoadingVerifyCode(false)
    }
  }

  const mutation = useMutation({
    mutationFn: (data: { new_password: string; email?: string; employee_id?: string }) =>
      isTokenMode
        ? AdminService.completePublicFirstLoginSetup({
            token: token!,
            new_password: data.new_password,
            employee_id: data.employee_id,
          })
        : AdminService.firstLoginSetup(data),
    onSuccess: async () => {
      showSuccessToast("Account setup completed! Redirecting...")
      if (isTokenMode) {
        navigate({ to: "/login" })
        return
      }

      const refreshedUser = (await UsersService.readUserMe()) as unknown as CurrentUser
      queryClient.setQueryData(["currentUser"], refreshedUser)
      if (refreshedUser.is_superuser) {
        navigate({ to: "/admin/dashboard" })
      } else if (refreshedUser.managerid) {
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
    if (isTokenMode) {
      mutation.mutate({
        new_password: data.new_password,
        employee_id: data.employee_id?.trim() || undefined,
      })
      return
    }

    const submittedEmail = normalizeEmail(data.email)
    const verifiedAccountEmail = normalizeEmail(currentUser?.email)
    const isUsingAlreadyVerifiedEmail =
      currentUser?.email_verified === true &&
      submittedEmail.length > 0 &&
      submittedEmail === verifiedAccountEmail

    if (!isUsingAlreadyVerifiedEmail && emailVerificationStep !== "verified") {
      showErrorToast("Please verify your email before completing setup.")
      return
    }

    mutation.mutate({
      new_password: data.new_password,
      email: submittedEmail,
      employee_id: data.employee_id?.trim() || undefined,
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
          {isTokenMode && isLoadingSetupContext ? (
            <VStack gap={4} align="center" py={10}>
              <Spinner size="lg" color="teal.500" />
              <Text color="gray.600">Loading your setup link...</Text>
            </VStack>
          ) : isTokenMode && isSetupContextError ? (
            <VStack gap={5} align="stretch">
              <VStack gap={1} align="center">
                <Heading as="h1" size="lg" fontWeight="700" color="teal.700" textAlign="center">
                  Invalid or expired link
                </Heading>
                <Text color="gray.500" fontSize="sm" textAlign="center">
                  This setup link is no longer valid. Please contact your administrator for a new invitation.
                </Text>
              </VStack>
            </VStack>
          ) : (
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
                {isTokenMode
                  ? "Please set your password to complete your Duby account setup."
                  : "Please set a new password and link your email to complete setup."}
              </Text>
            </VStack>

            <Box as="form" onSubmit={handleSubmit(onSubmit)}>
              <VStack gap={3} align="stretch">

                {/* Email */}
                <Field
                  label="Email"
                  invalid={!!errors.email || codeError.length > 0}
                  errorText={errors.email?.message || codeError}
                  required
                >
                  <Flex gap={2} w="100%" flexDirection={{ base: "column", sm: "row" }} align={{ base: "stretch", sm: "flex-start" }}>
                    <InputGroup startElement={<FiMail color="gray" />} w="100%">
                      <Input
                        {...register("email", {
                          required: "Email is required",
                          pattern: {
                            value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                            message: "Invalid email address",
                          },
                          onChange: (e) => {
                            const typedEmail = normalizeEmail(e.target.value)
                            const verifiedAccountEmail = normalizeEmail(currentUser?.email)

                            if (
                              currentUser?.email_verified === true &&
                              typedEmail &&
                              verifiedAccountEmail &&
                              typedEmail === verifiedAccountEmail
                            ) {
                              setEmailVerificationStep("verified")
                            } else {
                              setEmailVerificationStep("idle")
                              setVerificationCode("")
                            }
                            setCodeError("")
                          },
                        })}
                        placeholder="your.email@example.com"
                        type="email"
                        size="md"
                        variant="subtle"
                        bg="gray.50"
                        disabled={emailVerificationStep === "verified" || isTokenMode}
                      />
                    </InputGroup>
                    {!isTokenMode && emailVerificationStep !== "verified" && (
                      <Button
                        onClick={sendVerificationCode}
                        variant="outline"
                        size="md"
                        loading={isLoadingSendCode}
                        colorScheme="gray"
                        whiteSpace="nowrap"
                        disabled={isLoadingSendCode || emailVerificationStep === "code-sent"}
                        minW="fit-content"
                      >
                        <Flex align="center" gap={2}>
                          {isLoadingSendCode ? (
                            <Spinner size="sm" />
                          ) : emailVerificationStep === "code-sent" ? (
                            <FiCheck />
                          ) : null}
                          {isLoadingSendCode
                            ? "Sending..."
                            : emailVerificationStep === "code-sent"
                              ? "Code Sent"
                              : "Send Code"}
                        </Flex>
                      </Button>
                    )}
                    {emailVerificationStep === "verified" && (
                      <Button
                        variant="solid"
                        size="md"
                        colorScheme="green"
                        whiteSpace="nowrap"
                        disabled
                      >
                        <Flex align="center" gap={2}>
                          <FiCheck />
                          Verified
                        </Flex>
                      </Button>
                    )}
                  </Flex>

                  {!isTokenMode && emailVerificationStep === "code-sent" && (
                    <VStack align="stretch" mt={3} gap={2}>
                      <Text fontSize="sm" color="blue.600" fontWeight="500">
                        Enter the verification code sent to your email
                      </Text>
                      <Input
                        type="password"
                        placeholder="Enter 6-digit code"
                        value={verificationCode}
                        onChange={(e) => {
                          const val = normalizeVerificationCode(e.target.value)
                          setVerificationCode(val)
                          setCodeError("")
                        }}
                        onPaste={(event) => {
                          event.preventDefault()
                          const val = normalizeVerificationCode(
                            event.clipboardData.getData("text"),
                          )
                          setVerificationCode(val)
                          setCodeError("")
                        }}
                        maxLength={6}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        size="md"
                        variant="subtle"
                        bg="gray.50"
                        textAlign="center"
                        fontSize="lg"
                        letterSpacing="2px"
                      />
                      <Flex gap={2} flexDirection={{ base: "column", sm: "row" }}>
                        <Button
                          onClick={confirmVerificationCode}
                          variant="solid"
                          size="sm"
                          loading={isLoadingVerifyCode}
                          disabled={
                            isLoadingVerifyCode ||
                            normalizeVerificationCode(verificationCode).length !== 6
                          }
                          colorScheme="blue"
                          flex={1}
                        >
                          Confirm Code
                        </Button>
                        <Button
                          onClick={sendVerificationCode}
                          variant="outline"
                          size="sm"
                          colorScheme="gray"
                          loading={isLoadingSendCode}
                          disabled={resendCooldown > 0 || isLoadingSendCode}
                          flex={1}
                        >
                          {resendCooldown > 0
                            ? `Resend (${resendCooldown}s)`
                            : "Resend Code"}
                        </Button>
                        <Button
                          onClick={() => {
                            setEmailVerificationStep("idle")
                            setVerificationCode("")
                            setCodeError("")
                          }}
                          variant="outline"
                          size="sm"
                          flex={1}
                        >
                          Cancel
                        </Button>
                      </Flex>
                    </VStack>
                  )}

                  {emailVerificationStep === "verified" && (
                    <Text fontSize="sm" color="green.600" mt={2}>
                      ✓ Email verified successfully
                    </Text>
                  )}
                </Field>

                {requiresEmployeeId && (
                  <Field
                    label="Employee ID"
                    invalid={!!errors.employee_id}
                    errorText={errors.employee_id?.message}
                    required
                  >
                    <Input
                      {...register("employee_id", {
                        validate: (value) =>
                          !requiresEmployeeId ||
                          value.trim().length > 0 ||
                          "Employee ID is required",
                      })}
                      placeholder="Enter your employee ID"
                      type="text"
                      size="md"
                      variant="subtle"
                      bg="gray.50"
                    />
                  </Field>
                )}

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
          )}
        </Container>
      </Flex>
    </Flex>
  )
}
