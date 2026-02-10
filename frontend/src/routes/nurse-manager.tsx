import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import NurseManagerNavbar from "@/components/NurseManager/NurseManagerNavbar"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/nurse-manager")({
  component: NurseManagerLayout,
  // beforeLoad: async () => {
  //   if (!isLoggedIn()) {
  //     throw redirect({
  //       to: "/login",
  //     })
  //   }
  // },
})

function NurseManagerLayout() {
  return (
    <div className="flex flex-col h-screen">
      {/* Navbar only - NO sidebar for nurseManager routes */}
      <NurseManagerNavbar />

      {/* Main content area */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

export default NurseManagerLayout
