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

async function fetchMailCatcherMessages(request: APIRequestContext) {
  if (!MAILCATCHER_HOST) {
    return []
  }
  const endpoints = [
    `${MAILCATCHER_HOST}/messages?format=json`,
    `${MAILCATCHER_HOST}/messages.json`,
  ]
  for (const url of endpoints) {
    const res = await request.get(url)
    if (res.ok()) {
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

async function fetchMailCatcherMessage(request: APIRequestContext, id: number) {
  const res = await request.get(`${MAILCATCHER_HOST}/messages/${id}.json`)
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(
      `Failed to fetch MailCatcher message: ${res.status()} ${body}`,
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

  const htmlRes = await request.get(`${MAILCATCHER_HOST}/messages/${id}.html`)
  if (htmlRes.ok()) {
    message.body_html = await htmlRes.text()
  }

  const textRes = await request.get(`${MAILCATCHER_HOST}/messages/${id}.txt`)
  if (textRes.ok()) {
    message.body_text = await textRes.text()
  }

  return message
}

async function waitForEmail(
  request: APIRequestContext,
  recipient: string,
  subjectIncludes?: string,
  timeoutMs = 20_000,
) {
  const started = Date.now()
  const expectedRecipient = recipient.toLowerCase()
  const expectedSubject = subjectIncludes?.toLowerCase()

  while (Date.now() - started < timeoutMs) {
    const messages = await fetchMailCatcherMessages(request)

    for (const message of messages) {
      const subject = (message.subject || "").toLowerCase()
      if (expectedSubject && !subject.includes(expectedSubject)) {
        continue
      }
      const recipients = (message.recipients || []).map((value) =>
        value.trim().replace(/^<|>$/g, "").toLowerCase(),
      )
      if (recipients.includes(expectedRecipient)) {
        return fetchMailCatcherMessage(request, message.id)
      }
    }

    for (const message of messages) {
      const fullMessage = await fetchMailCatcherMessage(request, message.id)
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

test.describe("leave request notifications", () => {
  test.skip(!MAILCATCHER_HOST, "MAILCATCHER_HOST not set")

  test("leave request creates manager notification and email", async ({
    request,
  }, testInfo) => {
    test.setTimeout(90_000)

    const adminToken = await getAdminToken(request)
    const ward = await getAnyWard(request, adminToken)
    const runId = `${testInfo.project.name.toLowerCase()}-${Date.now()}`
    const shortRunId = runId.replace(/[^a-z0-9]/gi, "").slice(-10)
    const managerUsername = `e2e.nm.${runId}`
    const managerEmail = `e2e.nm.${runId}@example.com`
    const nurseUsername = `e2e.nurse.${runId}`
    const nurseEmail = `e2e.nurse.${runId}@example.com`
    const nursePassword = `Roster${shortRunId}!`

    let createdUserIds: number[] = []
    let leaveId: number | null = null
    let nurseToken: string | null = null

    try {
      const managerUser = await createUser(request, adminToken, {
        username: managerUsername,
        name: `E2E Manager ${runId}`,
        email: managerEmail,
        employee_id: `NM${shortRunId}`,
        role: "NurseManager",
        ward_ids: [ward.wardid],
      })
      const nurseUser = await createUser(request, adminToken, {
        username: nurseUsername,
        name: `E2E Nurse ${runId}`,
        email: nurseEmail,
        employee_id: `N${shortRunId}`,
        designation: "RN",
        password: nursePassword,
        role: "Nurse",
        ward_ids: [ward.wardid],
      })
      createdUserIds = [managerUser.userid, nurseUser.userid]
      runScalarQuery(
        `update userrole set wardid = ${ward.wardid} where userid = ${managerUser.userid};`,
      )

      const managerDetails = await getUserByUsername<{
        managerid?: number | null
      }>(request, adminToken, managerUsername)
      const nurseDetails = await getUserByUsername<{
        nurseid?: number | null
      }>(request, adminToken, nurseUsername)

      if (!managerDetails?.managerid) {
        throw new Error("Expected manager user to have a managerid.")
      }
      if (!nurseDetails?.nurseid) {
        throw new Error("Expected nurse user to have a nurseid.")
      }

      nurseToken = await loginToken(
        request,
        nurseUsername,
        nursePassword,
        nurseEmail,
      )

      const leaveCodesRes = await request.get(
        `${API_BASE_URL}/api/v1/leave/leave-codes`,
        { headers: { Authorization: `Bearer ${nurseToken}` } },
      )
      if (!leaveCodesRes.ok()) {
        const body = await leaveCodesRes.text()
        throw new Error(
          `Failed to load leave codes: ${leaveCodesRes.status()} ${body}`,
        )
      }
      const leaveCodes = (await leaveCodesRes.json()) as Array<{
        shiftcode: string
      }>
      const leaveCode = leaveCodes[0]?.shiftcode
      if (!leaveCode) {
        throw new Error("No leave codes available for leave request test.")
      }

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const leaveDate = tomorrow.toISOString().slice(0, 10)

      const leaveRes = await request.post(`${API_BASE_URL}/api/v1/leave/`, {
        headers: {
          Authorization: `Bearer ${nurseToken}`,
          "Content-Type": "application/json",
        },
        data: {
          startdate: leaveDate,
          enddate: leaveDate,
          leavetype: leaveCode,
          reason: "E2E leave request",
        },
      })
      if (!leaveRes.ok()) {
        const body = await leaveRes.text()
        throw new Error(
          `Failed to create leave request: ${leaveRes.status()} ${body}`,
        )
      }
      const leave = (await leaveRes.json()) as { leaveid: number }
      leaveId = leave.leaveid

      await expect
        .poll(() =>
          countRows(
            `select count(*) from notificationqueue where recipienttype = 'NurseManager' and recipientid = ${managerDetails.managerid} and notificationtype = 'LeaveRequest' and relatedentitytype = 'LeaveRequest' and relatedentityid = ${leaveId};`,
          ),
        )
        .toBe(1)

      const email = await waitForEmail(
        request,
        managerEmail,
        "New leave request from",
      )
      expect(email.subject || "").toContain("New leave request from")
      const emailBody = [email.body, email.body_html, email.body_text]
        .filter(Boolean)
        .join(" ")
      expect(emailBody).toContain(leaveCode)
      expect(emailBody).toContain(leaveDate)
    } finally {
      if (leaveId && nurseToken) {
        await request
          .delete(`${API_BASE_URL}/api/v1/leave/${leaveId}`, {
            headers: { Authorization: `Bearer ${nurseToken}` },
          })
          .catch(() => null)
      }
      for (const userid of createdUserIds.reverse()) {
        await deleteUser(request, adminToken, userid)
      }
    }
  })
})
