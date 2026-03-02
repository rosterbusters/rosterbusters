import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import React from "react"
import { UsersService, WardsService } from "@/client"
import {
  Users,
  Building2,
  ShieldCheck,
  Activity,
} from "lucide-react"

export const Route = createFileRoute("/admin/dashboard")({
  component: AdminDashboard,
})

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div
          className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  )
}

function AdminDashboard() {
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["users", { page: 1 }],
    queryFn: () => UsersService.readUsers({ skip: 0, limit: 1000 }),
  })

  const { data: wardsData, isLoading: wardsLoading } = useQuery({
    queryKey: ["wards"],
    queryFn: () => WardsService.getWards(),
  })

  const totalUsers = usersData?.count ?? 0
  const activeWards = wardsData?.filter((w) => w.isactive !== false).length ?? 0
  const totalWards = wardsData?.length ?? 0
  const superusers =
    usersData?.data.filter((u) => u.is_superuser).length ?? 0

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">
          System overview and management controls
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Users"
          value={usersLoading ? "..." : totalUsers}
          icon={Users}
          color="bg-blue-500"
        />
        <StatCard
          title="Active Wards"
          value={wardsLoading ? "..." : activeWards}
          icon={Building2}
          color="bg-green-500"
        />
        <StatCard
          title="Total Wards"
          value={wardsLoading ? "..." : totalWards}
          icon={Activity}
          color="bg-purple-500"
        />
        <StatCard
          title="Superusers"
          value={usersLoading ? "..." : superusers}
          icon={ShieldCheck}
          color="bg-orange-500"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <a
            href="/admin/users"
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <Users className="w-5 h-5 text-blue-500" />
            <div>
              <p className="font-medium text-gray-900">Manage Users</p>
              <p className="text-sm text-gray-500">
                Create, edit, or delete user accounts
              </p>
            </div>
          </a>
          <a
            href="/admin/wards"
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <Building2 className="w-5 h-5 text-green-500" />
            <div>
              <p className="font-medium text-gray-900">Manage Wards</p>
              <p className="text-sm text-gray-500">
                Create, edit, or delete hospital wards
              </p>
            </div>
          </a>
          <a
            href="/admin/users"
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ShieldCheck className="w-5 h-5 text-orange-500" />
            <div>
              <p className="font-medium text-gray-900">Role Management</p>
              <p className="text-sm text-gray-500">
                Assign roles and permissions
              </p>
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}
