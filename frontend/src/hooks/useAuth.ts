import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import {
  type Body_login_access_token as AccessToken,
  type ApiError,
  DefaultService,
  UsersService,
} from "@/client"
import { handleError } from "@/utils"

export interface Email2FAChallenge {
  two_factor_token: string
}

/** Matches RBACUserPublic from the backend */
export interface CurrentUser {
  userid: number
  username: string
  email: string | null
  employee_id?: string | null
  join_date?: string | null
  nurseid?: number | null
  managerid?: number | null
  isactive: boolean
  is_superuser: boolean
  must_change_password?: boolean
  email_verified?: boolean
  wardid?: number | null
  name?: string | null
}

const isLoggedIn = () => {
  return localStorage.getItem("access_token") !== null
}

const useAuth = () => {
  const [error, setError] = useState<string | null>(null)
  const [email2faChallenge, setEmail2faChallenge] =
    useState<Email2FAChallenge | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: user, isLoading: isUserLoading } = useQuery<
    CurrentUser | null,
    Error
  >({
    queryKey: ["currentUser"],
    queryFn: () => UsersService.readUserMe() as unknown as Promise<CurrentUser>,
    enabled: isLoggedIn(),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const login = async (data: AccessToken) => {
    const response = await DefaultService.loginAccessToken({
      formData: data,
    })
    if (response.two_factor_required) {
      if (!response.two_factor_token) {
        throw new Error("Missing email 2FA challenge token")
      }
      setEmail2faChallenge({ two_factor_token: response.two_factor_token })
      return response
    }

    if (!response.access_token) {
      throw new Error("Missing access token")
    }

    localStorage.setItem("access_token", response.access_token)
    return response
  }

  const completeLoginRedirect = async () => {
    const currentUser =
      (await UsersService.readUserMe()) as unknown as CurrentUser
    queryClient.setQueryData(["currentUser"], currentUser)

    if (currentUser.must_change_password) {
      navigate({ to: "/first-login-setup" })
      return
    }

    if (currentUser.is_superuser) {
      navigate({ to: "/admin/dashboard" })
    } else if (currentUser.managerid) {
      navigate({ to: "/nurse-manager/home" })
    } else {
      navigate({ to: "/ward-staff/home" })
    }
  }

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async (response) => {
      if (response.two_factor_required) {
        setError("A verification code was sent to your email.")
        return
      }

      setError(null)
      setEmail2faChallenge(null)
      await completeLoginRedirect()
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
  })

  const verifyEmail2faMutation = useMutation({
    mutationFn: async (code: string) => {
      if (!email2faChallenge) {
        throw new Error("No pending email verification challenge")
      }
      return DefaultService.loginEmail2faVerify({
        requestBody: {
          two_factor_token: email2faChallenge.two_factor_token,
          code,
        },
      })
    },
    onSuccess: async (response) => {
      if (!response.access_token) {
        throw new Error("Missing access token")
      }
      localStorage.setItem("access_token", response.access_token)
      setEmail2faChallenge(null)
      setError(null)
      await completeLoginRedirect()
    },
    onError: (err: ApiError | Error) => {
      handleError(err as ApiError)
    },
  })

  const resendEmail2faMutation = useMutation({
    mutationFn: async () => {
      if (!email2faChallenge) {
        throw new Error("No pending email verification challenge")
      }

      return DefaultService.loginEmail2faResend({
        requestBody: {
          two_factor_token: email2faChallenge.two_factor_token,
        },
      })
    },
    onError: (err: ApiError | Error) => {
      handleError(err as ApiError)
    },
  })

  const cancelEmail2faChallenge = () => {
    setEmail2faChallenge(null)
    setError(null)
  }

  const logout = () => {
    // Cancel in-flight queries before removing the token to avoid 401s
    queryClient.cancelQueries()
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
    setEmail2faChallenge(null)
    // Clear cached data without triggering refetches
    queryClient.clear()
    navigate({ to: "/login" })
  }

  return {
    loginMutation,
    verifyEmail2faMutation,
    resendEmail2faMutation,
    email2faChallenge,
    cancelEmail2faChallenge,
    logout,
    user,
    isUserLoading,
    error,
    resetError: () => setError(null),
  }
}

export { isLoggedIn }
export default useAuth
