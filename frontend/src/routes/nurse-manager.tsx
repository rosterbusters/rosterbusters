import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import NurseManagerNavbar from "@/components/NurseManager/NurseManagerNavbar"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/nurse-manager")({
  component: NurseManagerLayout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({ to: "/login" })
    }

    const token = localStorage.getItem("access_token")
    const BASE = import.meta.env.VITE_API_URL || ""
    try {
      const res = await fetch(`${BASE}/api/v1/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw redirect({ to: "/login" })
      const user = await res.json()
      if (user.is_superuser) {
        throw redirect({ to: "/admin/dashboard" })
      }
      if (!user.managerid) {
        throw redirect({ to: "/ward-staff/home" })
      }
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e
      throw redirect({ to: "/login" })
    }
  },
})

function NurseManagerLayout() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Navbar only - NO sidebar for nurseManager routes */}
      <NurseManagerNavbar />

      {/* Main content area */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

export default NurseManagerLayout
