import { Box, Container, Flex, Heading, Image, Text, VStack, Separator, IconButton } from "@chakra-ui/react"
import { createFileRoute, Link as RouterLink } from "@tanstack/react-router"
import { FiLock, FiMail, FiEye, FiEyeOff } from "react-icons/fi"
import { FcGoogle } from "react-icons/fc"
import { useState } from "react"; 
import { useForm, SubmitHandler } from 'react-hook-form';
import type { Body_login_login_access_token as AccessToken } from "@/client"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@chakra-ui/react"
import { InputGroup } from "@/components/ui/input-group"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import { emailPattern, passwordRules } from "../utils"

export const Route = createFileRoute("/login")({
  component: Login,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      // throw redirect({
      //   to: "/",
      // })
    }
  },
})

function Login() {
  const { loginMutation, error, resetError } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  
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
                Sign In
              </Heading>
              <Text color="gray.500" fontSize="sm">
                Login with your <Text as="span" fontWeight="700" color="teal.600">SACH</Text> email.
              </Text>
            </VStack>

            {/* Google Button */}
            <Button
              onClick={handleGoogleLogin}
              size="md"
              variant="outline"
              borderColor="gray.300"
              color="gray.700"
              _hover={{ bg: "gray.50" }}
              w="100%"
              fontWeight="medium"
            >
              <Flex align="center" gap={2}>
                <FcGoogle size={20} />
                <Text as="span">Sign In With Google</Text>
              </Flex>
            </Button>

            {/* Separator */}
            <Flex align="center" width="100%" gap={3}>
              <Separator flex="1" borderColor="gray.200" />
              <Text fontSize="xs" color="gray.400" fontWeight="medium">OR</Text>
              <Separator flex="1" borderColor="gray.200" />
            </Flex>

            {/* Login Form */}
            <Box as="form" onSubmit={handleSubmit(onSubmit)}>
              <VStack gap={3} align="stretch"> 
                {/* Email */}
                <Field invalid={!!errors.username} errorText={errors.username?.message}>
                  <InputGroup startElement={<FiMail color="gray" />} w="100%">
                    <Input
                      {...register("username", { required: "Required", pattern: emailPattern })}
                      placeholder="Email Address"
                      type="email"
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
                      placeholder="Password"
                      type={showPassword ? "text" : "password"}
                      size="md"
                      variant="subtle"
                      bg="gray.50"
                    />
                  </InputGroup>
                </Field>

                {error && (
                  <Text color="red.500" fontSize="xs" textAlign="center">{error}</Text>
                )}

                <Button
                  type="submit"
                  variant='solid'
                  size="md"
                  w="100%"
                  loading={isSubmitting}
                  mt={1}
                >
                  Log In
                </Button>

                {/* Forgot Password Link */}
                <Flex justify="center" pt={1}>
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

                {/* Sign Up */}
                <Flex justify="center" align="center" gap={2} pt={2}>
                  <Text fontSize="sm" color="gray.500">
                    Don't have an account?
                  </Text>
                  <RouterLink 
                    to="/signup" 
                    style={{ 
                      fontSize: "13px", 
                      fontWeight: 600,
                      textDecoration: "none"
                    }}
                  >
                    Sign Up
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