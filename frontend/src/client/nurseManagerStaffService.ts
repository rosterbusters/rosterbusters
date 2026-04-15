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

export interface NurseManagerWardInfo {
  ward_id: number
  ward_name: string
}

export interface NurseManagerStaffUser {
  userid: number
  nurseid: number
  username: string
  name: string
  email: string | null
  employee_id: string | null
  designation: string | null
  shift_pattern: "AM_ONLY" | "PM_ONLY" | null
  isactive: boolean
  must_change_password: boolean
  ward: NurseManagerWardInfo | null
  generated_password?: string | null
}

export interface NurseManagerPasswordResetResponse {
  username: string
  generated_password: string
}

export interface NurseManagerDesignationOption {
  designation: string
  rank: string
}

export interface NurseManagerStaffCreate {
  username?: string
  name: string
  email?: string
  employee_id: string
  designation: string
  shift_pattern?: "AM_ONLY" | "PM_ONLY" | null
  password?: string
  is_active?: boolean
  ward_id: number
}

export interface NurseManagerStaffUpdate {
  username?: string
  name?: string
  email?: string | null
  employee_id?: string
  designation?: string
  shift_pattern?: "AM_ONLY" | "PM_ONLY" | null
  password?: string
  is_active?: boolean
  ward_id?: number
}

export const NurseManagerStaffService = {
  listStaff(wardId: number): Promise<NurseManagerStaffUser[]> {
    return request(`/api/v1/users/nurse-manager/staff?ward_id=${wardId}`)
  },

  listDesignations(): Promise<NurseManagerDesignationOption[]> {
    return request(`/api/v1/users/nurse-manager/designations`)
  },

  createStaff(data: NurseManagerStaffCreate): Promise<NurseManagerStaffUser> {
    return request(`/api/v1/users/nurse-manager/staff`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  updateStaff(userid: number, data: NurseManagerStaffUpdate): Promise<NurseManagerStaffUser> {
    return request(`/api/v1/users/nurse-manager/staff/${userid}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  deleteStaff(userid: number): Promise<{ message: string }> {
    return request(`/api/v1/users/nurse-manager/staff/${userid}`, {
      method: "DELETE",
    })
  },

  resetStaffPassword(userid: number): Promise<NurseManagerPasswordResetResponse> {
    return request(`/api/v1/users/nurse-manager/staff/${userid}/reset-password`, {
      method: "POST",
    })
  },
}
