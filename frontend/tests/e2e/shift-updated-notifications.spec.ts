import { execFileSync } from "node:child_process"
import { type APIRequestContext, expect, test } from "@playwright/test"
import { loginForE2E } from "../utils/auth"
import {
  API_BASE_URL,
  createUser,
  deleteUser,
  getAdminToken,
  getAnyWard,
  getUserByUsername,
} from "./admin-helpers"

const MAILCATCHER_HOST = process.env.MAILCATCHER_HOST
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
    [
      "exec",
      container,
      "psql",
      "-U",
      DB_USER,
      "-d",
      DB_NAME,
      "-t",
      "-A",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim()
}

const countRows = (sql: string) => {
  const value = runScalarQuery(sql)
  return Number.parseInt(value || "0", 10)
}

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

async function getFuturePeriod(token: string) {
  const res = await fetch(`${API_BASE_URL}/api/v1/shift-requests/periods`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to load roster periods: ${res.status} ${body}`)
  }
  const periods = (await res.json()) as Array<{
    periodid: number
    name: string
    startdate: string
    status: string
  }>
  const period =
    periods.find((item) => item.status === "Pending") ??
    periods.find((item) => item.status !== "RequestOpen") ??
    periods[0]
  if (!period) {
    throw new Error("No roster periods found.")
  }
  return period
}

async function fetchMailCatcherMessages() {
  if (!MAILCATCHER_HOST) {
    return []
  }
  const endpoints = [
    `${MAILCATCHER_HOST}/messages?format=json`,
    `${MAILCATCHER_HOST}/messages.json`,
  ]
  for (const url of endpoints) {
    const res = await fetch(url)
    if (res.ok) {
      return (await res.json()) as Array<{
        id: number
        recipients?: string[]
        subject?: string
      }>
    }
  }
  throw new Error(
    `Failed to fetch MailCatcher messages from ${MAILCATCHER_HOST}`,
  )
}

async function fetchMailCatcherMessage(id: number) {
  const res = await fetch(`${MAILCATCHER_HOST}/messages/${id}.json`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `Failed to fetch MailCatcher message: ${res.status} ${body}`,
    )
  }
  const message = (await res.json()) as {
    id: number
    recipients?: string[]
    subject?: string
    body?: string
    body_html?: string
    body_text?: string
  }

  const htmlRes = await fetch(`${MAILCATCHER_HOST}/messages/${id}.html`)
  if (htmlRes.ok) {
    message.body_html = await htmlRes.text()
  }

  const textRes = await fetch(`${MAILCATCHER_HOST}/messages/${id}.txt`)
  if (textRes.ok) {
    message.body_text = await textRes.text()
  }

  return message
}

async function waitForEmail(
  recipient: string,
  subjectIncludes?: string,
  timeoutMs = 20_000,
) {
  const started = Date.now()
  const expectedRecipient = recipient.toLowerCase()
  const expectedSubject = subjectIncludes?.toLowerCase()

  while (Date.now() - started < timeoutMs) {
    const messages = await fetchMailCatcherMessages()

    for (const message of messages) {
      const subject = (message.subject || "").toLowerCase()
      if (expectedSubject && !subject.includes(expectedSubject)) {
        continue
      }
      const recipients = (message.recipients || []).map((value) =>
        value.trim().replace(/^<|>$/g, "").toLowerCase(),
      )
      if (recipients.includes(expectedRecipient)) {
        return fetchMailCatcherMessage(message.id)
      }
    }

    for (const message of messages) {
      const fullMessage = await fetchMailCatcherMessage(message.id)
      const subject = (fullMessage.subject || "").toLowerCase()
      if (expectedSubject && !subject.includes(expectedSubject)) {
        continue
      }
      const combinedBody = [
        fullMessage.body,
        fullMessage.body_html,
        fullMessage.body_text,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      if (combinedBody.includes(expectedRecipient)) {
        return fullMessage
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 750))
  }

  throw new Error(`Timed out waiting for email to ${recipient}`)
}

test.describe("shift updated notifications", () => {
  test.skip(!MAILCATCHER_HOST, "MAILCATCHER_HOST not set")

  test("shift update notifies only for non-pending roster entries", async ({
    request,
  }, testInfo) => {
    test.setTimeout(120_000)

    const adminToken = await getAdminToken(request)
    const ward = await getAnyWard(request, adminToken)
    const period = await getFuturePeriod(adminToken)
    const runId = `${testInfo.project.name.toLowerCase()}-${Date.now()}`
    const shortRunId = runId.replace(/[^a-z0-9]/gi, "").slice(-10)
    const nurseUsername = `e2e.shift.${runId}`
    const nurseEmail = `e2e.shift.${runId}@example.com`
    const nursePassword = `Roster${shortRunId}!`

    let createdUserId: number | null = null

    try {
      const nurseUser = await createUser(request, adminToken, {
        username: nurseUsername,
        name: `E2E Shift Nurse ${runId}`,
        email: nurseEmail,
        employee_id: `SN${shortRunId}`,
        designation: "RN",
        password: nursePassword,
        role: "Nurse",
        ward_ids: [ward.wardid],
      })
      createdUserId = nurseUser.userid

      const nurseDetails = await getUserByUsername<{
        nurseid?: number | null
      }>(request, adminToken, nurseUsername)
      if (!nurseDetails?.nurseid) {
        throw new Error("Expected nurse user to have a nurseid.")
      }

      const nurseToken = await loginToken(
        request,
        nurseUsername,
        nursePassword,
        nurseEmail,
      )

      const createRes = await request.post(
        `${API_BASE_URL}/api/v1/roster/create`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          data: {
            ward_id: ward.wardid,
            nurse_id: nurseDetails.nurseid,
            period_id: period.periodid,
            shift_date: period.startdate,
            shift_code: "A",
            status: "Pending",
            assignment_method: "Manual",
          },
        },
      )
      if (!createRes.ok()) {
        const body = await createRes.text()
        throw new Error(
          `Failed to create roster entry: ${createRes.status()} ${body}`,
        )
      }
      const created = (await createRes.json()) as { roster_id: number }

      const pendingUpdateRes = await request.post(
        `${API_BASE_URL}/api/v1/roster/create`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          data: {
            ward_id: ward.wardid,
            nurse_id: nurseDetails.nurseid,
            period_id: period.periodid,
            shift_date: period.startdate,
            shift_code: "P",
            status: "Pending",
            assignment_method: "Manual",
          },
        },
      )
      if (!pendingUpdateRes.ok()) {
        const body = await pendingUpdateRes.text()
        throw new Error(
          `Failed to update roster entry: ${pendingUpdateRes.status()} ${body}`,
        )
      }

      await expect
        .poll(() =>
          countRows(
            `select count(*) from notificationqueue where recipienttype = 'Nurse' and recipientid = ${nurseDetails.nurseid} and notificationtype = 'ShiftUpdated' and relatedentitytype = 'Roster' and relatedentityid = ${created.roster_id};`,
          ),
        )
        .toBe(0)

      const confirmRes = await request.post(
        `${API_BASE_URL}/api/v1/roster/create`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          data: {
            ward_id: ward.wardid,
            nurse_id: nurseDetails.nurseid,
            period_id: period.periodid,
            shift_date: period.startdate,
            shift_code: "P",
            status: "Confirmed",
            assignment_method: "Manual",
          },
        },
      )
      if (!confirmRes.ok()) {
        const body = await confirmRes.text()
        throw new Error(
          `Failed to confirm roster entry: ${confirmRes.status()} ${body}`,
        )
      }

      const updatedRes = await request.post(
        `${API_BASE_URL}/api/v1/roster/create`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          data: {
            ward_id: ward.wardid,
            nurse_id: nurseDetails.nurseid,
            period_id: period.periodid,
            shift_date: period.startdate,
            shift_code: "N",
            status: "Confirmed",
            assignment_method: "Manual",
          },
        },
      )
      if (!updatedRes.ok()) {
        const body = await updatedRes.text()
        throw new Error(
          `Failed to update roster entry: ${updatedRes.status()} ${body}`,
        )
      }

      await expect
        .poll(() =>
          countRows(
            `select count(*) from notificationqueue where recipienttype = 'Nurse' and recipientid = ${nurseDetails.nurseid} and notificationtype = 'ShiftUpdated' and relatedentitytype = 'Roster' and relatedentityid = ${created.roster_id};`,
          ),
        )
        .toBe(1)

      const email = await waitForEmail(
        nurseEmail,
        "Your shift has been updated",
      )
      expect(email.subject || "").toContain("Your shift has been updated")
      const emailBody = [email.body, email.body_html, email.body_text]
        .filter(Boolean)
        .join(" ")
      expect(emailBody).toContain(period.startdate)

      await expect
        .poll(async () => {
          const res = await request.get(
            `${API_BASE_URL}/api/v1/notifications/nurse`,
            {
              headers: { Authorization: `Bearer ${nurseToken}` },
              params: { notification_type: "ShiftUpdated" },
            },
          )
          if (!res.ok()) return null
          const json = (await res.json()) as {
            notifications: Array<{ relatedentityid?: number | null }>
          }
          return json.notifications.find(
            (n) => n.relatedentityid === created.roster_id,
          )
        })
        .toBeTruthy()
    } finally {
      await request
        .delete(`${API_BASE_URL}/api/v1/roster/ward/${ward.wardid}/clear`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          params: { period_id: period.periodid },
        })
        .catch(() => null)

      if (createdUserId) {
        await deleteUser(request, adminToken, createdUserId)
      }
    }
  })
})
