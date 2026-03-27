import { expect, test } from "@playwright/test"
import { execFileSync } from "node:child_process"
import {
  createUser,
  deleteUser,
  getAdminToken,
  getAnyWard,
  findUserIdByUsername,
  getUserByUsername,
} from "./admin-helpers"

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
    const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
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

const countRows = (sql: string) => {
  const value = runScalarQuery(sql)
  return Number.parseInt(value || "0", 10)
}

test("admin can see newly created nurse and nurse manager", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000)
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

test("admin deletion removes nurse and nurse manager records", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  const token = await getAdminToken(request)
  const ward = await getAnyWard(request, token)

  const suffix = Date.now().toString().slice(-6)
  const nurseUsername = `delete.nurse.${suffix}`
  const nurseManagerUsername = `delete.manager.${suffix}`
  const nurseEmail = `delete.nurse.${suffix}@example.com`
  const nurseManagerEmail = `delete.manager.${suffix}@example.com`

  const createdUserIds: number[] = []

  try {
    const nurse = await createUser(request, token, {
      username: nurseUsername,
      name: "Delete Nurse",
      email: nurseEmail,
      employee_id: `DN${suffix}`,
      designation: "RN",
      role: "Nurse",
      ward_ids: [ward.wardid],
    })
    createdUserIds.push(nurse.userid)

    const manager = await createUser(request, token, {
      username: nurseManagerUsername,
      name: "Delete Manager",
      email: nurseManagerEmail,
      employee_id: `DM${suffix}`,
      role: "NurseManager",
      ward_ids: [ward.wardid],
    })
    createdUserIds.push(manager.userid)

    const nurseDetails = await getUserByUsername<{
      userid: number
      nurseid?: number | null
    }>(request, token, nurseUsername)
    const managerDetails = await getUserByUsername<{
      userid: number
      managerid?: number | null
    }>(request, token, nurseManagerUsername)

    if (!nurseDetails?.nurseid) {
      throw new Error("Expected nurse to have a nurseid.")
    }
    if (!managerDetails?.managerid) {
      throw new Error("Expected nurse manager to have a managerid.")
    }

    await page.addInitScript((value) => {
      localStorage.setItem("access_token", value)
    }, token)
    await page.goto("/admin/users")

    const search = page.getByPlaceholder("Search by name or email...")

    await search.fill(nurseEmail)
    const nurseRow = page.getByRole("row").filter({ hasText: nurseUsername })
    await expect(nurseRow).toContainText(nurseUsername)
    await nurseRow.getByTitle("Delete user").click()
    await page.getByRole("button", { name: "Delete", exact: true }).click()

    await expect.poll(async () => {
      const id = await findUserIdByUsername(request, token, nurseUsername)
      return id ?? null
    }).toBe(null)

    await expect.poll(() =>
      countRows(`select count(*) from "User" where userid = ${nurseDetails.userid};`),
    ).toBe(0)
    await expect.poll(() =>
      countRows(`select count(*) from nurse where nurseid = ${nurseDetails.nurseid};`),
    ).toBe(0)

    await search.fill(nurseManagerEmail)
    const managerRow = page.getByRole("row").filter({ hasText: nurseManagerUsername })
    await expect(managerRow).toContainText(nurseManagerUsername)
    await managerRow.getByTitle("Delete user").click()
    await page.getByRole("button", { name: "Delete", exact: true }).click()

    await expect.poll(async () => {
      const id = await findUserIdByUsername(request, token, nurseManagerUsername)
      return id ?? null
    }).toBe(null)

    await expect.poll(() =>
      countRows(`select count(*) from "User" where userid = ${managerDetails.userid};`),
    ).toBe(0)
    await expect.poll(() =>
      countRows(`select count(*) from nursemanager where managerid = ${managerDetails.managerid};`),
    ).toBe(0)
  } finally {
    for (const userid of createdUserIds.reverse()) {
      await deleteUser(request, token, userid)
    }
  }
})
