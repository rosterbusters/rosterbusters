import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/nurse-manager/")({
  beforeLoad: async () => {
    // Redirect root path to home for nurse manager
    throw redirect({
      to: "/nurse-manager/home",
    })
  },
})
