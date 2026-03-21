import { expect, test, type APIRequestContext } from "@playwright/test"

const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8000"
const ADMIN_EMAIL =
  process.env.E2E_SUPERUSER || process.env.FIRST_SUPERUSER || ""
const ADMIN_PASSWORD =
  process.env.E2E_SUPERUSER_PASSWORD ||
  process.env.FIRST_SUPERUSER_PASSWORD ||
  ""

async function getAdminToken(request: APIRequestContext) {
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

async function getAnyWard(request: APIRequestContext, token: string) {
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
  return res.json() as Promise<{ userid: number; username: string; email?: string }>
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

test("admin can see newly created nurse and nurse manager", async ({
  page,
  request,
}) => {
  const token = await getAdminToken(request)
  const ward = await getAnyWard(request, token)

  const suffix = Date.now().toString().slice(-6)
  const nurseUsername = `test.nurse.${suffix}`
  const nurseManagerUsername = `test.manager.${suffix}`
  const nurseEmail = `test.nurse.${suffix}@example.com`
  const nurseManagerEmail = `test.manager.${suffix}@example.com`

  const createdUserIds: number[] = []

  try {
    const nurse = await createUser(request, token, {
      username: nurseUsername,
      name: `Test Nurse`,
      email: nurseEmail,
      employee_id: `N${suffix}`,
      designation: "RN",
      role: "Nurse",
      ward_ids: [ward.wardid],
    })
    createdUserIds.push(nurse.userid)

    const manager = await createUser(request, token, {
      username: nurseManagerUsername,
      name: `Test Manager`,
      email: nurseManagerEmail,
      employee_id: `M${suffix}`,
      role: "NurseManager",
      ward_ids: [ward.wardid],
    })
    createdUserIds.push(manager.userid)

    await page.addInitScript((value) => {
      localStorage.setItem("access_token", value)
    }, token)

    await page.goto("/admin/users")

    const search = page.getByPlaceholder("Search by name or email...")

    await search.fill(nurseEmail)
    const nurseRow = page.getByRole("row").filter({ hasText: nurseUsername })
    await expect(nurseRow).toContainText(nurseUsername)
    await expect(
      nurseRow.getByTestId(`admin-user-ward-${ward.wardid}`),
    ).toBeVisible()

    await search.fill(nurseManagerEmail)
    const managerRow = page
      .getByRole("row")
      .filter({ hasText: nurseManagerUsername })
    await expect(managerRow).toContainText(nurseManagerUsername)
    await expect(
      managerRow.getByTestId(`admin-user-ward-${ward.wardid}`),
    ).toBeVisible()
  } finally {
    for (const userid of createdUserIds.reverse()) {
      await deleteUser(request, token, userid)
    }
  }
})
