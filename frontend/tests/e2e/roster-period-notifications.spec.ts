import { expect, test, type APIRequestContext } from "@playwright/test"

const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8000"
const MAILCATCHER_HOST = process.env.MAILCATCHER_HOST

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
) {
  const res = await request.post(`${API_BASE_URL}/api/v1/login/access-token`, {
    form: { username, password },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to login: ${res.status()} ${body}`)
  }
  const json = await res.json()
  return json.access_token as string
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

async function getActiveWard(
  request: APIRequestContext,
  token: string,
) {
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

async function listMailcatcherMessages(request: APIRequestContext) {
  if (!MAILCATCHER_HOST) {
    return []
  }
  const response = await request.get(`${MAILCATCHER_HOST}/messages`)
  if (!response.ok()) {
    throw new Error(`Mailcatcher not reachable: ${response.status()}`)
  }
  return (await response.json()) as Array<{ id: number }>
}

test("roster period notifications appear in queue and dropdown", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Missing admin credentials. Set E2E_SUPERUSER and E2E_SUPERUSER_PASSWORD (or FIRST_SUPERUSER / FIRST_SUPERUSER_PASSWORD).",
    )
  }

  const adminToken = await loginToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  const ward = await getActiveWard(request, adminToken)

  const suffix = Date.now().toString().slice(-6)
  const nurseUsername = `e2e.nurse.${suffix}`
  const nursePassword = `TestNr${suffix}!`
  const nurseEmail = `e2e.nurse.${suffix}@example.com`

  const createdUserIds: number[] = []

  const mailBefore = MAILCATCHER_HOST
    ? await listMailcatcherMessages(request)
    : []

  try {
    const nurseUser = await createUser(request, adminToken, {
      username: nurseUsername,
      name: "E2E Nurse",
      email: nurseEmail,
      employee_id: `NU${suffix}`,
      role: "Nurse",
      ward_ids: [ward.wardid],
      designation: "RN",
      password: nursePassword,
    })
    createdUserIds.push(nurseUser.userid)

    const nurseToken = await loginToken(request, nurseUsername, nursePassword)

    const triggerRes = await request.get(
      `${API_BASE_URL}/api/v1/shift-requests/periods/current-upcoming`,
      { headers: { Authorization: `Bearer ${nurseToken}` } },
    )
    expect(triggerRes.ok()).toBeTruthy()

    await expect
      .poll(
        async () => {
          const res = await request.get(
            `${API_BASE_URL}/api/v1/notifications/nurse?limit=20&offset=0`,
            { headers: { Authorization: `Bearer ${nurseToken}` } },
          )
          if (!res.ok()) {
            const body = await res.text()
            throw new Error(`Failed to fetch notifications: ${res.status()} ${body}`)
          }
          const payload = (await res.json()) as {
            notifications: Array<{ messagebody: string }>
          }
          return payload.notifications.map((n) => n.messagebody)
        },
        { timeout: 15_000, intervals: [500, 1000, 1500, 2000] },
      )
      .toContainEqual(expect.stringMatching(/Shift Request Period.*Now Open/i))

    if (MAILCATCHER_HOST) {
      await expect
        .poll(
          async () => (await listMailcatcherMessages(request)).length,
          { timeout: 15_000, intervals: [500, 1000, 1500, 2000] },
        )
        .toBeGreaterThan(mailBefore.length)
    }

    await page.addInitScript((value) => {
      localStorage.setItem("access_token", value)
    }, nurseToken)

    await page.goto("/ward-staff/home")
    await page.locator('button[aria-label="Notifications"]:visible').click()

    const dropdown = page.getByRole("menu").last()
    await expect(
      dropdown.getByText(/Shift Request Period.*Now Open/i),
    ).toBeVisible()
  } finally {
    for (const userid of createdUserIds.reverse()) {
      await deleteUser(request, adminToken, userid)
    }
  }
})
