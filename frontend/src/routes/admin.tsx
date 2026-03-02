import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import AdminNavbar from "@/components/Admin/AdminNavbar"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
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
