import { expect, test, type APIRequestContext } from "@playwright/test"
import { loginForE2E } from "../utils/auth"

const API_URL = process.env.VITE_API_URL || "http://127.0.0.1:8000"
const MAILCATCHER_HOST = process.env.MAILCATCHER_HOST

const ADMIN_EMAIL =
  process.env.E2E_SUPERUSER || process.env.FIRST_SUPERUSER || ""
const ADMIN_PASSWORD =
  process.env.E2E_SUPERUSER_PASSWORD ||
  process.env.FIRST_SUPERUSER_PASSWORD ||
  ""

test.describe("email sending", () => {
  test.skip(!MAILCATCHER_HOST, "MAILCATCHER_HOST not set")

  test("sends a test email via utils endpoint", async ({ request }) => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error(
        "Missing admin credentials. Set E2E_SUPERUSER and E2E_SUPERUSER_PASSWORD (or FIRST_SUPERUSER / FIRST_SUPERUSER_PASSWORD).",
      )
    }

    const beforeMessages = await listMailcatcherMessages(request)

    const token = await loginForE2E({
      request,
      username: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      recipientEmail: ADMIN_EMAIL,
      apiBaseUrl: API_URL,
    })

    const testEmail = `e2e.${Date.now()}@example.com`
    const sendResponse = await request.post(
      `${API_URL}/api/v1/utils/test-email/?email_to=${encodeURIComponent(
        testEmail,
      )}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )
    expect(sendResponse.ok()).toBeTruthy()

    await expect
      .poll(async () => (await listMailcatcherMessages(request)).length, {
        timeout: 15_000,
        intervals: [500, 1000, 1500, 2000],
      })
      .toBeGreaterThan(beforeMessages.length)
  })
})

async function listMailcatcherMessages(request: APIRequestContext) {
  if (!MAILCATCHER_HOST) {
    return []
  }
  const response = await request.get(`${MAILCATCHER_HOST}/messages`)
  if (!response.ok()) {
    throw new Error(`Mailcatcher not reachable: ${response.status()}`)
  }
  return (await response.json()) as Array<{ id: number }>
}
