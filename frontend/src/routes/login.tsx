import { Box, Container, Flex, Heading, Image, Text, VStack, IconButton } from "@chakra-ui/react"
import { redirect,createFileRoute, Link as RouterLink } from "@tanstack/react-router"
import { FiLock, FiUser, FiEye, FiEyeOff, FiArrowLeft } from "react-icons/fi"
import { FcGoogle } from "react-icons/fc"
import { useEffect, useState } from "react"; 
import { useForm, SubmitHandler } from 'react-hook-form';
import type { Body_login_access_token as AccessToken } from "@/client"
import { UsersService } from "@/client"
import { Button } from "@chakra-ui/react";
import { showErrorToast } from "@/components/ui/toast"
import { Field } from "@/components/ui/field"
import { Input } from "@chakra-ui/react"
import { InputGroup } from "@/components/ui/input-group"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import { passwordRules } from "../utils"

export const Route = createFileRoute("/login")({
  component: Login,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      let user: any
      try {
        user = await UsersService.readUserMe() as any
      } catch {
        // Invalid/expired token — clear it and let the user log in again
        localStorage.removeItem("access_token")
        return
      }
      if (user.must_change_password) {
        throw redirect({ to: "/first-login-setup" })
      }
      if (user.is_superuser) {
        throw redirect({ to: "/admin/dashboard" })
      }
      if (user.managerid) {
        throw redirect({ to: "/nurse-manager/home" })
      }
      throw redirect({ to: "/ward-staff/home" })
    }
  },
})

function Login() {
  const {
    loginMutation,
    verifyEmail2faMutation,
    resendEmail2faMutation,
    email2faChallenge,
    cancelEmail2faChallenge,
    error,
    resetError,
  } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [verificationCode, setVerificationCode] = useState("")
  const [resendCooldown, setResendCooldown] = useState(0)

  const isTwoFactorStep = !!email2faChallenge

  useEffect(() => {
    if (isTwoFactorStep) {
      setVerificationCode("")
      setResendCooldown(0)
    } else {
      setVerificationCode("")
      setResendCooldown(0)
    }
  }, [isTwoFactorStep])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => {
      setResendCooldown((prev) => prev - 1)
    }, 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AccessToken>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      username: "",
      password: "",
    },
  })

  const onSubmit: SubmitHandler<AccessToken> = async (data) => {
    if (isSubmitting) return
    resetError()
    try {
      await loginMutation.mutateAsync(data)
    } catch {
      // error handling
    }
  }

  const handleVerifyCode = async () => {
    const code = verificationCode.trim()
    if (!code || code.length !== 6) {
      showErrorToast("Please enter the 6-digit code sent to your email.")
      return
    }
    try {
      await verifyEmail2faMutation.mutateAsync(code)
    } catch {
      // handled through hook error flow
    }
  }

  const handleBackToLogin = () => {
    cancelEmail2faChallenge()
    setVerificationCode("")
    setResendCooldown(0)
  }

  const handleGoogleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/api/v1/login/google`
  }

  const togglePasswordVisibility = () => setShowPassword(!showPassword)

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
        {/* Gradient Overlay */}
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

      {/* Functional Side - Form Overlay */}
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
                {isTwoFactorStep ? "Verify Login" : "Sign In"}
              </Heading>
              <Text color="gray.500" fontSize="sm">
                {isTwoFactorStep ? (
                  "Enter your verification code to continue."
                ) : (
                  <>Login with your <Text as="span" fontWeight="700" color="teal.600">SACH</Text> account.</>
                )}
              </Text>
            </VStack>


            {/* Login Form */}
            <Box
              as="form"
              onSubmit={(e) => {
                if (isTwoFactorStep) {
                  e.preventDefault()
                  handleVerifyCode()
                  return
                }
                handleSubmit(onSubmit)(e)
              }}
            >
              <VStack gap={3} align="stretch"> 
                {!isTwoFactorStep && (
                  <>
                    {/* Username */}
                    <Field invalid={!!errors.username} errorText={errors.username?.message}>
                      <InputGroup startElement={<FiUser color="gray" />} w="100%">
                        <Input
                          {...register("username", { required: "Required" })}
                          data-testid="login-username"
                          placeholder="Username, Email, or Employee ID"
                          type="text"
                          size="md"
                          variant="subtle"
                          bg="gray.50"
                        />
                      </InputGroup>
                    </Field>

                    {/* Password */}
                    <Field invalid={!!errors.password} errorText={errors.password?.message}>
                      <InputGroup
                        startElement={<FiLock color="gray" />}
                        endElement={
                          <IconButton
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            onClick={togglePasswordVisibility}
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
                          {...register("password", passwordRules())}
                          data-testid="login-password"
                          placeholder="Password"
                          type={showPassword ? "text" : "password"}
                          size="md"
                          variant="subtle"
                          bg="gray.50"
                        />
                      </InputGroup>
                    </Field>
                  </>
                )}

                {isTwoFactorStep && (
                  <Field
                    label="Verification Code"
                  >
                    <Flex gap={2} w="100%" direction={{ base: "column", sm: "row" }} align="stretch">
                      <Input
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        onPaste={(event) => {
                          event.preventDefault()
                          setVerificationCode(
                            event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6),
                          )
                        }}
                        placeholder="6-digit code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        size="md"
                        variant="subtle"
                        bg="gray.50"
                        flex="1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="md"
                        minW={{ base: "100%", sm: "140px" }}
                        onClick={async () => {
                          try {
                            await resendEmail2faMutation.mutateAsync()
                            setResendCooldown(60)
                          } catch {
                            // handled through hook error flow
                          }
                        }}
                        loading={resendEmail2faMutation.isPending}
                        disabled={resendCooldown > 0 || resendEmail2faMutation.isPending}
                      >
                        {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend Code"}
                      </Button>
                    </Flex>
                    <Text fontSize="sm" color="gray.500" mt={2}>
                      Enter the 6-digit code sent to your email.
                    </Text>
                    <Flex justify="center" mt={2} w="100%">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        mx="auto"
                        onClick={handleBackToLogin}
                      >
                        <Flex align="center" gap={2}>
                          <FiArrowLeft />
                          Back to Login
                        </Flex>
                      </Button>
                    </Flex>
                  </Field>
                )}

                {error && (
                  <Text color="red.500" fontSize="xs" textAlign="center">{error}</Text>
                )}

                <Button
                  type={isTwoFactorStep ? "button" : "submit"}
                  variant='solid'
                  size="md"
                  w="100%"
                  loading={isSubmitting || loginMutation.isPending || verifyEmail2faMutation.isPending}
                  mt={1}
                  onClick={isTwoFactorStep ? handleVerifyCode : undefined}
                >
                  {isTwoFactorStep ? "Verify Code" : "Log In"}
                </Button>

                {/* Forgot Password Link */}
                <Flex justify="center" pt={1} display={isTwoFactorStep ? "none" : "flex"}>
                  <RouterLink 
                    to="/recover-password" 
                    style={{ 
                      color: "var(--chakra-colors-teal-600)", 
                      fontSize: "13px", 
                      fontWeight: 600,
                      textDecoration: "none"
                    }}
                  >
                    Forgot Password?
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
