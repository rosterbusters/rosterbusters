import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/ward-staff/leaveandshiftrequest")({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/wardStaff/leaveandshiftrequest"!</div>
}
