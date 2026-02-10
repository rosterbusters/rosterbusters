import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/ward-staff/staffrosterschedule")({
  component: StaffRosterSchedule,
})

function StaffRosterSchedule() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Staff Roster Schedule</h1>
      <p className="text-gray-600">Staff roster schedule functionality coming soon...</p>
    </div>
  )
}

export default StaffRosterSchedule
