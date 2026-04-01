/**
 * Thin client for the /api/v1/admin/* endpoints.
 *
 * These endpoints operate on the **RBACUser** table (the real auth table)
 * rather than the web_user table used by the generated UsersService.
 */

const BASE = import.meta.env.VITE_API_URL || ""

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("access_token")
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err: any = new Error(body.detail ?? res.statusText)
    err.status = res.status
    err.body = body
    throw err
  }
  return res.json()
}

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface WardInfo {
  ward_id: number
  ward_name: string
}

export interface AdminUser {
  userid: number
  username: string
  name: string | null
  email: string | null
  employee_id: string | null
  designation: string | null
  isactive: boolean
  nurseid: number | null
  managerid: number | null
  must_change_password: boolean
  roles: string[]
  wards: WardInfo[]
  generated_password?: string | null
}

export interface AdminPasswordResetResponse {
  username: string
  generated_password: string
}

export interface AdminUsersResponse {
  data: AdminUser[]
  count: number
}

export interface AdminUserCreate {
  name?: string
  email?: string
  employee_id?: string
  designation?: string
  password?: string
  is_active?: boolean
  role?: string
  ward_ids?: number[]
}

export interface AdminUserUpdate {
  username?: string
  name?: string
  email?: string | null
  employee_id?: string
  designation?: string
  password?: string
  is_active?: boolean
  ward_ids?: number[]
}

export interface WardOption {
  wardid: number
  wardname: string
  wardtype: string | null
  location: string | null
  isactive: boolean
  managerid: number | null
}

export interface DesignationOption {
  designation: string
  rank: string
}

// ---------------------------------------------------------------------------
//  Service
// ---------------------------------------------------------------------------

export const AdminService = {
  listUsers(skip = 0, limit = 100, search = ""): Promise<AdminUsersResponse> {
    const params = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
    })
    if (search) params.set("search", search)
    return request(`/api/v1/admin/users?${params.toString()}`)
  },

  getUser(userid: number): Promise<AdminUser> {
    return request(`/api/v1/admin/users/${userid}`)
  },

  createUser(data: AdminUserCreate): Promise<AdminUser> {
    return request(`/api/v1/admin/users`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  updateUser(userid: number, data: AdminUserUpdate): Promise<AdminUser> {
    return request(`/api/v1/admin/users/${userid}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  deleteUser(userid: number): Promise<{ message: string }> {
    return request(`/api/v1/admin/users/${userid}`, {
      method: "DELETE",
    })
  },

  resetUserPassword(userid: number): Promise<AdminPasswordResetResponse> {
    return request(`/api/v1/admin/users/${userid}/reset-password`, {
      method: "POST",
    })
  },

  listWards(): Promise<WardOption[]> {
    return request(`/api/v1/wards/`)
  },

  listDesignations(): Promise<DesignationOption[]> {
    return request(`/api/v1/admin/designations`)
  },

  firstLoginSetup(data: { new_password: string; email?: string; employee_id?: string }): Promise<{ message: string }> {
    return request(`/api/v1/users/me/first-login-setup`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },
}
