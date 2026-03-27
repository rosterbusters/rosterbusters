import type { APIRequestContext } from "@playwright/test"
import * as XLSX from "xlsx"
import os from "os"
import path from "path"

export const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8000"
export const ADMIN_EMAIL =
  process.env.E2E_SUPERUSER || process.env.FIRST_SUPERUSER || ""
export const ADMIN_PASSWORD =
  process.env.E2E_SUPERUSER_PASSWORD ||
  process.env.FIRST_SUPERUSER_PASSWORD ||
  ""

export const STAFF_LIST_WARD_ALIASES: Record<string, string[]> = {
  acaciaward: ["acaciaward"],
  angsanaward: ["angsanaward"],
  banyanward: ["banyanward"],
  casuarinaward: ["casuarinaward"],
  cedarward: ["cedarward"],
  dahliaward: ["dahliaward", "dahilaward"],
  daisyward: ["daisyward"],
  ward4: ["ward4", "ward04"],
  ward5: ["ward5", "ward05"],
  ward6: ["ward6", "ward06"],
  ward7: ["ward7", "ward07"],
  ward8: ["ward8", "ward08"],
  ward9: ["ward9", "ward09"],
  ward10: ["ward10"],
  ward11: ["ward11"],
}

export const normalizeWardName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b0+(\d+)/g, "$1")
    .replace(/\bdahila\b/g, "dahlia")
    .replace(/[^a-z0-9]+/g, "")

export const isWardImportable = (wardName: string) => {
  const normalized = normalizeWardName(wardName)
  const aliases = STAFF_LIST_WARD_ALIASES[normalized]
  if (!aliases) return false
  return true
}

export const slugifyUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")

export const buildUsernameFromName = (value: string) => {
  const firstTwoWords = value.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return slugifyUsername(firstTwoWords.join(" "))
}

export async function getAdminToken(request: APIRequestContext) {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Missing admin credentials. Set E2E_SUPERUSER and E2E_SUPERUSER_PASSWORD (or FIRST_SUPERUSER / FIRST_SUPERUSER_PASSWORD).",
    )
  }

  const res = await request.post(`${API_BASE_URL}/api/v1/login/access-token`, {
    form: { username: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })

  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to login as admin: ${res.status()} ${body}`)
  }

  const json = await res.json()
  return json.access_token as string
}

export async function getAnyWard(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE_URL}/api/v1/wards/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to load wards: ${res.status()} ${body}`)
  }
  const wards = (await res.json()) as Array<{ wardid: number; wardname: string }>
  if (!wards.length) {
    throw new Error("No wards found. Seed a ward before running this test.")
  }
  return wards[0]
}

export async function getImportableWards(
  request: APIRequestContext,
  token: string,
) {
  const res = await request.get(`${API_BASE_URL}/api/v1/wards/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to load wards: ${res.status()} ${body}`)
  }
  const wards = (await res.json()) as Array<{
    wardid: number
    wardname: string
    isactive?: boolean
  }>
  if (!wards.length) {
    throw new Error("No wards found. Seed a ward before running this test.")
  }
  const activeWards = wards.filter((w) => w.isactive)
  const importable = activeWards.filter((w) => isWardImportable(w.wardname))
  if (!importable.length) {
    throw new Error(
      "No importable ward found. Ensure ward names match import aliases.",
    )
  }
  return importable
}

export async function createUser(
  request: APIRequestContext,
  token: string,
  payload: Record<string, unknown>,
) {
  const res = await request.post(`${API_BASE_URL}/api/v1/admin/users`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: payload,
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to create user: ${res.status()} ${body}`)
  }
  return res.json() as Promise<{
    userid: number
    username: string
    email?: string
    generated_password?: string | null
  }>
}

export async function deleteUser(
  request: APIRequestContext,
  token: string,
  userid: number,
) {
  await request.delete(`${API_BASE_URL}/api/v1/admin/users/${userid}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function findUserIdByUsername(
  request: APIRequestContext,
  token: string,
  username: string,
) {
  const params = new URLSearchParams({
    skip: "0",
    limit: "20",
    search: username,
  })
  const res = await request.get(
    `${API_BASE_URL}/api/v1/admin/users?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  if (!res.ok()) return null
  const json = (await res.json()) as {
    data: Array<{ userid: number; username: string }>
  }
  const match = json.data.find((u) => u.username === username)
  return match?.userid ?? null
}

export async function getUserByUsername<T = any>(
  request: APIRequestContext,
  token: string,
  username: string,
) {
  const params = new URLSearchParams({
    skip: "0",
    limit: "20",
    search: username,
  })
  const res = await request.get(
    `${API_BASE_URL}/api/v1/admin/users?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to fetch user: ${res.status()} ${body}`)
  }
  const json = (await res.json()) as { data: Array<T & { username: string }> }
  const match = json.data.find((u) => u.username === username)
  if (!match) return null
  const maybeUserId = (match as any).userid as number | undefined
  if (!maybeUserId) return match
  const detailRes = await request.get(
    `${API_BASE_URL}/api/v1/admin/users/${maybeUserId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  if (!detailRes.ok()) return match
  const detail = (await detailRes.json()) as T
  return { ...match, ...detail }
}

export function buildWorkbook(rows: Array<Record<string, string>>) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["Employee ID", "EMP NAME", "OCCUPATION", "DEPARTMENT CODE"],
  })
  XLSX.utils.book_append_sheet(wb, ws, "NUR")
  return wb
}

export function writeWorkbookTempFile(
  workbook: XLSX.WorkBook,
  filename: string,
) {
  const filePath = path.join(os.tmpdir(), filename)
  XLSX.writeFile(workbook, filePath)
  return filePath
}
