import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import AdminNavbar from "@/components/Admin/AdminNavbar"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
  beforeLoad: async () => {
    if (import.meta.env.DEV) return

    if (!isLoggedIn()) {
      throw redirect({ to: "/login" })
    }

    // Check that the logged-in user actually has admin privileges
    const token = localStorage.getItem("access_token")
    const BASE = import.meta.env.VITE_API_URL || ""
    try {
      const res = await fetch(`${BASE}/api/v1/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw redirect({ to: "/login" })
      const user = await res.json()
      if (!user.is_superuser) {
        // Send non-admin users to their appropriate home page
        throw redirect({
          to: user.managerid ? "/nurse-manager/home" : "/ward-staff/home",
        })
      }
    } catch (e) {
      // Re-throw redirects; treat anything else as an auth failure
      if (e && typeof e === "object" && "to" in e) throw e
      throw redirect({ to: "/login" })
    }
  },
})

function AdminLayout() {
  return (
    <div className="flex flex-col min-h-screen">
      <AdminNavbar />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
