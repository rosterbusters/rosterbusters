import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect, useCallback } from "react"
import { Flex, Box, Text, Switch, Spinner, Center } from "@chakra-ui/react"
import { Mail } from "lucide-react"
import { showErrorToast, showSuccessToast } from "@/components/ui/toast"

export const Route = createFileRoute("/ward-staff/settings")({
  component: SettingsPage,
})

// ---------------------------------------------------------------------------
// Configuration — notification types WS can toggle.
// Grouped toggles (e.g. Approved + Rejected) share a single switch.
// ---------------------------------------------------------------------------
const WS_TOGGLEABLE_NOTIFICATIONS: {
  label: string
  types: string[]
  description: string
}[] = [
  {
    label: "Shift Request Period Open",
    types: ["ShiftRequestPeriodOpen"],
    description: "Get notified when the shift request window opens for a new roster period.",
  },
  {
    label: "Shift Request Period Close",
    types: ["ShiftRequestPeriodClosingSoon"],
    description: "Get a reminder 12 hours before the shift request window closes.",
  },
  {
    label: "Shift Request Status",
    types: ["ShiftRequestApproved", "ShiftRequestRejected"],
    description: "Get notified when your shift request is approved or rejected by the manager.",
  },
  {
    label: "Roster Released",
    types: ["RosterRelease"],
    description: "Get notified when your roster for the upcoming period is published.",
  },
  {
    label: "Leave Request Status",
    types: ["LeaveApproved", "LeaveRejected"],
    description: "Get notified when your leave request is approved or rejected.",
  },
]

// All individual notification types (flat list)
const ALL_TYPES = WS_TOGGLEABLE_NOTIFICATIONS.flatMap((n) => n.types)

// All types in the group must be true for the group toggle to show as ON.
function isGroupEnabled(prefs: Record<string, boolean>, types: string[]): boolean {
  return types.every((t) => prefs[t] !== false)
}

// Master email is ON unless every individual type is explicitly disabled.
function isMasterEnabled(prefs: Record<string, boolean>): boolean {
  return ALL_TYPES.some((t) => prefs[t] !== false)
}

const BASE = import.meta.env.VITE_API_URL || ""

async function fetchPreferences(token: string): Promise<Record<string, boolean>> {
  const res = await fetch(`${BASE}/api/v1/notifications/preferences`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error("Failed to load preferences")
  const data = await res.json()
  return (data.preferences as Record<string, boolean>) ?? {}
}

async function patchPreferences(token: string, update: Record<string, boolean>): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/notifications/preferences`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ preferences: update }),
  })
  if (!res.ok) throw new Error("Failed to save preferences")
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
function SettingsPage() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const token = localStorage.getItem("access_token") ?? ""

  useEffect(() => {
    fetchPreferences(token)
      .then(setPrefs)
      .catch(() => showErrorToast("Failed to load notification preferences."))
      .finally(() => setLoading(false))
  }, [token])

  const masterEnabled = isMasterEnabled(prefs)

  // Toggle an individual notification group
  const handleToggle = useCallback(
    async (label: string, types: string[], newValue: boolean) => {
      const previous = { ...prefs }
      const update: Record<string, boolean> = {}
      types.forEach((t) => { update[t] = newValue })
      setPrefs((prev) => ({ ...prev, ...update }))
      setSaving(label)
      try {
        await patchPreferences(token, update)
        showSuccessToast(
          newValue ? "Email notification enabled." : "Email notification disabled.",
          { title: label },
        )
      } catch {
        setPrefs(previous)
        showErrorToast("Failed to save preference. Please try again.")
      } finally {
        setSaving(null)
      }
    },
    [prefs, token],
  )

  // Toggle the master "By Email" channel switch
  const handleMasterToggle = useCallback(
    async (newValue: boolean) => {
      const previous = { ...prefs }
      // Build an update that sets every individual type to the new value
      const update: Record<string, boolean> = {}
      ALL_TYPES.forEach((t) => { update[t] = newValue })
      setPrefs((prev) => ({ ...prev, ...update }))
      setSaving("__master__")
      try {
        await patchPreferences(token, update)
        showSuccessToast(
          newValue
            ? "Email notifications enabled."
            : "All email notifications disabled.",
          { title: "By Email" },
        )
      } catch {
        setPrefs(previous)
        showErrorToast("Failed to save preference. Please try again.")
      } finally {
        setSaving(null)
      }
    },
    [prefs, token],
  )

  return (
    <Flex
      minH="calc(100vh - 64px)"
      w="full"
      direction="column"
      bgColor="background2"
      p={{ base: 4, md: 6 }}
      gap={5}
    >
      {/* ── Page header card ── */}
      <Box bgColor="white" p={6} rounded="xl" shadow="sm">
        <Text fontSize="xl" fontWeight="bold" color="#4B8798">
          Settings
        </Text>
        <Text color="#6B7280" fontSize="sm" mt={1}>
          Manage your account preferences and notification settings.
        </Text>
      </Box>

      {/* ── Notifications card ── */}
      <Box bgColor="white" rounded="xl" shadow="sm" overflow="hidden">
        {/* Section header */}
        <Box px={6} py={4} borderBottomWidth="1px" borderColor="#F0F4F5">
          <Text fontSize="md" fontWeight="semibold" color="#374151">
            Notifications
          </Text>
        </Box>

        <Box px={6} py={5}>
          {/* ── Master channel toggle ── */}
          <Box mb={6}>
            <Text fontSize="sm" fontWeight="semibold" color="#6B7280" mb={3}>
              PREFERRED NOTIFICATION CHANNEL
            </Text>
            <Flex
              align="center"
              justify="space-between"
              py={3}
              px={4}
              rounded="lg"
              bgColor={masterEnabled ? "#F0F9FB" : "#F8FAFC"}
              border="1px solid"
              borderColor={masterEnabled ? "#D1EAF0" : "#E2E8F0"}
              transition="all 0.15s ease"
              _hover={{ borderColor: "#4B8798", shadow: "sm" }}
            >
              <Flex align="center" gap={3}>
                <Box
                  w={8}
                  h={8}
                  rounded="md"
                  bgColor={masterEnabled ? "#EBF5F7" : "#F3F4F6"}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Mail size={16} color={masterEnabled ? "#4B8798" : "#9CA3AF"} />
                </Box>
                <Box>
                  <Text fontSize="sm" fontWeight="medium" color="#374151">
                    By Email
                  </Text>
                  <Text fontSize="xs" color="#9CA3AF">
                    {masterEnabled
                      ? "Email notifications are active"
                      : "All email notifications are off"}
                  </Text>
                </Box>
              </Flex>
              <Flex align="center" gap={2}>
                {saving === "__master__" && <Spinner size="xs" color="#4B8798" />}
                <Switch.Root
                  checked={masterEnabled}
                  disabled={saving === "__master__"}
                  size="md"
                  colorPalette="teal"
                  onCheckedChange={(details) => handleMasterToggle(details.checked)}
                >
                  <Switch.HiddenInput />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Root>
              </Flex>
            </Flex>
          </Box>

          {/* Horizontal divider */}
          <Box h="1px" bgColor="#F0F4F5" mb={6} />

          {/* ── Individual notification toggles ── */}
          <Box>
            <Text fontSize="sm" fontWeight="semibold" color="#6B7280" mb={3}>
              EMAIL NOTIFICATION PREFERENCES
            </Text>

            {loading ? (
              <Center py={8}>
                <Spinner color="#4B8798" />
              </Center>
            ) : (
              <Flex direction="column" gap={3}>
                {WS_TOGGLEABLE_NOTIFICATIONS.map((item, idx) => {
                  const enabled = masterEnabled && isGroupEnabled(prefs, item.types)
                  const isSavingThis = saving === item.label
                  const isDisabled = !masterEnabled || isSavingThis
                  return (
                    <Flex
                      key={idx}
                      align="center"
                      justify="space-between"
                      py={3}
                      px={4}
                      rounded="lg"
                      border="1px solid"
                      borderColor={enabled ? "#D1EAF0" : "#E2E8F0"}
                      bgColor={enabled ? "#F0F9FB" : "white"}
                      opacity={!masterEnabled ? 0.5 : 1}
                      transition="all 0.15s ease"
                      _hover={masterEnabled ? { borderColor: "#4B8798", shadow: "sm" } : {}}
                    >
                      <Box flex={1} pr={4}>
                        <Text fontSize="sm" fontWeight="medium" color="#374151">
                          {item.label}
                        </Text>
                        <Text fontSize="xs" color="#9CA3AF" mt={0.5}>
                          {item.description}
                        </Text>
                      </Box>
                      <Flex align="center" gap={2}>
                        {isSavingThis && <Spinner size="xs" color="#4B8798" />}
                        <Switch.Root
                          checked={enabled}
                          disabled={isDisabled}
                          size="md"
                          colorPalette="teal"
                          onCheckedChange={(details) =>
                            handleToggle(item.label, item.types, details.checked)
                          }
                        >
                          <Switch.HiddenInput />
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                        </Switch.Root>
                      </Flex>
                    </Flex>
                  )
                })}
              </Flex>
            )}
          </Box>

          {/* Footer note */}
          <Box mt={6} pt={4} borderTopWidth="1px" borderColor="#F0F4F5">
            <Text fontSize="xs" color="#9CA3AF">
              Some notifications (e.g. shift change alerts) are always enabled and cannot be turned off.
            </Text>
          </Box>
        </Box>
      </Box>
    </Flex>
  )
}

export default SettingsPage
