import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useEffect } from "react"
import { useForm, type SubmitHandler } from "react-hook-form"
import { z } from "zod"
import {
  AdminService,
  type AdminUser,
  type AdminUserCreate,
  type AdminUserUpdate,
  type WardOption,
} from "@/client/adminService"
import useCustomToast from "@/hooks/useCustomToast"
import { emailPattern } from "@/utils"
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react"

const usersSearchSchema = z.object({
  page: z.number().catch(1),
})

const PER_PAGE = 10

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
  validateSearch: (search) => usersSearchSchema.parse(search),
})

/* ------------------------------------------------------------------ */
/*  Add / Edit user dialog                                            */
/* ------------------------------------------------------------------ */

interface UserFormData {
  username: string
  email: string
  password: string
  confirm_password: string
  is_active: boolean
  role: string
}

interface CreatedUserInfo {
  username: string
  generated_password?: string | null
}

function UserFormDialog({
  open,
  onClose,
  editUser,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  editUser?: AdminUser | null
  onCreated?: (info: CreatedUserInfo) => void
}) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const isEdit = !!editUser

  // Fetch wards for the dropdown
  const { data: wards = [] } = useQuery<WardOption[]>({
    queryKey: ["admin-wards"],
    queryFn: () => AdminService.listWards(),
    staleTime: 60_000,
  })

  const currentRole = isEdit ? (editUser.roles[0] ?? "") : ""

  // Multi-ward selection state
  const [selectedWardIds, setSelectedWardIds] = useState<number[]>(
    isEdit ? editUser.wards.map((w) => w.ward_id) : [],
  )

  const toggleWard = (wardId: number) => {
    setSelectedWardIds((prev) =>
      prev.includes(wardId)
        ? prev.filter((id) => id !== wardId)
        : [...prev, wardId],
    )
  }

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UserFormData>({
    mode: "onBlur",
    defaultValues: isEdit
      ? {
          username: editUser.username,
          email: editUser.email ?? "",
          password: "",
          confirm_password: "",
          is_active: editUser.isactive,
          role: currentRole,
        }
      : {
          username: "",
          email: "",
          password: "",
          confirm_password: "",
          is_active: true,
          role: "Nurse",
        },
  })

  const selectedRole = watch("role")

  const createMutation = useMutation({
    mutationFn: (data: AdminUserCreate) => AdminService.createUser(data),
    onSuccess: (result) => {
      showSuccessToast("User created successfully.")
      if (result.generated_password) {
        onCreated?.({
          username: result.username,
          generated_password: result.generated_password,
        })
      }
      reset()
      onClose()
    },
    onError: (err: any) => {
      showErrorToast(err.body?.detail ?? err.message ?? "Failed to create user.")
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  })

  const updateMutation = useMutation({
    mutationFn: (data: AdminUserUpdate) =>
      AdminService.updateUser(editUser!.userid, data),
    onSuccess: () => {
      showSuccessToast("User updated successfully.")
      reset()
      onClose()
    },
    onError: (err: any) => {
      showErrorToast(err.body?.detail ?? err.message ?? "Failed to update user.")
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  })

  const onSubmit: SubmitHandler<UserFormData> = (data) => {
    if (isEdit) {
      const payload: AdminUserUpdate = {
        username: data.username,
        email: data.email || undefined,
        is_active: data.is_active,
      }
      if (data.password) payload.password = data.password
      // Only send ward_ids if this user is a nurse or manager
      if (currentRole === "Nurse" || currentRole === "NurseManager") {
        payload.ward_ids = selectedWardIds
      }
      updateMutation.mutate(payload)
    } else {
      const payload: AdminUserCreate = {
        username: data.username,
        is_active: data.is_active,
        role: data.role,
      }
      if (data.email) payload.email = data.email
      if (data.password) payload.password = data.password
      if (data.role === "Nurse" || data.role === "NurseManager") {
        payload.ward_ids = selectedWardIds
      }
      createMutation.mutate(payload)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">
            {isEdit ? "Edit User" : "Add User"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit as SubmitHandler<UserFormData>)}>
          <div className="p-6 space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                {...register("username", { required: "Username is required" })}
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="johndoe"
              />
              {errors.username && (
                <p className="text-red-500 text-xs mt-1">{errors.username.message}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email{" "}
                {!isEdit && (
                  <span className="text-gray-400 text-xs">(optional — user can add on first login)</span>
                )}
              </label>
              <input
                {...register("email", {
                  pattern: emailPattern,
                })}
                type="email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="user@example.com"
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password{" "}
                {!isEdit && (
                  <span className="text-gray-400 text-xs">(leave blank to auto-generate)</span>
                )}
                {isEdit && (
                  <span className="text-gray-400 text-xs">(leave blank to keep current)</span>
                )}
              </label>
              <input
                {...register("password", {
                  minLength: { value: 8, message: "Password must be at least 8 characters" },
                })}
                type="password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="********"
              />
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                {...register("confirm_password", {
                  validate: (value) =>
                    !getValues().password ||
                    value === getValues().password ||
                    "Passwords do not match",
                })}
                type="password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="********"
              />
              {errors.confirm_password && (
                <p className="text-red-500 text-xs mt-1">{errors.confirm_password.message}</p>
              )}
            </div>

            {/* Role (only on create) */}
            {!isEdit && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                <select
                  {...register("role")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Nurse">Nurse</option>
                  <option value="NurseManager">Nurse Manager</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
            )}

            {/* Role display (read-only on edit) */}
            {isEdit && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <div className="flex flex-wrap gap-1 py-2">
                  {editUser!.roles.map((role) => (
                    <span
                      key={role}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        role === "Admin"
                          ? "bg-orange-100 text-orange-700"
                          : role === "NurseManager"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {role === "NurseManager" ? "Nurse Manager" : role}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Ward assignment — show for Nurse / NurseManager */}
            {(isEdit
              ? currentRole === "Nurse" || currentRole === "NurseManager"
              : selectedRole === "Nurse" || selectedRole === "NurseManager"
            ) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {(isEdit ? currentRole : selectedRole) === "NurseManager"
                    ? "Manages Wards"
                    : "Assigned Wards"}
                  {(isEdit ? currentRole : selectedRole) === "Nurse" && (
                    <span className="text-gray-400 text-xs ml-1">(first = primary ward for scheduling)</span>
                  )}
                </label>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-300 divide-y divide-gray-100">
                  {wards.filter((w) => w.isactive).length === 0 ? (
                    <p className="px-3 py-2 text-sm text-gray-400">No wards available</p>
                  ) : (
                    wards
                      .filter((w) => w.isactive)
                      .map((w) => (
                        <label
                          key={w.wardid}
                          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedWardIds.includes(w.wardid)}
                            onChange={() => toggleWard(w.wardid)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-gray-900">{w.wardname}</span>
                          {w.location && (
                            <span className="text-gray-400 text-xs">({w.location})</span>
                          )}
                        </label>
                      ))
                  )}
                </div>
                {selectedWardIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedWardIds.length} ward{selectedWardIds.length !== 1 ? "s" : ""} selected
                  </p>
                )}
              </div>
            )}

            {/* Active toggle */}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...register("is_active")}
                className="rounded border-gray-300"
              />
              Active
            </label>
          </div>

          <div className="flex justify-end gap-3 p-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : isEdit ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Delete confirmation dialog                                        */
/* ------------------------------------------------------------------ */

function DeleteDialog({
  open,
  onClose,
  user,
}: {
  open: boolean
  onClose: () => void
  user: AdminUser | null
}) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [deleting, setDeleting] = useState(false)

  const mutation = useMutation({
    mutationFn: (id: number) => AdminService.deleteUser(id),
    onSuccess: () => {
      showSuccessToast("User deleted successfully.")
      onClose()
    },
    onError: (err: any) => {
      showErrorToast(err.body?.detail ?? "Failed to delete user.")
    },
    onSettled: () => {
      setDeleting(false)
      queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
  })

  if (!open || !user) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete User</h2>
        <p className="text-sm text-gray-600 mb-6">
          Are you sure you want to delete{" "}
          <strong>{user.username || user.email}</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setDeleting(true)
              mutation.mutate(user.userid)
            }}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

const ROLE_COLORS: Record<string, string> = {
  Admin: "bg-orange-100 text-orange-700",
  NurseManager: "bg-purple-100 text-purple-700",
  Nurse: "bg-blue-100 text-blue-700",
}

function AdminUsers() {
  const navigate = useNavigate({ from: Route.fullPath })
  const { page } = Route.useSearch()

  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null)
  const [createdUserInfo, setCreatedUserInfo] = useState<CreatedUserInfo | null>(null)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      // Reset to page 1 when search changes
      if (page !== 1) {
        navigate({ search: (prev: any) => ({ ...prev, page: 1 }) })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", { page, search: debouncedSearch }],
    queryFn: () =>
      AdminService.listUsers((page - 1) * PER_PAGE, PER_PAGE, debouncedSearch),
    placeholderData: (prev) => prev,
  })

  const users = data?.data ?? []
  const count = data?.count ?? 0
  const totalPages = Math.ceil(count / PER_PAGE)

  const setPage = (p: number) =>
    navigate({ search: (prev: any) => ({ ...prev, page: p }) })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Users Management</h1>
            <p className="text-sm text-gray-500">{count} total users</p>
          </div>
        </div>
        <button
          onClick={() => {
            setEditUser(null)
            setFormOpen(true)
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Username</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Roles</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Ward</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.userid} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{user.username}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]">
                      {user.email || <span className="text-gray-400 italic">Not set</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length > 0
                          ? user.roles.map((role) => (
                              <span
                                key={role}
                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[role] ?? "bg-gray-100 text-gray-700"}`}
                              >
                                {role}
                              </span>
                            ))
                          : <span className="text-xs text-gray-400">No roles</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {user.wards && user.wards.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.wards.map((w) => (
                            <span
                              key={w.ward_id}
                              className="text-xs px-2 py-0.5 rounded-full font-medium bg-teal-100 text-teal-700"
                            >
                              {w.ward_name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          user.isactive
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {user.isactive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditUser(user)
                            setFormOpen(true)
                          }}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit user"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteUser(user)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <UserFormDialog
        key={editUser?.userid ?? "new"}
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditUser(null)
        }}
        editUser={editUser}
        onCreated={setCreatedUserInfo}
      />
      <DeleteDialog
        open={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        user={deleteUser}
      />

      {/* Generated password dialog */}
      {createdUserInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">User Created</h2>
            <p className="text-sm text-gray-600 mb-4">
              Share these credentials with{" "}
              <strong>{createdUserInfo.username}</strong>. They will be required
              to change their password on first login.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Username:</span>
                <span className="font-mono font-medium text-gray-900">
                  {createdUserInfo.username}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Password:</span>
                <span className="font-mono font-medium text-gray-900">
                  {createdUserInfo.generated_password}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Username: ${createdUserInfo.username}\nPassword: ${createdUserInfo.generated_password}`,
                  )
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Copy
              </button>
              <button
                onClick={() => setCreatedUserInfo(null)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
