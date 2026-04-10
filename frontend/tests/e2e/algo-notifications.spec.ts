import { expect, test, type APIRequestContext } from "@playwright/test"
import { loginForE2E } from "../utils/auth"

const API_URL = process.env.VITE_API_URL || "http://127.0.0.1:8000"

const ADMIN_EMAIL =
  process.env.E2E_SUPERUSER || process.env.FIRST_SUPERUSER || ""
const ADMIN_PASSWORD =
  process.env.E2E_SUPERUSER_PASSWORD ||
  process.env.FIRST_SUPERUSER_PASSWORD ||
  ""

test.describe("algorithm notifications", () => {
  test("uses in-progress on start and generation on completion", async ({
    request,
  }) => {
    test.setTimeout(120_000)

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error(
        "Missing admin credentials. Set E2E_SUPERUSER and E2E_SUPERUSER_PASSWORD (or FIRST_SUPERUSER / FIRST_SUPERUSER_PASSWORD).",
      )
    }

    const adminToken = await getAccessToken(
      request,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_EMAIL,
    )

    const seedResponse = await request.post(
      `${API_URL}/api/v1/roster/seed-requests-anonymized`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    )
    expect(seedResponse.ok()).toBeTruthy()
    const seedPayload = (await seedResponse.json()) as {
      ward_id: number
      manager?: { email?: string; password?: string }
      period?: { periodid: number; name: string }
    }
    const wardId = seedPayload.ward_id
    expect(wardId).toBeTruthy()

    const managerEmail = seedPayload.manager?.email || ""
    const managerPassword = seedPayload.manager?.password || ""
    if (!managerEmail || !managerPassword) {
      throw new Error("Seeded manager credentials missing from response.")
    }

    const managerToken = await getAccessToken(
      request,
      managerEmail,
      managerPassword,
      managerEmail,
    )

    const period =
      seedPayload.period || (await pickRosterPeriod(request, managerToken))
    const rosterPeriodName = period.name

    const runResponse = await request.post(
      `${API_URL}/api/v1/roster/generate-algorithm-async`,
      {
        headers: {
          Authorization: `Bearer ${managerToken}`,
        },
        data: {
          ward_id: wardId,
          period_id: period.periodid,
        },
      },
    )
    let taskId: string | undefined
    if (runResponse.ok()) {
      const runPayload = (await runResponse.json()) as { task_id?: string }
      taskId = runPayload.task_id
    } else {
      const errorText = await runResponse.text()
      // Celery may be unavailable in some environments; don't fail the notification test.
      // eslint-disable-next-line no-console
      console.warn(
        `generate-algorithm-async failed: ${runResponse.status()} ${errorText}`,
      )
    }

    try {
      if (taskId) {
        const cancelResponse = await request.post(
          `${API_URL}/api/v1/roster/task/${taskId}/cancel`,
          {
            headers: {
              Authorization: `Bearer ${managerToken}`,
            },
          },
        )
        expect(cancelResponse.ok()).toBeTruthy()
      }

      const inProgressResponse = await request.post(
        `${API_URL}/api/v1/roster/algorithm-notification`,
        {
          headers: {
            Authorization: `Bearer ${managerToken}`,
          },
          data: {
            ward_id: wardId,
            period_id: period.periodid,
            notification_type: "ALGORITHM_IN_PROGRESS",
          },
        },
      )
      expect(inProgressResponse.ok()).toBeTruthy()
      const inProgressPayload = (await inProgressResponse.json()) as {
        status?: string
        notification_type?: string
        message?: string
      }
      if (inProgressPayload.notification_type !== "ALGORITHM_IN_PROGRESS") {
        throw new Error(
          `In-progress notification not queued. Received: ${JSON.stringify(inProgressPayload)}`,
        )
      }

      const expectedInProgress = `Algorithm generation in progress for ${rosterPeriodName}`
      const inProgressFound = await waitForMessage(
        request,
        managerToken,
        expectedInProgress,
      )
      if (!inProgressFound) {
        const recent = await listRecentMessages(request, managerToken)
        throw new Error(
          `Expected in-progress notification not found. Recent messages:\n${recent.join("\n")}`,
        )
      }

      const completionResponse = await request.post(
        `${API_URL}/api/v1/roster/algorithm-notification`,
        {
          headers: {
            Authorization: `Bearer ${managerToken}`,
          },
          data: {
            ward_id: wardId,
            period_id: period.periodid,
            notification_type: "ALGORITHM_GENERATION",
          },
        },
      )
      expect(completionResponse.ok()).toBeTruthy()
      const completionPayload = (await completionResponse.json()) as {
        status?: string
        notification_type?: string
        message?: string
      }
      if (completionPayload.notification_type !== "ALGORITHM_GENERATION") {
        throw new Error(
          `Generation notification not queued. Received: ${JSON.stringify(completionPayload)}`,
        )
      }

      const expectedGenerated = `Algorithm generated for ${rosterPeriodName}`
      const generatedFound = await waitForMessage(
        request,
        managerToken,
        expectedGenerated,
      )
      if (!generatedFound) {
        const recent = await listRecentMessages(request, managerToken)
        throw new Error(
          `Expected generated notification not found. Recent messages:\n${recent.join("\n")}`,
        )
      }
    } finally {
      const managerUserId = await findUserIdByEmail(
        request,
        adminToken,
        managerEmail,
      )
      if (managerUserId) {
        await deleteUser(request, adminToken, managerUserId)
      }
    }
  })
})

async function findUserIdByEmail(
  request: APIRequestContext,
  adminToken: string,
  email: string,
) {
  const params = new URLSearchParams({
    skip: "0",
    limit: "20",
    search: email,
  })
  const res = await request.get(
    `${API_URL}/api/v1/admin/users?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${adminToken}` },
    },
  )
  if (!res.ok()) return null
  const json = (await res.json()) as {
    data: Array<{ userid: number; email?: string; username: string }>
  }
  const match = json.data.find((u) => u.email === email)
  return match?.userid ?? null
}

async function deleteUser(
  request: APIRequestContext,
  adminToken: string,
  userId: number,
) {
  await request.delete(`${API_URL}/api/v1/admin/users/${userId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
}

async function getAccessToken(
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
    apiBaseUrl: API_URL,
  })
}

async function pickRosterPeriod(
  request: APIRequestContext,
  managerToken: string,
): Promise<{ periodid: number; name: string }> {
  const windowResponse = await request.get(
    `${API_URL}/api/v1/shift-requests/periods/current-upcoming`,
    {
      headers: {
        Authorization: `Bearer ${managerToken}`,
      },
    },
  )
  expect(windowResponse.ok()).toBeTruthy()
  const windowPayload = (await windowResponse.json()) as {
    current_period?: { periodid: number; name: string }
    upcoming_period?: { periodid: number; name: string }
    request_open_period?: { periodid: number; name: string }
  }

  const period =
    windowPayload.request_open_period ||
    windowPayload.upcoming_period ||
    windowPayload.current_period
  if (period) {
    return period
  }

  const periodsResponse = await request.get(
    `${API_URL}/api/v1/shift-requests/periods`,
    {
      headers: {
        Authorization: `Bearer ${managerToken}`,
      },
    },
  )
  expect(periodsResponse.ok()).toBeTruthy()
  const periods = (await periodsResponse.json()) as Array<{
    periodid: number
    name: string
  }>
  if (!periods.length) {
    throw new Error("No roster periods available for algorithm generation.")
  }
  return periods[0]
}

async function findNotificationMessages(
  request: APIRequestContext,
  managerToken: string,
  messages: string[],
): Promise<boolean[]> {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim()
  const targets = messages.map((message) => normalize(message))
  const found = new Set<string>()

  const pageSize = 100
  const maxPages = 5
  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize
    const response = await request.get(
      `${API_URL}/api/v1/notifications/manager?limit=${pageSize}&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${managerToken}`,
        },
      },
    )
    if (!response.ok()) {
      return targets.map(() => false)
    }
    const payload = (await response.json()) as {
      notifications?: Array<{ messagebody?: string }>
      total?: number
    }
    for (const notification of payload.notifications || []) {
      const body = normalize(notification.messagebody || "")
      for (const target of targets) {
        if (body.includes(target)) {
          found.add(target)
        }
      }
    }
    if (found.size === targets.length) {
      break
    }
    if (payload.total !== undefined && offset + pageSize >= payload.total) {
      break
    }
  }

  return targets.map((message) => found.has(message))
}

async function listRecentMessages(
  request: APIRequestContext,
  managerToken: string,
): Promise<string[]> {
  const response = await request.get(
    `${API_URL}/api/v1/notifications/manager?limit=20&offset=0`,
    {
      headers: {
        Authorization: `Bearer ${managerToken}`,
      },
    },
  )
  if (!response.ok()) {
    return []
  }
  const payload = (await response.json()) as {
    notifications?: Array<{ messagebody?: string }>
  }
  return (payload.notifications || [])
    .map((n) => (n.messagebody || "").replace(/\s+/g, " ").trim())
}

async function waitForMessage(
  request: APIRequestContext,
  managerToken: string,
  expected: string,
): Promise<boolean> {
  const normalized = expected.replace(/\s+/g, " ").trim()
  const intervals = [500, 1000, 1500, 2000, 3000, 4000]
  for (const delay of intervals) {
    const found = (await findNotificationMessages(request, managerToken, [
      normalized,
    ]))[0]
    if (found) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
  return false
}
