import { expect, test, type APIRequestContext } from "@playwright/test"
import * as XLSX from "xlsx"
import fs from "fs"
import os from "os"
import path from "path"

const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8000"
const ADMIN_EMAIL =
  process.env.E2E_SUPERUSER || process.env.FIRST_SUPERUSER || ""
const ADMIN_PASSWORD =
  process.env.E2E_SUPERUSER_PASSWORD ||
  process.env.FIRST_SUPERUSER_PASSWORD ||
  ""

const STAFF_LIST_WARD_ALIASES: Record<string, string[]> = {
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

const normalizeWardName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b0+(\d+)/g, "$1")
    .replace(/\bdahila\b/g, "dahlia")
    .replace(/[^a-z0-9]+/g, "")

const isWardImportable = (wardName: string) => {
  const normalized = normalizeWardName(wardName)
  const aliases = STAFF_LIST_WARD_ALIASES[normalized]
  if (!aliases) return false
  return true
}

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

async function getImportableWards(
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
  const activeWards = wards.filter((w) => w.isactive !== false)
  const importable = activeWards.filter((w) => isWardImportable(w.wardname))
  if (!importable.length) {
    throw new Error(
      "No importable ward found. Ensure ward names match import aliases.",
    )
  }
  return importable
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
  return res.json() as Promise<{ userid: number; username: string }>
}

async function findUserIdByUsername(
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
  const json = (await res.json()) as { data: Array<{ userid: number; username: string }> }
  const match = json.data.find((u) => u.username === username)
  return match?.userid ?? null
}

async function getUserByUsername(
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
  const json = (await res.json()) as {
    data: Array<{ username: string; wards: Array<{ ward_id: number }> }>
  }
  const match = json.data.find((u) => u.username === username)
  if (!match) return null
  return match
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

function buildWorkbook(rows: Array<Record<string, string>>) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["Employee ID", "EMP NAME", "OCCUPATION", "DEPARTMENT CODE"],
  })
  XLSX.utils.book_append_sheet(wb, ws, "NUR")
  return wb
}

function writeWorkbookTempFile(workbook: XLSX.WorkBook, filename: string) {
  const filePath = path.join(os.tmpdir(), filename)
  XLSX.writeFile(workbook, filePath)
  return filePath
}

test("imports staff list from Excel with duplicates flagged", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  const token = await getAdminToken(request)
  const wards = await getImportableWards(request, token)
  if (wards.length < 2) {
    throw new Error(
      "Need at least 2 importable wards to assign two nurse managers.",
    )
  }
  const wardA = wards[0]
  const wardB = wards[1]

  const suffix = Date.now().toString().slice(-6)
  const duplicateUsername = `import.dup.${suffix}`
  const duplicateEmployeeId = `DUP${suffix}`

  const createdUserIds: number[] = []
  const createdUsernames: string[] = []

  let filePath = ""

  try {
    const duplicateUser = await createUser(request, token, {
      username: duplicateUsername,
      name: "Import Duplicate",
      email: `import.dup.${suffix}@example.com`,
      employee_id: duplicateEmployeeId,
      role: "Nurse",
      ward_ids: [wardA.wardid],
    })
    createdUserIds.push(duplicateUser.userid)

    const rows = [
      {
        "Employee ID": duplicateEmployeeId,
        "EMP NAME": `Duplicate Nurse ${suffix}`,
        "OCCUPATION": "Staff Nurse",
        "DEPARTMENT CODE": wardA.wardname,
      },
      {
        "Employee ID": `N${suffix}01`,
        "EMP NAME": `Test Nurse A ${suffix}`,
        "OCCUPATION": "Staff Nurse",
        "DEPARTMENT CODE": wardA.wardname,
      },
      {
        "Employee ID": `N${suffix}02`,
        "EMP NAME": `Test Nurse B ${suffix}`,
        "OCCUPATION": "Staff Nurse",
        "DEPARTMENT CODE": wardA.wardname,
      },
      {
        "Employee ID": `M${suffix}01`,
        "EMP NAME": `Test Manager A ${suffix}`,
        "OCCUPATION": "Nurse Manager",
        "DEPARTMENT CODE": wardA.wardname,
      },
      {
        "Employee ID": `M${suffix}02`,
        "EMP NAME": `Test Manager B ${suffix}`,
        "OCCUPATION": "Nurse Manager",
        "DEPARTMENT CODE": wardB.wardname,
      },
    ]

    // TODO: Update existing records when matching employee_id/username instead of failing.

    const workbook = buildWorkbook(rows)
    filePath = writeWorkbookTempFile(workbook, `staff-import-${suffix}.xlsx`)

    await page.addInitScript((value) => {
      localStorage.setItem("access_token", value)
    }, token)

    await page.goto("/admin/users")

    await page.setInputFiles('input[type="file"]', filePath)

    const progressModal = page.getByText("Importing Staff List")
    await expect(progressModal).toBeVisible()

    await expect(progressModal).toBeHidden({ timeout: 60_000 })
    await expect(
      page.getByTestId("toast").filter({
        hasText: "Row 2: This employee ID is already assigned to a nurse.",
      }),
    ).toBeVisible()

    const search = page.getByPlaceholder("Search by name or email...")

    const createdNames = [
      { username: `test.nurse.a.${suffix}`, wardId: wardA.wardid },
      { username: `test.nurse.b.${suffix}`, wardId: wardA.wardid },
      { username: `test.manager.a.${suffix}`, wardId: wardA.wardid },
      { username: `test.manager.b.${suffix}`, wardId: wardB.wardid },
    ]

    for (const entry of createdNames) {
      const username = entry.username
      createdUsernames.push(username)

      const createdUser = await getUserByUsername(request, token, username)
      if (!createdUser) {
        throw new Error(`Imported user not found in API: ${username}`)
      }
      const wardIds = createdUser.wards.map((w) => w.ward_id)
      if (!wardIds.includes(entry.wardId)) {
        const toastText = await page
          .getByTestId("toast-container")
          .innerText()
          .catch(() => "")
        throw new Error(
          `Imported user ${username} not assigned to ward ${entry.wardId}. ` +
            `Observed ward_ids=${JSON.stringify(wardIds)}. ` +
            (toastText ? `Toasts: ${toastText}` : ""),
        )
      }

      await search.fill(username)
      const row = page.getByRole("row").filter({ hasText: username })
      await expect(row).toContainText(username)
    }

  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    for (const username of createdUsernames) {
      const userid = await findUserIdByUsername(request, token, username)
      if (userid) await deleteUser(request, token, userid)
    }
    for (const userid of createdUserIds.reverse()) {
      await deleteUser(request, token, userid)
    }
  }
})
