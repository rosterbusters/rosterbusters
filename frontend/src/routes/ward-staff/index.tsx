import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/ward-staff/")({
  beforeLoad: async () => {
    // Redirect root path to /home for ward staff
    throw redirect({
      to: "/ward-staff/home",
    })
  },
})
