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
  email: string
  isactive: boolean
  nurseid: number | null
  managerid: number | null
  roles: string[]
  wards: WardInfo[]
}

export interface AdminUsersResponse {
  data: AdminUser[]
  count: number
}

export interface AdminUserCreate {
  username: string
  email: string
  password: string
  is_active?: boolean
  role?: string
  ward_ids?: number[]
}

export interface AdminUserUpdate {
  username?: string
  email?: string
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

// ---------------------------------------------------------------------------
//  Service
// ---------------------------------------------------------------------------

export const AdminService = {
  listUsers(skip = 0, limit = 100): Promise<AdminUsersResponse> {
    return request(`/api/v1/admin/users?skip=${skip}&limit=${limit}`)
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

  listWards(): Promise<WardOption[]> {
    return request(`/api/v1/wards/`)
  },
}
