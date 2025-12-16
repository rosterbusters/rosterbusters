import { createFileRoute } from '@tanstack/react-router'
import { Button } from "@/components/ui/button"

export const Route = createFileRoute('/wardStaff/test')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
  <>
  <div>Hello "/wardStaff/test"!</div>
  <Button _hover={{ bg: "cyan.500" }} variant="outline">Button</Button>
  </>
  )
}
