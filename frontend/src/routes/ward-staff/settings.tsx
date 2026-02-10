import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/ward-staff/settings")({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-gray-600">Settings functionality coming soon...</p>
    </div>
  )
}

export default SettingsPage
