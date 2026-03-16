import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import Navbar from "@/components/Common/Navbar"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/ward-staff")({
  component: WardStaffLayout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({ to: "/login", search: { message: "Please log in", error: "" } })
    }

    const token = localStorage.getItem("access_token")
    const BASE = import.meta.env.VITE_API_URL || ""
    try {
      const res = await fetch(`${BASE}/api/v1/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw redirect({ to: "/login", search: { message: "Please log in", error: "" } })
      const user = await res.json()
      if (user.is_superuser) {
        throw redirect({ to: "/admin/dashboard", search: {} })
      }
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e
      throw redirect({ to: "/login", search: { message: "Please log in", error: "" } })
    }
  },
})

function WardStaffLayout() {
  return (
    <div>
      {/* Navbar only - NO sidebar for wardStaff routes */}
      <Navbar />

      {/* Main content area */}
      <main>
        <Outlet />
      </main>
    </div>
  )
}

export default WardStaffLayout
