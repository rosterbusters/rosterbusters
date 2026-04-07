import { expect, test, type APIRequestContext } from "@playwright/test"
import { loginForE2E } from "../utils/auth"

const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8000"
const MAILCATCHER_HOST =
  process.env.MAILCATCHER_HOST || "http://localhost:1080"
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

  return loginForE2E({
    request,
    username: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    recipientEmail: ADMIN_EMAIL,
    apiBaseUrl: API_BASE_URL,
  })
}

async function getAnyWard(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE_URL}/api/v1/wards/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Failed to load wards: ${res.status()} ${body}`)
  }
  const wards = (await res.json()) as Array<{ wardid: number }>
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
  return res.json() as Promise<{ userid: number }>
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

async function clearMailCatcher(request: APIRequestContext) {
  const res = await request.delete(`${MAILCATCHER_HOST}/messages`)
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(
      `Failed to clear MailCatcher: ${res.status()} ${body}. Is MailCatcher running?`,
    )
  }
}

async function fetchMailCatcherMessages(request: APIRequestContext) {
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

async function waitForResetEmail(
  request: APIRequestContext,
  email: string,
  timeoutMs = 15_000,
) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const messages = await fetchMailCatcherMessages(request)
    for (const msg of messages) {
      const recipients = msg.recipients || []
      const normalizedRecipients = recipients.map((recipient) =>
        recipient.trim().replace(/^<|>$/g, "").toLowerCase(),
      )
      if (normalizedRecipients.includes(email.toLowerCase())) {
        return fetchMailCatcherMessage(request, msg.id)
      }
    }

    // MailCatcher sometimes omits recipients in list view.
    // Fall back to scanning message bodies for the target email.
    for (const msg of messages) {
      const full = await fetchMailCatcherMessage(request, msg.id)
      if ((full.body || "").toLowerCase().includes(email.toLowerCase())) {
        return full
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  throw new Error(`Timed out waiting for reset email to ${email}`)
}

function extractResetLink(html = "") {
  const normalized = normalizeMailBody(html)
  const match = normalized.match(
    /https?:\/\/[^\s"'<>]*reset-password\?token=[^\s"'<>]+/,
  )
  if (!match) {
    throw new Error("Reset link not found in email body.")
  }
  return match[0]
}

function normalizeMailBody(body: string) {
  // MailCatcher can return quoted-printable bodies with soft line breaks.
  // Remove soft breaks and normalize whitespace to make URL extraction reliable.
  return body
    .replace(/=\r?\n/g, "")
    .replace(/\r/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
}

test("shows an error when email is not registered", async ({ page }) => {
  const unknownEmail = `unknown.${Date.now()}@example.com`

  await page.goto("/recover-password")
  await page.getByPlaceholder("Email").fill(unknownEmail)
  await page.getByRole("button", { name: "Continue" }).click()

  await expect(
    page.getByTestId("toast").filter({
      hasText: "No account found with that email.",
    }),
  ).toBeVisible()
})

test("shows invalid token page when reset token is invalid", async ({ page }) => {
  const invalidToken = `invalid-${Date.now()}`

  await page.goto(`/reset-password?token=${invalidToken}`)
  await page.getByPlaceholder("New Password").fill("Password123!")
  await page.getByPlaceholder("Confirm Password").fill("Password123!")
  await page.getByRole("button", { name: "Reset Password" }).click()

  await expect(
    page.getByRole("heading", { name: "Invalid or expired link" }),
  ).toBeVisible()
})

test("password recovery sends an email and allows reset with token", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000)

  const token = await getAdminToken(request)
  const ward = await getAnyWard(request, token)
  const suffix = Date.now().toString().slice(-6)
  const email = `reset.flow.${suffix}@example.com`
  const username = `reset.flow.${suffix}`
  const newPassword = `NewPass${suffix}!`
  let createdUserId: number | null = null

  try {
    const created = await createUser(request, token, {
      username,
      name: "Reset Flow",
      email,
      employee_id: `R${suffix}`,
      role: "Nurse",
      ward_ids: [ward.wardid],
    })
    createdUserId = created.userid

    await clearMailCatcher(request)

    await page.goto("/recover-password")
    await page.getByPlaceholder("Email").fill(email)
    await page.getByRole("button", { name: "Continue" }).click()

    await expect(
      page.getByRole("heading", { name: "Check your inbox" }),
    ).toBeVisible()

    const message = await waitForResetEmail(request, email)
    expect(message.subject || "").toMatch(/password recovery/i)

    const body =
      message.body ||
      message.body_html ||
      message.body_text ||
      ""
    const resetLink = extractResetLink(body)
    const resetUrl = new URL(resetLink)
    await page.goto(`${resetUrl.pathname}${resetUrl.search}`)

    await page.getByPlaceholder("New Password").fill(newPassword)
    await page.getByPlaceholder("Confirm Password").fill(newPassword)
    await page.getByRole("button", { name: "Reset Password" }).click()

    await expect(page).toHaveURL("/login")
  } finally {
    if (createdUserId) {
      await deleteUser(request, token, createdUserId)
    }
  }
})
