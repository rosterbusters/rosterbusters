import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_wardStaff/")({
  beforeLoad: async () => {
    // Redirect root path to /home for ward staff
    throw redirect({
      to: "/home",
    })
  },
})
