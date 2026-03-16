import { useEffect } from "react"
import { useNavigate, createFileRoute } from "@tanstack/react-router"
import { Center, Spinner, Text, VStack } from "@chakra-ui/react"
import { UsersService } from "@/client"

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
})

function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('token')
    const error = urlParams.get('error')

    if (error) {
      // Handle error - redirect to login with error message
      navigate({
        to: "/login",
        search: { error: error }
      })
      return
    }

    if (token) {
      // Store token in localStorage
      localStorage.setItem('access_token', token)

      // Fetch user to determine role-based redirect
      UsersService.readUserMe().then((user: any) => {
        if (user.must_change_password) {
          navigate({ to: "/first-login-setup" })
        } else if (user.managerid) {
          navigate({ to: "/nurse-manager/home" })
        } else {
          navigate({ to: "/ward-staff/home" })
        }
      }).catch(() => {
        navigate({ to: "/ward-staff/home" })
      })
    } else {
      // No token or error - redirect to login
      navigate({ to: "/login" })
    }
  }, [navigate])

  return (
    <Center h="100vh">
      <VStack gap={4}>
        <Spinner size="xl" color="teal.500" />
        <Text color="gray.600">Completing sign in...</Text>
      </VStack>
    </Center>
  )
}