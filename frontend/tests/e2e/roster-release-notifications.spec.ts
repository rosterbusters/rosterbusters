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

async function getActiveWard(request: APIRequestContext, token: string) {
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
  const ward = wards.find((item) => item.isactive !== false) ?? wards[0]
  if (!ward) {
    throw new Error("No wards found. Seed a ward before running this test.")
  }
  return ward
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

async function getFuturePeriod(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE_URL}/api/v1/shift-requests/periods`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to load roster periods: ${res.status()} ${body}`)
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

async function createRosterEntry(
  request: APIRequestContext,
  token: string,
  payload: Record<string, unknown>,
) {
  const res = await request.post(`${API_BASE_URL}/api/v1/roster/create`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: payload,
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to create roster entry: ${res.status()} ${body}`)
  }
  return res.json() as Promise<{ roster_id: number }>
}

async function publishWardRoster(
  request: APIRequestContext,
  token: string,
  wardId: number,
  periodId: number,
) {
  const res = await request.post(
    `${API_BASE_URL}/api/v1/roster/ward/${wardId}/publish`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { period_id: periodId },
    },
  )
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to publish roster: ${res.status()} ${body}`)
  }
  return res.json() as Promise<{
    ward_id: number
    period_id: number
    published_count: number
    status: string
  }>
}

async function getNurseNotifications(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE_URL}/api/v1/notifications/nurse`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { notification_type: "RosterRelease" },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to fetch nurse notifications: ${res.status()} ${body}`)
  }
  return res.json() as Promise<{
    notifications: Array<{
      notificationtype: string
      messagebody: string
      relatedentitytype?: string | null
      relatedentityid?: number | null
      status: string
    }>
  }>
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
  throw new Error(`Failed to fetch MailCatcher messages from ${MAILCATCHER_HOST}`)
}

async function fetchMailCatcherMessage(
  request: APIRequestContext,
  id: number,
) {
  const res = await request.get(`${MAILCATCHER_HOST}/messages/${id}.json`)
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to fetch MailCatcher message: ${res.status()} ${body}`)
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
  timeoutMs = 20_000,
) {
  const started = Date.now()
  const expectedRecipient = recipient.toLowerCase()

  while (Date.now() - started < timeoutMs) {
    const messages = await fetchMailCatcherMessages(request)

    for (const message of messages) {
      const recipients = (message.recipients || []).map((value) =>
        value.trim().replace(/^<|>$/g, "").toLowerCase(),
      )
      if (recipients.includes(expectedRecipient)) {
        return fetchMailCatcherMessage(request, message.id)
      }
    }

    for (const message of messages) {
      const fullMessage = await fetchMailCatcherMessage(request, message.id)
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

test.describe("roster release notifications", () => {
  test.skip(!MAILCATCHER_HOST, "MAILCATCHER_HOST not set")

  test("publishing a roster creates a nurse notification and sends roster release email", async ({
    request,
  }, testInfo) => {
    test.setTimeout(90_000)

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error(
        "Missing admin credentials. Set E2E_SUPERUSER and E2E_SUPERUSER_PASSWORD (or FIRST_SUPERUSER / FIRST_SUPERUSER_PASSWORD).",
      )
    }

    const adminToken = await loginToken(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const ward = await getActiveWard(request, adminToken)
    const period = await getFuturePeriod(request, adminToken)
    const runId = `${testInfo.project.name.toLowerCase()}-${Date.now()}`
    const shortRunId = runId.replace(/[^a-z0-9]/gi, "").slice(-12)
    const nurseUsername = `e2e.release.${runId}`
    const nursePassword = `Roster${shortRunId}!`
    const nurseEmail = `e2e.release.${runId}@example.com`
    const employeeId = `RR${shortRunId}`

    let createdUserId: number | null = null
    let createdRosterId: number | null = null

    try {
      const nurseUser = await createUser(request, adminToken, {
        username: nurseUsername,
        name: `Roster Release ${runId}`,
        email: nurseEmail,
        employee_id: employeeId,
        designation: "RN",
        password: nursePassword,
        role: "Nurse",
        ward_ids: [ward.wardid],
      })
      createdUserId = nurseUser.userid

      if (!nurseUser.nurseid) {
        throw new Error("Created nurse user missing nurseid")
      }

      const rosterEntry = await createRosterEntry(request, adminToken, {
        ward_id: ward.wardid,
        nurse_id: nurseUser.nurseid,
        period_id: period.periodid,
        shift_date: period.startdate,
        shift_code: "A",
        status: "Pending",
        assignment_method: "Manual",
      })
      createdRosterId = rosterEntry.roster_id

      const publishResponse = await publishWardRoster(
        request,
        adminToken,
        ward.wardid,
        period.periodid,
      )
      expect(publishResponse.published_count).toBeGreaterThan(0)
      expect(publishResponse.status).toBe("Finalized")

      const nurseToken = await loginToken(request, nurseUsername, nursePassword)

      await expect
        .poll(async () => {
          const payload = await getNurseNotifications(request, nurseToken)
          return payload.notifications.find(
            (notification) =>
              notification.notificationtype === "RosterRelease" &&
              notification.relatedentitytype === "RosterPeriod" &&
              notification.relatedentityid === period.periodid,
          )
        })
        .toMatchObject({
          notificationtype: "RosterRelease",
          messagebody: `${period.name} Roster Released.`,
          relatedentitytype: "RosterPeriod",
          relatedentityid: period.periodid,
        })

      const message = await waitForEmail(request, nurseEmail)
      expect(message.subject || "").toMatch(
        new RegExp(`${escapeRegExp(`${period.name} Roster Released.`)}$`),
      )

      const emailBody = [
        message.body,
        message.body_html,
        message.body_text,
      ]
        .filter(Boolean)
        .join(" ")

      expect(emailBody).toContain(`${period.name} Roster Released.`)
      expect(emailBody).toContain(`Ward: ${ward.wardname}`)
      expect(emailBody).toContain(`Roster period: ${period.name}`)
    } finally {
      if (createdRosterId) {
        await request
          .delete(
            `${API_BASE_URL}/api/v1/roster/ward/${ward.wardid}/clear`,
            {
              headers: { Authorization: `Bearer ${adminToken}` },
              params: { period_id: period.periodid },
            },
          )
          .catch(() => null)
      }
      if (createdUserId) {
        await deleteUser(request, adminToken, createdUserId)
      }
    }
  })
})

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
