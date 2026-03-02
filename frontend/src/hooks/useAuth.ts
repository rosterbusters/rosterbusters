import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import {
  type Body_login_access_token as AccessToken,
  type ApiError,
  DefaultService,
  type UserPublic,
  type UserRegister,
  UsersService,
} from "@/client"
import { handleError } from "@/utils"

const isLoggedIn = () => {
  return localStorage.getItem("access_token") !== null
}

const useAuth = () => {
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: user } = useQuery<UserPublic | null, Error>({
    queryKey: ["currentUser"],
    queryFn: UsersService.readUserMe,
    enabled: isLoggedIn(),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const signUpMutation = useMutation({
    mutationFn: (data: UserRegister) =>
      UsersService.registerUser({ requestBody: data }),

    onSuccess: () => {
      navigate({ to: "/login" })
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
    },
  })

  const login = async (data: AccessToken) => {
    const response = await DefaultService.loginAccessToken({
      formData: data,
    })
    localStorage.setItem("access_token", response.access_token)
  }

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      // Fetch current user to determine role-based redirect
      const currentUser = await UsersService.readUserMe()
      queryClient.setQueryData(["currentUser"], currentUser)
      if (currentUser.is_superuser) {
        navigate({ to: "/admin/dashboard" })
      } else if (currentUser.managerid) {
        navigate({ to: "/nurse-manager/home" })
      } else {
        navigate({ to: "/ward-staff/home" })
      }
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
  })

  
  const logout = () => {
    // Cancel in-flight queries before removing the token to avoid 401s
    queryClient.cancelQueries()
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
    // Clear cached data without triggering refetches
    queryClient.clear()
    navigate({ to: "/login" })
  }

  return {
    signUpMutation,
    loginMutation,
    logout,
    user,
    error,
    resetError: () => setError(null),
  }
}

export { isLoggedIn }
export default useAuth
