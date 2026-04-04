import { expect, test } from "@playwright/test"
import * as XLSX from "xlsx"
import fs from "fs"
import {
  buildUsernameFromName,
  buildWorkbook,
  createUser,
  deleteUser,
  findUserIdByUsername,
  getAdminToken,
  getImportableWards,
  getUserByUsername,
  writeWorkbookTempFile,
} from "./admin-helpers"

function buildCenWorkbook(rows: Array<Record<string, string>>) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["Name", "Position", "Department", "Remarks"],
  })
  XLSX.utils.book_append_sheet(wb, ws, "CEN Listing")
  return wb
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
  const duplicateUsername = `importdup${suffix}`
  const duplicateEmployeeId = `DUP${suffix}`
  const psaEntries = [
    {
      name: `SNR PSA ${suffix}`,
      occupation: "SNR PATIENT SERVICE ASST",
      employeeId: `PSA${suffix}A`,
    },
    {
      name: `PSA ${suffix} I`,
      occupation: "PATIENT SERVICE ASST I",
      employeeId: `PSA${suffix}B`,
    },
    {
      name: `PSA ${suffix} II`,
      occupation: "PATIENT SERVICE ASST II",
      employeeId: `PSA${suffix}C`,
    },
  ]
  const psaUsernames = psaEntries.map((entry) =>
    buildUsernameFromName(entry.name),
  )

  const createdUserIds: number[] = []
  const createdUsernames: string[] = []
  const skippedUsernames: string[] = [...psaUsernames]

  let filePath = ""

  try {
    const existingUserId = await findUserIdByUsername(
      request,
      token,
      duplicateUsername,
    )
    if (existingUserId) {
      await deleteUser(request, token, existingUserId)
    }

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
        "EMP NAME": `Nurse${suffix} A`,
        "OCCUPATION": "Staff Nurse",
        "DEPARTMENT CODE": wardA.wardname,
      },
      {
        "Employee ID": `N${suffix}02`,
        "EMP NAME": `Nurse${suffix} B`,
        "OCCUPATION": "Staff Nurse",
        "DEPARTMENT CODE": wardA.wardname,
      },
      {
        "Employee ID": `M${suffix}01`,
        "EMP NAME": `Manager${suffix} A`,
        "OCCUPATION": "Nurse Manager",
        "DEPARTMENT CODE": wardA.wardname,
      },
      {
        "Employee ID": `M${suffix}02`,
        "EMP NAME": `Manager${suffix} B`,
        "OCCUPATION": "Nurse Manager",
        "DEPARTMENT CODE": wardB.wardname,
      },
      ...psaEntries.map((entry) => ({
        "Employee ID": entry.employeeId,
        "EMP NAME": entry.name,
        "OCCUPATION": entry.occupation,
        "DEPARTMENT CODE": wardA.wardname,
      })),
    ]

    // TODO: Update existing records when matching employee_id/username instead of failing.

    const workbook = buildWorkbook(rows)
    filePath = writeWorkbookTempFile(workbook, `staff-import-${suffix}.xlsx`)

    await page.addInitScript((value) => {
      localStorage.setItem("access_token", value)
    }, token)

    await page.goto("/admin/users")
    await expect(
      page.getByRole("option", { name: wardA.wardname }),
    ).toBeAttached({ timeout: 15_000 })
    await expect(
      page.getByRole("option", { name: wardB.wardname }),
    ).toBeAttached({ timeout: 15_000 })

    await page.setInputFiles('input[type="file"]', filePath)

    const progressModal = page.getByText("Importing Staff List")
    await expect(progressModal).toBeVisible()

    await expect(progressModal).toBeHidden({ timeout: 60_000 })
    await expect(
      page.getByTestId("toast").filter({
        hasText: "Row 2: This employee ID is already assigned to a nurse.",
      }),
    ).toBeVisible()
    await expect(
      page.getByTestId("toast-container"),
    ).toContainText('skipped because "SNR PATIENT SERVICE ASST" is a PSA role')
    await expect(
      page.getByTestId("toast-container"),
    ).toContainText('skipped because "PATIENT SERVICE ASST I" is a PSA role')
    await expect(
      page.getByTestId("toast-container"),
    ).toContainText('skipped because "PATIENT SERVICE ASST II" is a PSA role')

    const importFailuresDialog = page.getByText("Import Failures")
    if (await importFailuresDialog.count()) {
      await expect(importFailuresDialog).toBeVisible()
      await page.getByRole("button", { name: "Done" }).click()
      await expect(importFailuresDialog).toBeHidden()
    }

    const search = page.getByTestId("admin-users-search")
    await expect(search).toBeAttached({ timeout: 15_000 })
    await search.scrollIntoViewIfNeeded()

    const expectedUsers = [
      { name: `Nurse${suffix} A`, wardId: wardA.wardid },
      { name: `Nurse${suffix} B`, wardId: wardA.wardid },
      { name: `Manager${suffix} A`, wardId: wardA.wardid },
      { name: `Manager${suffix} B`, wardId: wardB.wardid },
    ]

    const expectedUsernames: Array<{ username: string; wardId: number }> = []
    const usedUsernames = new Set<string>()
    for (const entry of expectedUsers) {
      const base = buildUsernameFromName(entry.name)
      let candidate = base
      let suffixNumber = 1
      while (usedUsernames.has(candidate)) {
        suffixNumber += 1
        candidate = `${base}${suffixNumber}`
      }
      usedUsernames.add(candidate)
      expectedUsernames.push({ username: candidate, wardId: entry.wardId })
    }

    for (const entry of expectedUsernames) {
      const username = entry.username
      createdUsernames.push(username)

      const createdUser = await getUserByUsername(request, token, username)
      if (!createdUser) {
        throw new Error(`Imported user not found in API: ${username}`)
      }
      if (createdUser.userid) {
        createdUserIds.push(createdUser.userid)
      }
      const wardIds = createdUser.wards.map((w: { ward_id: number }) => w.ward_id)
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
      const row = page.getByRole("row").filter({ hasText: username }).first()
      await expect(row).toBeVisible()
      await expect(row).toContainText(username)
    }

    for (const psaUsername of psaUsernames) {
      const skippedUser = await getUserByUsername(request, token, psaUsername)
      if (skippedUser) {
        throw new Error(
          `PSA user should not be imported but exists in API: ${psaUsername}`,
        )
      }

      await search.fill(psaUsername)
      await expect(page.getByText("No users found.")).toBeVisible()
    }

  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    for (const username of createdUsernames) {
      const userid = await findUserIdByUsername(request, token, username)
      if (userid && !createdUserIds.includes(userid)) {
        createdUserIds.push(userid)
      }
    }
    for (const username of skippedUsernames) {
      const userid = await findUserIdByUsername(request, token, username)
      if (userid && !createdUserIds.includes(userid)) {
        createdUserIds.push(userid)
      }
    }
    for (const userid of createdUserIds.reverse()) {
      await deleteUser(request, token, userid)
    }
  }
})

test("imports nurse manager designation from staff list", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  const token = await getAdminToken(request)
  const wards = await getImportableWards(request, token)
  const ward = wards[0]

  const suffix = Date.now().toString().slice(-6)
  const managerName = `Manager ${suffix} Nurse`
  const managerUsername = buildUsernameFromName(managerName)
  const employeeId = `MN${suffix}`

  let filePath = ""

  try {
    const rows = [
      {
        "Employee ID": employeeId,
        "EMP NAME": managerName,
        "OCCUPATION": "Nurse Manager II",
        "DEPARTMENT CODE": ward.wardname,
      },
    ]

    const workbook = buildWorkbook(rows)
    filePath = writeWorkbookTempFile(workbook, `manager-import-${suffix}.xlsx`)

    await page.addInitScript((value) => {
      localStorage.setItem("access_token", value)
    }, token)

    await page.goto("/admin/users")
    await expect(
      page.getByRole("option", { name: ward.wardname }),
    ).toBeAttached({ timeout: 15_000 })
    await page.setInputFiles('input[type="file"]', filePath)

    const progressModal = page.getByText("Importing Staff List")
    await expect(progressModal).toBeVisible()
    await expect(progressModal).toBeHidden({ timeout: 60_000 })

    const createdUser = await getUserByUsername(request, token, managerUsername)
    if (!createdUser) {
      throw new Error(`Imported nurse manager not found: ${managerUsername}`)
    }

    if (!createdUser.roles.includes("NurseManager")) {
      throw new Error(
        `Imported user ${managerUsername} does not have NurseManager role.`,
      )
    }

    const wardIds: number[] = createdUser.wards.map((w: { ward_id: number }) => w.ward_id)
    if (!wardIds.includes(ward.wardid)) {
      throw new Error(
        `Imported user ${managerUsername} not assigned to ward ${ward.wardid}.`,
      )
    }
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    const userid = await findUserIdByUsername(request, token, managerUsername)
    if (userid) {
      await deleteUser(request, token, userid)
    }
  }
})

test("imports CEN Listing staff rows", async ({ page, request }) => {
  test.setTimeout(90_000)
  const token = await getAdminToken(request)
  const wards = await getImportableWards(request, token)
  const ward = wards[0]

  const suffix = Date.now().toString().slice(-6)
  const name = `Cen Manager ${suffix} Extra`
  const username = buildUsernameFromName(name)
  const employeeId = `CEN${suffix}`

  let filePath = ""

  try {
    const rows = [
      {
        Name: name,
        Position: "Nurse Manager II",
        Department: ward.wardname,
        Remarks: "INOP",
      },
    ]

    const workbook = buildCenWorkbook(rows)
    filePath = writeWorkbookTempFile(workbook, `cen-import-${suffix}.xlsx`)

    await page.addInitScript((value) => {
      localStorage.setItem("access_token", value)
    }, token)

    await page.goto("/admin/users")
    await expect(
      page.getByRole("option", { name: ward.wardname }),
    ).toBeAttached({ timeout: 15_000 })
    await page.setInputFiles('input[type="file"]', filePath)

    const progressModal = page.getByText("Importing Staff List")
    await expect(progressModal).toBeVisible()
    await expect(progressModal).toBeHidden({ timeout: 60_000 })

    const createdUser = await getUserByUsername(request, token, username)
    if (!createdUser) {
      throw new Error(`Imported CEN user not found: ${username}`)
    }

    if (!createdUser.roles.includes("NurseManager")) {
      throw new Error(
        `Imported CEN user ${username} does not have NurseManager role.`,
      )
    }

    const wardIds = createdUser.wards.map((w: { ward_id: number }) => w.ward_id)
    if (!wardIds.includes(ward.wardid)) {
      throw new Error(
        `Imported CEN user ${username} not assigned to ward ${ward.wardid}.`,
      )
    }

    if (!createdUser.isactive) {
      throw new Error(`Imported CEN user ${username} should be active.`)
    }
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    const userid = await findUserIdByUsername(request, token, username)
    if (userid) {
      await deleteUser(request, token, userid)
    }
  }
})
