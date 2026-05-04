import { type APIRequestContext, expect, test } from "@playwright/test"
import { loginForE2E } from "../utils/auth"

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

async function createShiftRequest(
  request: APIRequestContext,
  token: string,
  payload: Record<string, unknown>,
) {
  const res = await request.post(`${API_BASE_URL}/api/v1/shift-requests`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: payload,
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to create shift request: ${res.status()} ${body}`)
  }
  return res.json() as Promise<{ requestid: number }>
}

async function reviewShiftRequest(
  request: APIRequestContext,
  token: string,
  requestId: number,
  status: "Approved" | "Rejected",
  rejectionreason?: string,
) {
  const res = await request.patch(
    `${API_BASE_URL}/api/v1/shift-requests/${requestId}/review`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { status, rejectionreason },
    },
  )
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to review shift request: ${res.status()} ${body}`)
  }
}

async function createLeaveRequest(
  request: APIRequestContext,
  token: string,
  payload: Record<string, unknown>,
) {
  const res = await request.post(`${API_BASE_URL}/api/v1/leave`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: payload,
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to create leave request: ${res.status()} ${body}`)
  }
  return res.json() as Promise<{ leaveid: number }>
}

async function reviewLeaveRequest(
  request: APIRequestContext,
  token: string,
  leaveId: number,
  status: "Approved" | "Rejected",
) {
  const res = await request.patch(
    `${API_BASE_URL}/api/v1/leave/${leaveId}/review`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      params: { status },
    },
  )
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to review leave request: ${res.status()} ${body}`)
  }
}

function addDays(dateStr: string, days: number) {
  const date = new Date(dateStr)
  date.setDate(date.getDate() + days)
  return date.toISOString().split("T")[0]
}

test("generation inputs classify shift requests", async ({ request }) => {
  test.setTimeout(90_000)

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
  const nurseUsername = `e2e.nurse.${suffix}`
  const nmPassword = `TestNm${suffix}!`
  const nursePassword = `TestNr${suffix}!`

  const createdUserIds: number[] = []
  const createdRequestIds: number[] = []

  let managerToken = ""
  const wardId = ward.wardid

  try {
    const nmUser = await createUser(request, adminToken, {
      username: nmUsername,
      name: "E2E Nurse Manager",
      email: `e2e.nm.${suffix}@example.com`,
      employee_id: `NM${suffix}`,
      role: "NurseManager",
      ward_ids: [wardId],
      password: nmPassword,
    })
    createdUserIds.push(nmUser.userid)

    const nurseUser = await createUser(request, adminToken, {
      username: nurseUsername,
      name: "E2E Nurse",
      email: `e2e.nurse.${suffix}@example.com`,
      employee_id: `NU${suffix}`,
      role: "Nurse",
      ward_ids: [wardId],
      designation: "RN",
      password: nursePassword,
    })
    createdUserIds.push(nurseUser.userid)

    if (!nurseUser.nurseid) {
      throw new Error("Created nurse user missing nurseid")
    }

    managerToken = await loginToken(request, nmUsername, nmPassword)

    const periodRes = await request.get(
      `${API_BASE_URL}/api/v1/shift-requests/periods/current-upcoming`,
      { headers: { Authorization: `Bearer ${managerToken}` } },
    )
    if (!periodRes.ok()) {
      const body = await periodRes.text()
      throw new Error(
        `Failed to fetch roster period window: ${periodRes.status()} ${body}`,
      )
    }
    const periodWindow = (await periodRes.json()) as {
      request_open_period?: { periodid: number; startdate: string }
      current_period?: { periodid: number; startdate: string }
      upcoming_period?: { periodid: number; startdate: string }
    }
    const period =
      periodWindow.request_open_period ||
      periodWindow.current_period ||
      periodWindow.upcoming_period
    if (!period) {
      throw new Error("No roster period found for shift request creation")
    }

    const approvedReq = await createShiftRequest(request, managerToken, {
      nurseid: nurseUser.nurseid,
      periodid: period.periodid,
      preferreddate: period.startdate,
      preferredshifttype: "A",
      reason: "E2E approved",
      priority: 1,
    })
    createdRequestIds.push(approvedReq.requestid)
    await reviewShiftRequest(
      request,
      managerToken,
      approvedReq.requestid,
      "Approved",
    )

    const pendingReq = await createShiftRequest(request, managerToken, {
      nurseid: nurseUser.nurseid,
      periodid: period.periodid,
      preferreddate: addDays(period.startdate, 1),
      preferredshifttype: "A",
      reason: "E2E pending",
      priority: 1,
    })
    createdRequestIds.push(pendingReq.requestid)

    const rejectedReq = await createShiftRequest(request, managerToken, {
      nurseid: nurseUser.nurseid,
      periodid: period.periodid,
      preferreddate: addDays(period.startdate, 2),
      preferredshifttype: "A",
      reason: "E2E rejected",
      priority: 1,
    })
    createdRequestIds.push(rejectedReq.requestid)
    await reviewShiftRequest(
      request,
      managerToken,
      rejectedReq.requestid,
      "Rejected",
      "E2E reject",
    )

    const inputsRes = await request.get(
      `${API_BASE_URL}/api/v1/roster/generation-inputs?ward_id=${wardId}&period_id=${period.periodid}`,
      { headers: { Authorization: `Bearer ${managerToken}` } },
    )
    if (!inputsRes.ok()) {
      const body = await inputsRes.text()
      throw new Error(`Failed to fetch inputs: ${inputsRes.status()} ${body}`)
    }
    const inputs = (await inputsRes.json()) as {
      hard_requests: Record<string, Array<[number, string]>>
      soft_requests: Record<string, Array<[number, string]>>
    }

    const nurseKey = String(nurseUser.nurseid)
    const hardRequests = inputs.hard_requests?.[nurseKey] ?? []
    const softRequests = inputs.soft_requests?.[nurseKey] ?? []

    // Approved shift => soft, pending shift => soft (with status labels), rejected shift excluded.
    expect(softRequests).toContainEqual([0, "AM", "approved"])
    expect(softRequests).toContainEqual([1, "AM", "pending"])
    expect(softRequests).not.toContainEqual([2, "AM", "rejected"])
    expect(hardRequests).not.toContainEqual([0, "AM"])

    // Rejected shift should not appear.
    expect(hardRequests).not.toContainEqual([2, "AM"])
    expect(softRequests).not.toContainEqual([2, "AM"])
  } finally {
    if (managerToken && createdRequestIds.length > 0) {
      for (const requestId of createdRequestIds) {
        await request.delete(
          `${API_BASE_URL}/api/v1/shift-requests/${requestId}`,
          { headers: { Authorization: `Bearer ${managerToken}` } },
        )
      }
    }

    if (adminToken) {
      await updateWardManager(request, adminToken, wardId, originalManagerId)
      for (const userId of createdUserIds) {
        await deleteUser(request, adminToken, userId)
      }
    }
  }
})

test("generation inputs include only approved leave requests", async ({
  request,
}) => {
  test.setTimeout(90_000)

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
  const nurseUsername = `e2e.nurse.${suffix}`
  const nmPassword = `TestNm${suffix}!`
  const nursePassword = `TestNr${suffix}!`

  const createdUserIds: number[] = []
  const createdLeaveIds: number[] = []

  let managerToken = ""
  const wardId = ward.wardid

  try {
    const nmUser = await createUser(request, adminToken, {
      username: nmUsername,
      name: "E2E Nurse Manager",
      email: `e2e.nm.${suffix}@example.com`,
      employee_id: `NM${suffix}`,
      role: "NurseManager",
      ward_ids: [wardId],
      password: nmPassword,
    })
    createdUserIds.push(nmUser.userid)

    const nurseUser = await createUser(request, adminToken, {
      username: nurseUsername,
      name: "E2E Nurse",
      email: `e2e.nurse.${suffix}@example.com`,
      employee_id: `NU${suffix}`,
      role: "Nurse",
      ward_ids: [wardId],
      designation: "RN",
      password: nursePassword,
    })
    createdUserIds.push(nurseUser.userid)

    if (!nurseUser.nurseid) {
      throw new Error("Created nurse user missing nurseid")
    }

    managerToken = await loginToken(request, nmUsername, nmPassword)

    const periodRes = await request.get(
      `${API_BASE_URL}/api/v1/shift-requests/periods/current-upcoming`,
      { headers: { Authorization: `Bearer ${managerToken}` } },
    )
    if (!periodRes.ok()) {
      const body = await periodRes.text()
      throw new Error(
        `Failed to fetch roster period window: ${periodRes.status()} ${body}`,
      )
    }
    const periodWindow = (await periodRes.json()) as {
      request_open_period?: { periodid: number; startdate: string }
      current_period?: { periodid: number; startdate: string }
      upcoming_period?: { periodid: number; startdate: string }
    }
    const period =
      periodWindow.request_open_period ||
      periodWindow.current_period ||
      periodWindow.upcoming_period
    if (!period) {
      throw new Error("No roster period found for leave request creation")
    }

    const leaveCodesRes = await request.get(
      `${API_BASE_URL}/api/v1/leave/leave-codes`,
      { headers: { Authorization: `Bearer ${managerToken}` } },
    )
    if (!leaveCodesRes.ok()) {
      const body = await leaveCodesRes.text()
      throw new Error(
        `Failed to fetch leave codes: ${leaveCodesRes.status()} ${body}`,
      )
    }
    const leaveCodes = (await leaveCodesRes.json()) as Array<{
      shiftcode: string
    }>
    const leaveCode = leaveCodes[0]?.shiftcode ?? null
    if (!leaveCode) {
      throw new Error("No leave codes found for leave request testing")
    }

    const approvedLeaveReq = await createLeaveRequest(request, managerToken, {
      nurseid: nurseUser.nurseid,
      startdate: addDays(period.startdate, 3),
      enddate: addDays(period.startdate, 3),
      leavetype: leaveCode,
      reason: "E2E approved leave",
    })
    createdLeaveIds.push(approvedLeaveReq.leaveid)

    const rejectedLeaveReq = await createLeaveRequest(request, managerToken, {
      nurseid: nurseUser.nurseid,
      startdate: addDays(period.startdate, 4),
      enddate: addDays(period.startdate, 4),
      leavetype: leaveCode,
      reason: "E2E rejected leave",
    })
    createdLeaveIds.push(rejectedLeaveReq.leaveid)
    await reviewLeaveRequest(
      request,
      managerToken,
      rejectedLeaveReq.leaveid,
      "Rejected",
    )

    const inputsRes = await request.get(
      `${API_BASE_URL}/api/v1/roster/generation-inputs?ward_id=${wardId}&period_id=${period.periodid}`,
      { headers: { Authorization: `Bearer ${managerToken}` } },
    )
    if (!inputsRes.ok()) {
      const body = await inputsRes.text()
      throw new Error(`Failed to fetch inputs: ${inputsRes.status()} ${body}`)
    }
    const inputs = (await inputsRes.json()) as {
      hard_requests: Record<string, Array<[number, string]>>
      soft_requests: Record<string, Array<[number, string]>>
    }

    const nurseKey = String(nurseUser.nurseid)
    const hardRequests = inputs.hard_requests?.[nurseKey] ?? []
    const softRequests = inputs.soft_requests?.[nurseKey] ?? []

    // Approved leave => hard leave code, rejected leave excluded.
    expect(hardRequests).toContainEqual([3, leaveCode])
    expect(softRequests).not.toContainEqual([3, leaveCode])
    expect(hardRequests).not.toContainEqual([4, leaveCode])
    expect(softRequests).not.toContainEqual([4, leaveCode])
  } finally {
    if (managerToken && createdLeaveIds.length > 0) {
      for (const leaveId of createdLeaveIds) {
        await request.delete(`${API_BASE_URL}/api/v1/leave/${leaveId}`, {
          headers: { Authorization: `Bearer ${managerToken}` },
        })
      }
    }

    if (adminToken) {
      await updateWardManager(request, adminToken, wardId, originalManagerId)
      for (const userId of createdUserIds) {
        await deleteUser(request, adminToken, userId)
      }
    }
  }
})
