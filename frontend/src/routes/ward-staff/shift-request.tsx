import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/ward-staff/shift-request")({
  component: ShiftRequest,
})

function ShiftRequest() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Shift Request</h1>
      <p className="text-gray-600">Shift request functionality coming soon...</p>
    </div>
  )
}

export default ShiftRequest
