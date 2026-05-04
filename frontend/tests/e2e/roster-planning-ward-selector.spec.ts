import { type APIRequestContext, expect, test } from "@playwright/test"
import {
  completeLogin2faInUi,
  loginForE2E,
  verifyEmailForCurrentUser,
} from "../utils/auth"

const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8000"
const ADMIN_EMAIL =
  process.env.E2E_SUPERUSER || process.env.FIRST_SUPERUSER || ""
const ADMIN_PASSWORD =
  process.env.E2E_SUPERUSER_PASSWORD ||
  process.env.FIRST_SUPERUSER_PASSWORD ||
  ""

async function loginToken(
  request: APIRequestContext,
  username: string,
  password: string,
  recipientEmail?: string,
) {
  return loginForE2E({
    request,
    username,
    password,
    recipientEmail,
    apiBaseUrl: API_BASE_URL,
  })
}

async function createUser(
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
    nurseid?: number | null
    managerid?: number | null
  }>
}

async function deleteUser(
  request: APIRequestContext,
  token: string,
  userid: number,
) {
  await request.delete(`${API_BASE_URL}/api/v1/admin/users/${userid}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

async function completeFirstLogin(
  request: APIRequestContext,
  token: string,
  newPassword: string,
  employeeId: string,
  email?: string,
) {
  if (email) {
    await verifyEmailForCurrentUser({
      request,
      token,
      email,
      apiBaseUrl: API_BASE_URL,
    })
  }

  const res = await request.post(
    `${API_BASE_URL}/api/v1/users/me/first-login-setup`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        new_password: newPassword,
        employee_id: employeeId,
        ...(email ? { email } : {}),
      },
    },
  )
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to complete first login: ${res.status()} ${body}`)
  }
}

async function updateWardManager(
  request: APIRequestContext,
  token: string,
  wardId: number,
  managerId: number | null,
) {
  const res = await request.patch(`${API_BASE_URL}/api/v1/wards/${wardId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: { managerid: managerId },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to update ward: ${res.status()} ${body}`)
  }
}

test("roster planning shows a ward selection for nurse managers", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Missing admin credentials. Set E2E_SUPERUSER and E2E_SUPERUSER_PASSWORD (or FIRST_SUPERUSER / FIRST_SUPERUSER_PASSWORD).",
    )
  }

  const adminToken = await loginToken(
    request,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    ADMIN_EMAIL,
  )

  const wardsRes = await request.get(`${API_BASE_URL}/api/v1/wards/`)
  if (!wardsRes.ok()) {
    const body = await wardsRes.text()
    throw new Error(`Failed to fetch wards: ${wardsRes.status()} ${body}`)
  }
  const wards = (await wardsRes.json()) as Array<{
    wardid: number
    wardname: string
    managerid?: number | null
    isactive?: boolean
  }>
  const ward = wards.find((w) => w.isactive !== false) ?? wards[0]
  if (!ward) {
    throw new Error("No wards found. Seed a ward before running this test.")
  }

  const originalManagerId = ward.managerid ?? null
  const suffix = Date.now().toString().slice(-6)
  const nmUsername = `e2e.nm.${suffix}`
  const nmPassword = `TestNm${suffix}!`
  const nmEmployeeId = `NM${suffix}`
  const nmEmail = `e2e.nm.${suffix}@example.com`
  const nurseName = `E2E Nurse ${suffix}`
  const nurseUsername = `e2e.nurse.${suffix}`

  let nmUser: { userid: number } | null = null
  let nurseUser: { userid: number } | null = null

  try {
    nmUser = await createUser(request, adminToken, {
      username: nmUsername,
      email: nmEmail,
      employee_id: nmEmployeeId,
      password: nmPassword,
      role: "NurseManager",
      ward_ids: [ward.wardid],
    })
    const nmToken = await loginToken(request, nmUsername, nmPassword, nmEmail)
    await completeFirstLogin(
      request,
      nmToken,
      nmPassword,
      nmEmployeeId,
      nmEmail,
    )
    const meRes = await request.get(`${API_BASE_URL}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${nmToken}` },
    })
    if (!meRes.ok()) {
      const body = await meRes.text()
      throw new Error(
        `Failed to fetch current manager profile: ${meRes.status()} ${body}`,
      )
    }
    const currentManager = (await meRes.json()) as { managerid?: number | null }
    await updateWardManager(
      request,
      adminToken,
      ward.wardid,
      currentManager.managerid ?? null,
    )

    nurseUser = await createUser(request, adminToken, {
      username: nurseUsername,
      name: nurseName,
      email: `e2e.nurse.${suffix}@example.com`,
      password: `TestNurse${suffix}!`,
      role: "Nurse",
      designation: "Staff Nurse",
      ward_ids: [ward.wardid],
    })

    await expect
      .poll(
        async () => {
          const statsRes = await request.get(
            `${API_BASE_URL}/api/v1/roster/manager/statistics?ward_id=${ward.wardid}`,
            { headers: { Authorization: `Bearer ${nmToken}` } },
          )
          if (!statsRes.ok()) return false
          const stats = (await statsRes.json()) as {
            nurses?: Array<{ name?: string | null }>
          }
          return stats.nurses?.some((n) => n.name === nurseName) ?? false
        },
        { timeout: 30_000 },
      )
      .toBeTruthy()

    await page.goto("/login")
    await page.getByTestId("login-username").fill(nmUsername)
    await page.getByTestId("login-password").fill(nmPassword)
    await page.getByRole("button", { name: /log in/i }).click()
    await completeLogin2faInUi({ page, recipientEmail: nmEmail })

    if (page.url().includes("/first-login-setup")) {
      await page.getByPlaceholder("your.email@example.com").fill(nmEmail)
      await page.getByPlaceholder("At least 8 characters").fill(nmPassword)
      await page.getByPlaceholder("Repeat your password").fill(nmPassword)
      await page.getByRole("button", { name: /complete setup/i }).click()
    }

    await expect(page).toHaveURL(/\/nurse-manager\/home/, { timeout: 30_000 })

    await page.goto("/nurse-manager/roster-planning")

    const wardTrigger = page.getByTestId("roster-ward-trigger")
    await expect(wardTrigger).toBeVisible()
    await expect(wardTrigger).not.toContainText("Select Ward")
  } finally {
    if (nmUser?.userid) {
      await deleteUser(request, adminToken, nmUser.userid)
    }
    if (nurseUser?.userid) {
      await deleteUser(request, adminToken, nurseUser.userid)
    }
    await updateWardManager(request, adminToken, ward.wardid, originalManagerId)
  }
})
