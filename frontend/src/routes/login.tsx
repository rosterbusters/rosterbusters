import { Box, Container, Flex, Heading, Image, Text, VStack, Separator } from "@chakra-ui/react"
import { createFileRoute, Link as RouterLink, redirect } from "@tanstack/react-router"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FiLock, FiMail } from "react-icons/fi"
import { FcGoogle } from "react-icons/fc"
import { useState } from "react"

import type { Body_login_login_access_token as AccessToken } from "@/client"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@chakra-ui/react"
import { InputGroup } from "@/components/ui/input-group"
import { PasswordInput } from "@/components/ui/password-input"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import { emailPattern, passwordRules } from "../utils"

export const Route = createFileRoute("/login")({
  component: Login,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

function Login() {
  const { loginMutation, error, resetError } = useAuth()
  const [showTraditionalLogin, setShowTraditionalLogin] = useState(false)
  
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
      // error is handled by useAuth hook
    }
  }

  const handleGoogleLogin = () => {
    // Redirect to Google OAuth endpoint
    window.location.href = `${import.meta.env.VITE_API_URL}/api/v1/login/google`
  }

  return (
    <Flex h="100vh" w="100vw" overflow="hidden">
      {/* Left side - Hospital Image */}
      <Box 
        flex="1" 
        display={{ base: "none", lg: "block" }}
        position="relative"
        overflow="hidden"
      >
        <Image
          src="/assets/images/sach-entrance.jpg"
          alt="St. Andrew's Community Hospital"
          objectFit="cover"
          w="100%"
          h="100%"
        />
      </Box>

      {/* Right side - Login Form */}
      <Flex
        flex="1"
        align="center"
        justify="center"
        bg="white"
        p={8}
      >
        <Container maxW="md" w="100%">
          <VStack gap={8} align="stretch">
            {/* Header */}
            <VStack gap={3} textAlign="center">
              <Heading 
                as="h1" 
                size="2xl" 
                fontWeight="bold"
                color="teal.600"
              >
                Sign In
              </Heading>
              <Text color="gray.600" fontSize="md">
                Welcome back! Login with your SACH work email for access.
              </Text>
            </VStack>

            {/* Google Sign In Button */}
            <Button
              onClick={handleGoogleLogin}
              size="lg"
              variant="outline"
              borderColor="gray.300"
              bg="white"
              _hover={{ bg: "gray.50" }}
              fontWeight="medium"
              fontSize="md"
              h="12"
            >
              <Flex align="center" gap={3}>
                <FcGoogle size={24} />
                <Text as="span">Sign In With Google</Text>
              </Flex>
            </Button>

            {/* Separator with "OR" */}
            {!showTraditionalLogin && (
              <>
                <Flex align="center" gap={4}>
                  <Separator />
                  <Text fontSize="sm" color="gray.500" whiteSpace="nowrap">
                    or sign in with email
                  </Text>
                  <Separator />
                </Flex>

                <Button
                  onClick={() => setShowTraditionalLogin(true)}
                  variant="ghost"
                  colorScheme="teal"
                  size="md"
                >
                  Use Email & Password
                </Button>
              </>
            )}

            {/* Traditional Login Form - Collapsible */}
            {showTraditionalLogin && (
              <>
                <Flex align="center" gap={4}>
                  <Separator />
                  <Text fontSize="sm" color="gray.500" whiteSpace="nowrap">
                    OR
                  </Text>
                  <Separator />
                </Flex>

                <Box 
                  as="form" 
                  onSubmit={handleSubmit(onSubmit)}
                >
                  <VStack gap={4} align="stretch">
                    {/* Email Field */}
                    <Field
                      invalid={!!errors.username}
                      errorText={errors.username?.message}
                      w="100%"
                    >
                      <InputGroup 
                        startElement={<FiMail />}
                        w="100%">
                        <Input
                          {...register("username", {
                            required: "Email is required",
                            pattern: emailPattern,
                          })}
                          placeholder="Email"
                          type="email"
                          size="lg"
                          w="100%"
                        />
                      </InputGroup>
                    </Field>

                    {/* Password Field */}
                    <Field
                      invalid={!!errors.password}
                      errorText={errors.password?.message}
                      w="100%"
                    >
                      <InputGroup 
                        startElement={<FiLock />}
                        w="100%"
                      >
                        <PasswordInput
                          {...register("password", passwordRules())}
                          placeholder="Password"
                          size="lg"
                          type="password"
                          errors={errors}
                          w="100%"
                        />
                      </InputGroup>
                    </Field>

                    {/* Error Message */}
                    {error && (
                      <Text color="red.500" fontSize="sm">
                        {error}
                      </Text>
                    )}

                    {/* Forgot Password Link */}
                    <Flex justify="flex-end">
                      <RouterLink 
                        to="/recover-password" 
                        style={{ 
                          color: "var(--chakra-colors-teal-600)",
                          fontSize: "14px",
                          textDecoration: "none"
                        }}
                      >
                        Forgot Password?
                      </RouterLink>
                    </Flex>

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      colorScheme="teal"
                      size="lg"
                      w="100%"
                      loading={isSubmitting}
                      loadingText="Logging in..."
                    >
                      Log In
                    </Button>
                  </VStack>
                </Box>
              </>
            )}

            {/* Sign Up Link */}
            <Text textAlign="center" fontSize="sm" color="gray.600">
              Don't have an account?{" "}
              <RouterLink 
                to="/signup" 
                style={{ 
                  color: "var(--chakra-colors-teal-600)",
                  fontWeight: "600",
                  textDecoration: "none"
                }}
              >
                Sign Up
              </RouterLink>
            </Text>
          </VStack>
        </Container>
      </Flex>
    </Flex>
  )
}