import { expect, type APIRequestContext, type Page } from "@playwright/test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

type LoginResponse = {
  access_token?: string
  two_factor_required?: boolean
  two_factor_token?: string
}

type MailMessage = {
  id: number
  recipients?: string[]
  subject?: string
}

const DEFAULT_API_BASE_URL = process.env.VITE_API_URL || "http://localhost:8000"
const LOCK_DIR = path.join(os.tmpdir(), "rosterbusters-e2e-locks")

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function listMailMessages(request: APIRequestContext, host: string) {
  const response = await request.get(`${host}/messages`)
  if (!response.ok()) {
    throw new Error(`MailCatcher is not reachable: ${response.status()}`)
  }
  return (await response.json()) as MailMessage[]
}

async function readMailBodies(
  request: APIRequestContext,
  host: string,
  id: number,
): Promise<string[]> {
  const contents: string[] = []

  const textRes = await request.get(`${host}/messages/${id}.txt`)
  if (textRes.ok()) {
    contents.push(await textRes.text())
  }

  const htmlRes = await request.get(`${host}/messages/${id}.html`)
  if (htmlRes.ok()) {
    contents.push(await htmlRes.text())
  }

  const jsonRes = await request.get(`${host}/messages/${id}.json`)
  if (jsonRes.ok()) {
    const json = (await jsonRes.json()) as {
      source?: string
      body?: string
      html?: string
      text?: string
    }
    if (typeof json.source === "string") contents.push(json.source)
    if (typeof json.body === "string") contents.push(json.body)
    if (typeof json.html === "string") contents.push(json.html)
    if (typeof json.text === "string") contents.push(json.text)
  }

  return contents
}

function extract6DigitCode(contents: string[]) {
  const contextualPatterns = [
    /verification\s*code[^0-9]*(\d{6})/i,
    /code\s+below[^0-9]*(\d{6})/i,
    /enter\s+the\s+code[^0-9]*(\d{6})/i,
  ]

  for (const content of contents) {
    for (const pattern of contextualPatterns) {
      const contextualMatch = content.match(pattern)
      if (contextualMatch) {
        return contextualMatch[1]
      }
    }

    const genericMatch = content.match(/(?<!#)\b(\d{6})\b/)
    if (genericMatch) {
      return genericMatch[1]
    }
  }
  return null
}

function normalizeRecipient(recipientEmail?: string) {
  const trimmed = recipientEmail?.trim().toLowerCase()
  return trimmed && trimmed.includes("@") ? trimmed : undefined
}

function toLockKey(value: string) {
  return value.replace(/[^a-z0-9._-]/gi, "_")
}

async function withRecipientLock<T>(
  key: string | undefined,
  fn: () => Promise<T>,
) {
  if (!key) {
    return fn()
  }

  await fs.mkdir(LOCK_DIR, { recursive: true })
  const lockPath = path.join(LOCK_DIR, `${toLockKey(key)}.lock`)
  const deadline = Date.now() + 60_000

  while (Date.now() < deadline) {
    try {
      const handle = await fs.open(lockPath, "wx")
      try {
        return await fn()
      } finally {
        await handle.close().catch(() => undefined)
        await fs.unlink(lockPath).catch(() => undefined)
      }
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code !== "EEXIST") {
        throw error
      }
      await sleep(150)
    }
  }

  throw new Error(`Timed out waiting for auth lock: ${key}`)
}

async function waitForVerificationCode(params: {
  request: APIRequestContext
  mailcatcherHost: string
  subjectIncludes: string
  recipientEmail?: string
  existingMessageIds: Set<number>
  timeoutMs?: number
}) {
  const {
    request,
    mailcatcherHost,
    subjectIncludes,
    recipientEmail,
    existingMessageIds,
    timeoutMs = 20_000,
  } = params

  const deadline = Date.now() + timeoutMs
  const attemptedMessageIds = new Set<number>()
  const normalizedRecipient = normalizeRecipient(recipientEmail)

  while (Date.now() < deadline) {
    const messages = await listMailMessages(request, mailcatcherHost)
    const candidates = messages
      .filter((message) => {
        if (existingMessageIds.has(message.id)) return false
        if (attemptedMessageIds.has(message.id)) return false

        const subject = (message.subject || "").toLowerCase()
        if (!subject.includes(subjectIncludes.toLowerCase())) return false

        if (!normalizedRecipient) return true
        const recipients = (message.recipients || []).map((value) =>
          value.toLowerCase(),
        )
        return recipients.some((recipient) =>
          recipient.includes(normalizedRecipient),
        )
      })
      .sort((a, b) => a.id - b.id)

    for (const message of candidates) {
      attemptedMessageIds.add(message.id)
      const bodies = await readMailBodies(request, mailcatcherHost, message.id)
      const code = extract6DigitCode(bodies)
      if (code) {
        return code
      }
    }

    await sleep(250)
  }

  throw new Error(
    `Timed out waiting for verification code email (${subjectIncludes}).`,
  )
}

export async function loginForE2E(params: {
  request: APIRequestContext
  username: string
  password: string
  apiBaseUrl?: string
  mailcatcherHost?: string
  recipientEmail?: string
}) {
  const {
    request,
    username,
    password,
    apiBaseUrl = DEFAULT_API_BASE_URL,
    mailcatcherHost = process.env.MAILCATCHER_HOST,
    recipientEmail,
  } = params

  const lockKey = normalizeRecipient(recipientEmail) || username.trim().toLowerCase()

  return withRecipientLock(lockKey, async () => {
    const loginRes = await request.post(`${apiBaseUrl}/api/v1/login/access-token`, {
      form: { username, password },
    })

    if (!loginRes.ok()) {
      const body = await loginRes.text()
      throw new Error(`Failed to login: ${loginRes.status()} ${body}`)
    }

    const loginJson = (await loginRes.json()) as LoginResponse
    if (loginJson.access_token) {
      return loginJson.access_token
    }

    if (!loginJson.two_factor_required || !loginJson.two_factor_token) {
      throw new Error("Login succeeded but returned no access token.")
    }

    if (!mailcatcherHost) {
      throw new Error(
        "2FA is enabled but MAILCATCHER_HOST is not set for Playwright tests.",
      )
    }

    const existingMessageIds = new Set(
      (await listMailMessages(request, mailcatcherHost)).map((m) => m.id),
    )

    const resendRes = await request.post(`${apiBaseUrl}/api/v1/login/email-2fa/resend`, {
      data: { two_factor_token: loginJson.two_factor_token },
    })
    if (!resendRes.ok()) {
      const body = await resendRes.text()
      throw new Error(`Failed to resend login 2FA: ${resendRes.status()} ${body}`)
    }

    const code = await waitForVerificationCode({
      request,
      mailcatcherHost,
      existingMessageIds,
      recipientEmail,
      subjectIncludes: "login verification code",
    })

    const verifyRes = await request.post(`${apiBaseUrl}/api/v1/login/email-2fa/verify`, {
      data: {
        two_factor_token: loginJson.two_factor_token,
        code,
      },
    })

    if (!verifyRes.ok()) {
      const body = await verifyRes.text()
      throw new Error(`Failed to verify login 2FA: ${verifyRes.status()} ${body}`)
    }

    const verifyJson = (await verifyRes.json()) as LoginResponse
    if (!verifyJson.access_token) {
      throw new Error("2FA verification succeeded but returned no access token.")
    }

    return verifyJson.access_token
  })
}

export async function verifyEmailForCurrentUser(params: {
  request: APIRequestContext
  token: string
  email: string
  apiBaseUrl?: string
  mailcatcherHost?: string
}) {
  const {
    request,
    token,
    email,
    apiBaseUrl = DEFAULT_API_BASE_URL,
    mailcatcherHost = process.env.MAILCATCHER_HOST,
  } = params

  if (!mailcatcherHost) {
    throw new Error(
      "Email verification is enabled but MAILCATCHER_HOST is not set for Playwright tests.",
    )
  }

  const existingMessageIds = new Set(
    (await listMailMessages(request, mailcatcherHost)).map((m) => m.id),
  )

  const sendRes = await request.post(
    `${apiBaseUrl}/api/v1/users/me/send-email-verification-code`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { email },
    },
  )

  if (!sendRes.ok()) {
    const body = await sendRes.text()
    throw new Error(
      `Failed to send email verification code: ${sendRes.status()} ${body}`,
    )
  }

  const code = await waitForVerificationCode({
    request,
    mailcatcherHost,
    existingMessageIds,
    recipientEmail: email,
    subjectIncludes: "verify your email address",
  })

  const verifyRes = await request.post(`${apiBaseUrl}/api/v1/users/me/verify-email-code`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: { email, code },
  })

  if (!verifyRes.ok()) {
    const body = await verifyRes.text()
    throw new Error(
      `Failed to verify email code: ${verifyRes.status()} ${body}`,
    )
  }
}

export async function completeLogin2faInUi(params: {
  page: Page
  recipientEmail?: string
  mailcatcherHost?: string
}) {
  const {
    page,
    recipientEmail,
    mailcatcherHost = process.env.MAILCATCHER_HOST,
  } = params

  const lockKey = normalizeRecipient(recipientEmail)

  return withRecipientLock(lockKey, async () => {

  const verifyHeading = page.getByRole("heading", { name: /verify login/i })
  if (!(await verifyHeading.isVisible().catch(() => false))) {
    await verifyHeading.waitFor({ state: "visible", timeout: 4_000 }).catch(() => {
      // No 2FA step was shown for this login attempt.
    })
    if (!(await verifyHeading.isVisible().catch(() => false))) {
      return
    }
  }

  if (!mailcatcherHost) {
    throw new Error(
      "2FA UI step is visible but MAILCATCHER_HOST is not set for Playwright tests.",
    )
  }

  const existingMessageIds = new Set(
    (await listMailMessages(page.request, mailcatcherHost)).map((m) => m.id),
  )

  // Trigger resend so tests always verify against a fresh challenge email.
  await page.getByRole("button", { name: /resend code/i }).click()

  const code = await waitForVerificationCode({
    request: page.request,
    mailcatcherHost,
    existingMessageIds,
    recipientEmail,
    subjectIncludes: "login verification code",
  })

  await page.getByLabel(/verification code/i).fill(code)
  await page.getByRole("button", { name: /verify code/i }).click()

    await expect(page).not.toHaveURL(/\/login$/)
  })
}
