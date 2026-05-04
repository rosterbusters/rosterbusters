import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/ward-staff/leave-request")({
  component: LeaveRequest,
})

function LeaveRequest() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Leave Request</h1>
      <p className="text-gray-600">
        Leave request functionality coming soon...
      </p>
    </div>
  )
}

export default LeaveRequest
