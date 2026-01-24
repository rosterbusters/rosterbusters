import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_wardStaff/leaveandshiftrequest')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/wardStaff/leaveandshiftrequest"!</div>
}
