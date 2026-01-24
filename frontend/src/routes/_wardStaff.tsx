import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import Navbar from "@/components/Common/Navbar"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/_wardStaff")({
  component: WardStaffLayout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }
  },
})

function WardStaffLayout() {
  return (
    <div className="flex flex-col h-screen">
      {/* Navbar only - NO sidebar for wardStaff routes */}
      <Navbar />

      {/* Main content area */}
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  )
}

export default WardStaffLayout
