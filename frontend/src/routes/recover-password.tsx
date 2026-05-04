import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Image,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation } from "@tanstack/react-query"
import {
  createFileRoute,
  Link as RouterLink,
  redirect,
} from "@tanstack/react-router"
import { useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FiArrowLeft, FiMail } from "react-icons/fi"
import type { ApiError } from "@/client"
import { Field } from "@/components/ui/field"
import { InputGroup } from "@/components/ui/input-group"
import { isLoggedIn } from "@/hooks/useAuth"
import { emailPattern, handleError } from "@/utils"

interface FormData {
  email: string
}

export const Route = createFileRoute("/recover-password")({
  component: RecoverPassword,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }
  },
})

function RecoverPassword() {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormData>()

  const recoverPassword = async (data: FormData) => {
    const BASE = import.meta.env.VITE_API_URL || ""
    const response = await fetch(
      `${BASE}/api/v1/password-recovery/${encodeURIComponent(data.email)}`,
      { method: "POST" },
    )
    if (!response.ok) {
      const err = await response.json()
      throw { body: err, status: response.status } as ApiError
    }
  }

  const mutation = useMutation({
    mutationFn: recoverPassword,
    onSuccess: () => {
      setSubmittedEmail(getValues("email"))
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
  })

  const onSubmit: SubmitHandler<FormData> = async (data) => {
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
          {/* ── "Check your email" confirmation state ── */}
          {submittedEmail ? (
            <VStack gap={5} align="stretch">
              {/* Icon */}
              <Flex justify="center">
                <Box
                  bg="teal.50"
                  borderRadius="full"
                  p={4}
                  display="inline-flex"
                >
                  <FiMail size={32} color="var(--chakra-colors-teal-600)" />
                </Box>
              </Flex>

              {/* Copy */}
              <VStack gap={1} align="center">
                <Heading
                  as="h1"
                  size="lg"
                  fontWeight="700"
                  color="teal.700"
                  textAlign="center"
                >
                  Check your inbox
                </Heading>
                <Text color="gray.500" fontSize="sm" textAlign="center">
                  We've sent a password reset link to{" "}
                  <Text as="span" fontWeight="600" color="gray.700">
                    {submittedEmail}
                  </Text>
                  . It expires in 48 hours.
                </Text>
              </VStack>

              {/* Resend */}
              <Button
                variant="outline"
                size="md"
                w="100%"
                loading={mutation.isPending}
                onClick={() => mutation.mutate({ email: submittedEmail })}
              >
                Resend email
              </Button>

              {/* Back to login */}
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
            /* ── Default: email form ── */
            <VStack gap={3} align="stretch">
              <VStack gap={0} align="start" mb={1}>
                <Heading as="h1" size="lg" fontWeight="700" color="teal.700">
                  Password Recovery
                </Heading>
                <Text color="gray.500" fontSize="sm">
                  Enter your email and we'll send you a recovery link.
                </Text>
              </VStack>

              <Box as="form" onSubmit={handleSubmit(onSubmit)}>
                <VStack gap={3} align="stretch">
                  <Field
                    invalid={!!errors.email}
                    errorText={errors.email?.message}
                  >
                    <InputGroup startElement={<FiMail color="gray" />} w="100%">
                      <Input
                        {...register("email", {
                          required: "Email is required",
                          pattern: emailPattern,
                        })}
                        placeholder="Email"
                        type="email"
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
                    Continue
                  </Button>

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
            </VStack>
          )}
        </Container>
      </Flex>
    </Flex>
  )
}
