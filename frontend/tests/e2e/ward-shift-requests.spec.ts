import { expect, test, type APIRequestContext } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { completeFirstLoginSetup } from "./admin-helpers"
import { loginForE2E } from "../utils/auth"

const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8000"
const ADMIN_EMAIL =
  process.env.E2E_SUPERUSER || process.env.FIRST_SUPERUSER || ""
const ADMIN_PASSWORD =
  process.env.E2E_SUPERUSER_PASSWORD ||
  process.env.FIRST_SUPERUSER_PASSWORD ||
  ""
const DB_CONTAINER_ENV =
  process.env.E2E_DB_CONTAINER ||
  process.env.DB_CONTAINER ||
  process.env.POSTGRES_CONTAINER
const DB_NAME = process.env.POSTGRES_DB || "app"
const DB_USER = process.env.POSTGRES_USER || "postgres"

const getDbContainerName = () => {
  if (DB_CONTAINER_ENV) return DB_CONTAINER_ENV

  try {
    const output = execFileSync(
      "docker",
      ["ps", "--format", "{{.Names}} {{.Image}}"],
      { encoding: "utf8" },
    )
    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const match = lines.find((line) => {
      const [, image] = line.split(/\s+/, 2)
      if (!image) return false
      return image.startsWith("postgres:")
    })
    if (match) return match.split(/\s+/, 1)[0]
  } catch (error) {
    throw new Error(
      `Unable to locate the Postgres container. Set E2E_DB_CONTAINER to the DB container name. ${String(error)}`,
    )
  }

  throw new Error(
    "Unable to locate the Postgres container. Set E2E_DB_CONTAINER to the DB container name.",
  )
}

const runScalarQuery = (sql: string) => {
  const container = getDbContainerName()
  return execFileSync(
    "docker",
    ["exec", container, "psql", "-U", DB_USER, "-d", DB_NAME, "-t", "-A", "-c", sql],
    { encoding: "utf8" },
  ).trim()
}

const parseCodes = (value: string) =>
  value
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)

const getWardShiftCodes = (wardId: number) => {
  const wardCodes = runScalarQuery(
    `select string_agg(s.shiftcode, ',' order by s.shiftcode) from ward_shiftcode w join shiftcode s on s.shiftcode = w.shiftcode where w.wardid = ${wardId} and s.isworking = true;`,
  )
  if (wardCodes) {
    return parseCodes(wardCodes)
  }
  const fallbackCodes = runScalarQuery(
    "select string_agg(shiftcode, ',' order by shiftcode) from shiftcode where isworking = true;",
  )
  return parseCodes(fallbackCodes)
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

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
  return res.json() as Promise<{ userid: number; nurseid?: number | null }>
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

async function deleteShiftRequest(
  request: APIRequestContext,
  token: string,
  requestId: number,
) {
  await request.delete(`${API_BASE_URL}/api/v1/shift-requests/${requestId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

async function getActiveWard(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE_URL}/api/v1/wards/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to fetch wards: ${res.status()} ${body}`)
  }
  const wards = (await res.json()) as Array<{
    wardid: number
    wardname: string
    isactive?: boolean
  }>
  const ward = wards.find((w) => w.isactive !== false) ?? wards[0]
  if (!ward) {
    throw new Error("No wards found. Seed a ward before running this test.")
  }
  return ward
}

test("ward staff can create a shift request from the calendar", async ({
  page,
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
  const ward = await getActiveWard(request, adminToken)

  const suffix = Date.now().toString().slice(-6)
  const nurseUsername = `e2e.nurse.${suffix}`
  const nursePassword = `TestNr${suffix}!`
  const nurseEmail = `e2e.nurse.${suffix}@example.com`
  const nurseEmployeeId = `NU${suffix}`
  const nurseName = "E2E Nurse"

  const createdUserIds: number[] = []
  let nurseToken = ""
  let createdRequestId: number | null = null

  try {
    const nurseUser = await createUser(request, adminToken, {
      username: nurseUsername,
      name: nurseName,
      email: nurseEmail,
      employee_id: nurseEmployeeId,
      role: "Nurse",
      ward_ids: [ward.wardid],
      designation: "RN",
      password: nursePassword,
    })
    createdUserIds.push(nurseUser.userid)

    nurseToken = await loginToken(
      request,
      nurseUsername,
      nursePassword,
      nurseEmail,
    )

    // Newly created users are flagged for first-time setup and are route-guarded
    // away from ward-staff pages until setup is completed.
    await completeFirstLoginSetup(request, nurseToken, {
      new_password: nursePassword,
      email: nurseEmail,
      employee_id: nurseEmployeeId,
    })

    const periodRes = await request.get(
      `${API_BASE_URL}/api/v1/shift-requests/periods/current-upcoming`,
      { headers: { Authorization: `Bearer ${nurseToken}` } },
    )
    if (!periodRes.ok()) {
      const body = await periodRes.text()
      throw new Error(
        `Failed to fetch roster period window: ${periodRes.status()} ${body}`,
      )
    }
    const periodWindow = (await periodRes.json()) as {
      request_open_period?: { periodid: number; startdate: string }
      upcoming_period?: { periodid: number; startdate: string }
    }

    const requestOpen = periodWindow.request_open_period
    const upcoming = periodWindow.upcoming_period
    if (!requestOpen || !upcoming) {
      throw new Error(
        "No request-open period found. Adjust roster period dates for local dev.",
      )
    }
    if (requestOpen.periodid !== upcoming.periodid) {
      throw new Error(
        "Request-open period does not match upcoming period. Adjust roster period dates for local dev.",
      )
    }

    await page.addInitScript((value) => {
      localStorage.setItem("access_token", value)
    }, nurseToken)

    await page.goto("/ward-staff/request-application")
    await expect(
      page.getByText("Leave and Shift Request Application"),
    ).toBeVisible()

    await expect(
      page.getByRole("button", { name: /Add Shift Request/i }),
    ).toBeVisible()

    await page
      .getByTestId(`request-calendar-cell-${requestOpen.startdate}`)
      .click()

    await expect(page.getByText("Create Shift Request")).toBeVisible()
    const dialog = page.getByRole("dialog")
    await page
      .getByRole("combobox", { name: "Requested Shift Type" })
      .click()

    const expectedCodes = getWardShiftCodes(ward.wardid)
    if (!expectedCodes.length) {
      throw new Error("No shift codes configured for ward.")
    }

    for (const code of expectedCodes) {
      const option = page.locator("div").filter({
        hasText: new RegExp(`^${escapeRegExp(code)}$`),
      })
      await expect(option.first()).toBeVisible()
    }

    await page
      .locator("div")
      .filter({ hasText: new RegExp(`^${escapeRegExp(expectedCodes[0])}$`) })
      .first()
      .click()

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/v1/shift-requests") &&
          res.request().method() === "POST",
      ),
      dialog.getByRole("button", { name: "Create" }).click(),
    ])

    const created = (await createResponse.json()) as { requestid?: number }
    createdRequestId = created.requestid ?? null
    if (!createdRequestId) {
      throw new Error("Shift request creation did not return a requestid.")
    }

    await expect(
      page.getByTestId(`shift-request-${createdRequestId}`),
    ).toBeVisible()
  } finally {
    if (createdRequestId && nurseToken) {
      await deleteShiftRequest(request, nurseToken, createdRequestId)
    }
    for (const userid of createdUserIds.reverse()) {
      await deleteUser(request, adminToken, userid)
    }
  }
})
