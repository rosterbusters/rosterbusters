import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import Navbar from "@/components/Common/Navbar"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/ward-staff")({
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
