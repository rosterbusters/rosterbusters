import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/nurseManager/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/nurseManager/"!</div>
}
