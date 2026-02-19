import { createFileRoute, redirect, isRedirect } from "@tanstack/react-router"
import { isLoggedIn } from "@/hooks/useAuth"
import { UsersService } from "@/client"

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({ to: "/login" })
    }

    try {
      const user = await UsersService.readUserMe()
      if (user.managerid) {
        throw redirect({ to: "/nurse-manager" })
      }
      throw redirect({ to: "/ward-staff" })
    } catch (e) {
      if (isRedirect(e)) throw e
      // Token is invalid/expired
      localStorage.removeItem("access_token")
      throw redirect({ to: "/login" })
    }
  },
})
