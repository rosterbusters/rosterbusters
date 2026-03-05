import { Box, Container, Flex, Heading, Image, Input, Text, VStack } from "@chakra-ui/react"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link as RouterLink, redirect } from "@tanstack/react-router"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FiArrowLeft, FiMail } from "react-icons/fi"

import { type ApiError } from "@/client"
import { Button } from "@chakra-ui/react"
import { Field } from "@/components/ui/field"
import { InputGroup } from "@/components/ui/input-group"
import { isLoggedIn } from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
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
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>()
  const { showSuccessToast } = useCustomToast()

  const recoverPassword = async (_data: FormData) => {
    // TODO: Backend endpoint not implemented yet
    throw new Error("Password recovery not implemented")
  }

  const mutation = useMutation({
    mutationFn: recoverPassword,
    onSuccess: () => {
      showSuccessToast("Password recovery email sent successfully.")
      reset()
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
          <VStack gap={3} align="stretch">

            {/* Header */}
            <VStack gap={0} align="start" mb={1}>
              <Heading
                as="h1"
                size="lg"
                fontWeight="700"
                color="teal.700"
              >
                Password Recovery
              </Heading>
              <Text color="gray.500" fontSize="sm">
                Enter your email and we'll send you a recovery link.
              </Text>
            </VStack>

            {/* Form */}
            <Box as="form" onSubmit={handleSubmit(onSubmit)}>
              <VStack gap={3} align="stretch">
                <Field invalid={!!errors.email} errorText={errors.email?.message}>
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
                  loading={isSubmitting}
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
        </Container>
      </Flex>
    </Flex>
  )
}
