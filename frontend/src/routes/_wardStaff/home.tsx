import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_wardStaff/home")({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Welcome to Ward Staff Dashboard</h1>
      <p className="text-gray-600">Select an option from the navigation menu to get started.</p>
    </div>
  )
}

export default HomePage
