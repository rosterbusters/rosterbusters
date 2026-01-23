import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/wardStaff/staffrosterschedule')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/wardStaff/staffrosterschedule"!</div>
}
