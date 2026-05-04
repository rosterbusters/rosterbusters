import fs from "node:fs"
import { expect, test } from "@playwright/test"
import {
  buildUsernameFromName,
  buildWorkbook,
  deleteUser,
  getAdminToken,
  getImportableWards,
  getUserByUsername,
  writeWorkbookTempFile,
} from "./admin-helpers"

async function waitForUserByUsername(
  request: Parameters<typeof getUserByUsername>[0],
  token: Parameters<typeof getUserByUsername>[1],
  username: string,
) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const user = await getUserByUsername(request, token, username)
    if (user) return user
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  return null
}

test("imported users show default password in the column", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  const token = await getAdminToken(request)
  const wards = await getImportableWards(request, token)
  const ward = wards[0]

  const suffix = Date.now().toString().slice(-6)
  const staffName = `Default ${suffix} Nurse`
  const username = buildUsernameFromName(staffName)
  const employeeId = `DP${suffix}`

  let filePath = ""
  let createdUserId: number | null = null

  try {
    const rows = [
      {
        "Employee ID": employeeId,
        "EMP NAME": staffName,
        OCCUPATION: "Staff Nurse",
        "DEPARTMENT CODE": ward.wardname,
      },
    ]

    const workbook = buildWorkbook(rows)
    filePath = writeWorkbookTempFile(workbook, `password-import-${suffix}.xlsx`)

    await page.addInitScript((value) => {
      localStorage.setItem("access_token", value)
      localStorage.setItem("token", value)
      sessionStorage.setItem("access_token", value)
      sessionStorage.setItem("token", value)
    }, token)

    await page.goto("/admin/users")
    await expect(
      page.getByRole("option", { name: ward.wardname }),
    ).toBeAttached()
    await page.setInputFiles('input[type="file"]', filePath)

    const progressModal = page.getByText("Importing Staff List")
    await expect(progressModal).toBeVisible()
    await expect(progressModal).toBeHidden({ timeout: 60_000 })

    const search = page.getByTestId("admin-users-search")
    await expect(search).toBeAttached({ timeout: 15_000 })
    await search.fill(username)

    const row = page.getByRole("row").filter({ hasText: username })
    await expect(row).toContainText(username)

    const defaultPasswordCell = row.getByRole("cell").nth(9)
    await expect(
      defaultPasswordCell.getByRole("button", { name: "Copy" }),
    ).toBeVisible()

    const passwordText = (
      await defaultPasswordCell.locator("span.font-mono").innerText()
    ).trim()
    expect(passwordText.length).toBeGreaterThan(0)

    const createdUser = await waitForUserByUsername(request, token, username)
    createdUserId = createdUser?.userid ?? null
    expect(createdUser?.generated_password ?? "").toBe(passwordText)
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    if (!createdUserId) {
      try {
        const fallback = await getUserByUsername(request, token, username)
        createdUserId = fallback?.userid ?? null
      } catch {
        createdUserId = null
      }
    }
    if (createdUserId) {
      try {
        await deleteUser(request, token, createdUserId)
      } catch {
        // ignore cleanup auth errors so they do not hide the actual assertion failure
      }
    }
  }
})
