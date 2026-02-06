import { createFileRoute, Outlet } from "@tanstack/react-router"

import Navbar from "@/components/Common/Navbar"

export const Route = createFileRoute("/_wardStaff")({
  component: WardStaffLayout,
  // beforeLoad: async () => {
  //   if (!isLoggedIn()) {
  //     throw redirect({
  //       to: "/login",
  //     })
  //   }
  // },
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
