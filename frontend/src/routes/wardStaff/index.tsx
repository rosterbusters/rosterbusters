import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/wardStaff/')({
  component: HomePage,
})

function HomePage() {
  return <div>Hello "/wardStaff/"!</div>
}
