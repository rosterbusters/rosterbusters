import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react"
import { type ChangeEvent, useEffect, useRef, useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"
import { z } from "zod"
import {
  AdminService,
  type AdminUser,
  type AdminUserCreate,
  type AdminUserFilters,
  type AdminUsersResponse,
  type AdminUserUpdate,
  type DesignationOption,
  type WardOption,
} from "@/client/adminService"
import { showErrorToast, showSuccessToast } from "@/components/ui/toast"
import { emailPattern } from "@/utils"

const usersSearchSchema = z.object({
  page: z.number().int().min(1).catch(1),
})

const PER_PAGE = 10

const joinDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

const formatJoinDate = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return value
  return joinDateFormatter.format(parsed)
}

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
  validateSearch: (search) => usersSearchSchema.parse(search),
})

/* ------------------------------------------------------------------ */
/*  Add / Edit user dialog                                            */
/* ------------------------------------------------------------------ */

interface UserFormData {
  username: string
  name: string
  email: string
  employee_id: string
  join_date: string
  designation: string
  password: string
  confirm_password: string
  is_active: boolean
  role: string
}

interface CreatedUserInfo {
  userid?: number
  username: string
  name?: string | null
  generated_password?: string | null
}

interface ParsedImportRow {
  rowNumber: number
  username: string
  name?: string
  email?: string
  employee_id?: string
  join_date?: string
  designation?: string
  shift_pattern?: "AM_ONLY" | "PM_ONLY" | null
  password?: string
  is_active: boolean
  role: string
  ward_ids?: number[]
}

interface PendingImportState {
  file: File
  password?: string
}

interface ParsedImportResult {
  rows: ParsedImportRow[]
  skipped: string[]
}

interface ImportProgressState {
  total: number
  processed: number
  imported: number
  failed: number
  currentLabel: string
}

const normalizeHeader = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "")

const textValue = (value: unknown): string => {
  if (value == null) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "number") return String(value).trim()
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value).trim()
}

const findCellValue = (
  row: Record<string, unknown>,
  aliases: string[],
): string => {
  const normalizedAliases = new Set(aliases.map(normalizeHeader))
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeHeader(key))) {
      return textValue(value)
    }
  }
  return ""
}

const findCellRawValue = (
  row: Record<string, unknown>,
  aliases: string[],
): unknown => {
  const normalizedAliases = new Set(aliases.map(normalizeHeader))
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeHeader(key))) {
      return value
    }
  }
  return undefined
}

const JOIN_DATE_IMPORT_ALIASES = [
  "join date",
  "join_date",
  "date joined",
  "joined date",
  "hired date",
  "hire date",
  "date hired",
  "date of hire",
  "start date",
  "commencement date",
]

const parseImportedJoinDate = (
  XLSX: typeof import("xlsx"),
  value: unknown,
): string | undefined => {
  if (value == null || value === "") return undefined

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) {
      throw new Error(`Unsupported join date value "${value}".`)
    }
    const year = String(parsed.y).padStart(4, "0")
    const month = String(parsed.m).padStart(2, "0")
    const day = String(parsed.d).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  const text = textValue(value)
  if (!text) return undefined

  const normalized = text
    .replace(/\./g, "-")
    .replace(/\//g, "-")
    .replace(/\s+/g, " ")
    .trim()

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    const [year, month, day] = normalized.split("-")
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
  }

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unsupported join date "${text}". Use a valid date.`)
  }
  return parsed.toISOString().slice(0, 10)
}

const slugifyUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")

const takeFirstTwoWords = (value: string) =>
  value.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(" ")

const buildUsernameFromName = (value: string) =>
  slugifyUsername(takeFirstTwoWords(value))

const NURSE_MANAGER_IMPORT_ROLE_MATCHERS = [
  "nursingmanager",
  "nursemanager",
  "nurseclinician",
]

const isExcludedImportRole = (value: string) => {
  const normalized = normalizeHeader(value)
  if (!normalized) return false
  return (
    normalized.includes("psa") ||
    normalized.includes("patientserviceassistant") ||
    normalized.includes("patientserviceasst")
  )
}

const resolveImportedRole = (
  value: string,
): "Admin" | "NurseManager" | "Nurse" | null => {
  const normalized = normalizeHeader(value)
  if (!normalized) return null
  if (isExcludedImportRole(value)) return null
  if (
    NURSE_MANAGER_IMPORT_ROLE_MATCHERS.some((matcher) =>
      normalized.includes(matcher),
    )
  ) {
    return "NurseManager"
  }
  if (normalized.includes("admin")) return "Admin"
  if (normalized.includes("manager")) return "NurseManager"
  return "Nurse"
}

const inferRole = (value: string): "Admin" | "NurseManager" | "Nurse" => {
  return resolveImportedRole(value) ?? "Nurse"
}

const parseActiveValue = (value: string) => {
  void value
  return true
}

const parseShiftPatternValue = (
  value: string,
): "AM_ONLY" | "PM_ONLY" | null | undefined => {
  const normalized = normalizeHeader(value)
  if (!normalized) return undefined

  if (
    [
      "amonly",
      "aonly",
      "morningonly",
      "dayonly",
      "permanentam",
      "permanenta",
    ].includes(normalized)
  ) {
    return "AM_ONLY"
  }

  if (
    [
      "pmonly",
      "ponly",
      "afternoononly",
      "eveningonly",
      "permanentpm",
      "permanentp",
    ].includes(normalized)
  ) {
    return "PM_ONLY"
  }

  if (["none", "nil", "na", "n/a", "nopermanentpattern"].includes(normalized)) {
    return null
  }

  throw new Error(
    `Unsupported shift pattern "${value}". Use AM_ONLY or PM_ONLY.`,
  )
}

const parseWardIds = (value: string, wards: WardOption[]) => {
  if (!value.trim()) return []

  const wardMap = new Map(
    wards.map((ward) => [normalizeHeader(ward.wardname), ward.wardid]),
  )

  const resolved = value
    .split(/[,;/\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const wardId = wardMap.get(normalizeHeader(part))
      if (!wardId) {
        throw new Error(`Unknown ward "${part}"`)
      }
      return wardId
    })

  return Array.from(new Set(resolved))
}

const normalizeWardName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b0+(\d+)/g, "$1")
    .replace(/\bdahila\b/g, "dahlia")
    .replace(/[^a-z0-9]+/g, "")

const STAFF_LIST_WARD_ALIASES: Record<string, string[]> = {
  acaciaward: ["acaciaward"],
  angsanaward: ["angsanaward"],
  banyanward: ["banyanward"],
  casuarinaward: ["casuarinaward"],
  cedarward: ["cedarward"],
  dahliaward: ["dahliaward", "dahilaward"],
  daisyward: ["daisyward"],
  ward4: ["ward4", "ward04"],
  ward5: ["ward5", "ward05"],
  ward6: ["ward6", "ward06"],
  ward7: ["ward7", "ward07"],
  ward8: ["ward8", "ward08"],
  ward9: ["ward9", "ward09"],
  ward10: ["ward10"],
  ward11: ["ward11"],
}

const parseWorkbookRole = (
  occupation: string,
): "Admin" | "Nurse" | "NurseManager" | null => resolveImportedRole(occupation)

const parseWorkbookWardIds = (value: string, wards: WardOption[]) => {
  const wardMap = new Map<string, number>()
  wards.forEach((ward) => {
    const normalizedWardName = normalizeWardName(ward.wardname)
    wardMap.set(normalizedWardName, ward.wardid)
    const aliases = STAFF_LIST_WARD_ALIASES[normalizedWardName] ?? []
    aliases.forEach((alias) => wardMap.set(alias, ward.wardid))
  })

  const normalizedValue = normalizeWardName(value)
  const wardId = wardMap.get(normalizedValue)
  if (!wardId) {
    return undefined
  }
  return [wardId]
}

const buildImportedUsername = (name: string, rowNumber: number) => {
  const base = buildUsernameFromName(name) || `staff.${rowNumber}`
  return base
}

const ensureUniqueUsername = (base: string, used: Set<string>) => {
  let candidate = base
  let suffix = 1
  while (used.has(candidate)) {
    suffix += 1
    candidate = `${base}${suffix}`
  }
  used.add(candidate)
  return candidate
}

const parseExactStaffWorkbook = (
  XLSX: typeof import("xlsx"),
  workbook: import("xlsx").WorkBook,
  wards: WardOption[],
): ParsedImportResult => {
  const rows: ParsedImportRow[] = []
  const skipped: string[] = []

  if (workbook.Sheets.NUR) {
    const nurseRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets.NUR,
      { defval: "" },
    )

    nurseRows.forEach((row, index) => {
      const employeeId = textValue(row["Employee ID"])
      const name = textValue(row["EMP NAME"])
      const occupation = textValue(row.OCCUPATION)
      const department = textValue(row["DEPARTMENT CODE"])
      const email = findCellValue(row, ["email", "email address", "e-mail"])
      const joinDate = parseImportedJoinDate(
        XLSX,
        findCellRawValue(row, JOIN_DATE_IMPORT_ALIASES),
      )
      const shiftPattern = parseShiftPatternValue(
        findCellValue(row, [
          "shift pattern",
          "shift_pattern",
          "shift",
          "permanent shift",
          "permanent shift pattern",
        ]),
      )
      const role = parseWorkbookRole(occupation)

      if (!name) {
        skipped.push(`NUR row ${index + 2} skipped because name is missing.`)
        return
      }

      if (isExcludedImportRole(occupation)) {
        skipped.push(
          `NUR row ${index + 2} skipped because "${occupation}" is a PSA role.`,
        )
        return
      }

      if (!role) {
        skipped.push(
          `NUR row ${index + 2} skipped because "${occupation}" is not a Nurse or Nurse Manager role.`,
        )
        return
      }

      try {
        const wardIds = parseWorkbookWardIds(department, wards)
        rows.push({
          rowNumber: index + 2,
          username: buildImportedUsername(name, index + 2),
          name: name || undefined,
          email: email || undefined,
          employee_id: employeeId || undefined,
          join_date: joinDate,
          designation: occupation || undefined,
          shift_pattern: shiftPattern,
          is_active: true,
          role,
          ward_ids: wardIds,
        })
        if (!wardIds?.length && department) {
          skipped.push(
            `NUR row ${index + 2}: ward "${department}" was not matched, so the user was imported without a ward assignment.`,
          )
        }
      } catch (error: any) {
        skipped.push(
          `NUR row ${index + 2} skipped: ${error?.message ?? "Unknown ward."}`,
        )
      }
    })
  }

  if (workbook.Sheets["CEN Listing"]) {
    const cenRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets["CEN Listing"],
      { defval: "" },
    )

    cenRows.forEach((row, index) => {
      const name = textValue(row.Name)
      const position = textValue(row.Position)
      const department = textValue(row.Department)
      const email = findCellValue(row, ["email", "email address", "e-mail"])
      const joinDate = parseImportedJoinDate(
        XLSX,
        findCellRawValue(row, JOIN_DATE_IMPORT_ALIASES),
      )
      const shiftPattern = parseShiftPatternValue(
        findCellValue(row, [
          "shift pattern",
          "shift_pattern",
          "shift",
          "permanent shift",
          "permanent shift pattern",
        ]),
      )
      const role = parseWorkbookRole(position)

      if (!name) {
        skipped.push(
          `CEN Listing row ${index + 2} skipped because name is missing.`,
        )
        return
      }

      if (isExcludedImportRole(position)) {
        skipped.push(
          `CEN Listing row ${index + 2} skipped because "${position}" is a PSA role.`,
        )
        return
      }

      if (!role) {
        skipped.push(
          `CEN Listing row ${index + 2} skipped because "${position}" is not a Nurse or Nurse Manager role.`,
        )
        return
      }

      try {
        const wardIds = parseWorkbookWardIds(department, wards)
        rows.push({
          rowNumber: index + 2,
          username: buildImportedUsername(name, index + 2),
          name: name || undefined,
          email: email || undefined,
          employee_id: undefined,
          join_date: joinDate,
          designation: position || undefined,
          shift_pattern: shiftPattern,
          is_active: true,
          role,
          ward_ids: wardIds,
        })
        if (!wardIds?.length && department) {
          skipped.push(
            `CEN Listing row ${index + 2}: ward "${department}" was not matched, so the user was imported without a ward assignment.`,
          )
        }
      } catch (error: any) {
        skipped.push(
          `CEN Listing row ${index + 2} skipped: ${error?.message ?? "Unknown ward."}`,
        )
      }
    })
  }

  return { rows, skipped }
}

async function parseStaffWorkbook(
  file: File,
  wards: WardOption[],
  password?: string,
): Promise<ParsedImportResult> {
  const XLSX = await import("xlsx")
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    password,
  })

  if (workbook.Sheets.NUR || workbook.Sheets["CEN Listing"]) {
    return parseExactStaffWorkbook(XLSX, workbook, wards)
  }

  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error("The workbook does not contain any sheets.")
  }

  const worksheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
  })

  if (rows.length === 0) {
    throw new Error("The selected sheet is empty.")
  }

  const parsedRows: ParsedImportRow[] = []
  const skipped: string[] = []

  rows.forEach((row, index) => {
    const employeeId = findCellValue(row, [
      "employee id",
      "employee_id",
      "employeeid",
      "staff id",
      "staffid",
    ])
    const designation = findCellValue(row, [
      "designation",
      "occupation",
      "position",
      "job title",
    ])
    const joinDate = parseImportedJoinDate(
      XLSX,
      findCellRawValue(row, JOIN_DATE_IMPORT_ALIASES),
    )
    const roleText = findCellValue(row, [
      "role",
      "designation",
      "position",
      "user role",
    ])
    if (isExcludedImportRole(roleText)) {
      skipped.push(
        `Row ${index + 2} skipped because "${roleText}" is a PSA role.`,
      )
      return
    }
    const role = inferRole(roleText)
    const email = findCellValue(row, ["email", "email address", "e-mail"])
    const rawUsername = findCellValue(row, [
      "username",
      "user name",
      "name",
      "staff name",
      "employee name",
      "full name",
    ])
    const username = rawUsername
      ? rawUsername.trim().includes(" ")
        ? buildUsernameFromName(rawUsername)
        : slugifyUsername(rawUsername)
      : slugifyUsername(email.split("@")[0] || employeeId)
    const name = rawUsername || username
    const wardText = findCellValue(row, [
      "ward",
      "ward name",
      "assigned ward",
      "wards",
      "unit",
    ])
    const password = findCellValue(row, ["password", "temporary password"])
    const shiftPattern = parseShiftPatternValue(
      findCellValue(row, [
        "shift pattern",
        "shift_pattern",
        "shift",
        "permanent shift",
        "permanent shift pattern",
      ]),
    )
    const isActive = parseActiveValue(
      findCellValue(row, ["active", "is active", "status"]),
    )

    if (!username) {
      throw new Error(`Row ${index + 2}: missing username/name/email.`)
    }

    if ((role === "Nurse" || role === "NurseManager") && !employeeId) {
      throw new Error(`Row ${index + 2}: missing employee ID.`)
    }

    parsedRows.push({
      rowNumber: index + 2,
      username,
      name: name || undefined,
      email: email || undefined,
      employee_id: employeeId || undefined,
      join_date: joinDate,
      designation: designation || undefined,
      shift_pattern: shiftPattern,
      password: password || undefined,
      is_active: isActive,
      role,
      ward_ids:
        role === "Nurse" || role === "NurseManager"
          ? parseWardIds(wardText, wards)
          : undefined,
    })
  })

  return { rows: parsedRows, skipped }
}

function UserFormDialog({
  open,
  onClose,
  editUser,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  editUser?: AdminUser | null
  onCreated?: (info: CreatedUserInfo) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = !!editUser

  // Fetch wards for the dropdown
  const { data: wards = [] } = useQuery<WardOption[]>({
    queryKey: ["admin-wards"],
    queryFn: () => AdminService.listWards(),
    staleTime: 60_000,
  })

  const { data: designations = [] } = useQuery<DesignationOption[]>({
    queryKey: ["admin-designations"],
    queryFn: () => AdminService.listDesignations(),
    staleTime: 60_000,
  })

  const designationOptions = designations.map((d) => d.designation)

  const currentRole = isEdit ? (editUser.roles[0] ?? "Nurse") : "Nurse"

  // Multi-ward selection state
  const [selectedWardIds, setSelectedWardIds] = useState<number[]>(
    isEdit ? editUser.wards.map((w) => w.ward_id) : [],
  )

  const toggleWard = (wardId: number) => {
    setSelectedWardIds((prev) =>
      prev.includes(wardId)
        ? prev.filter((id) => id !== wardId)
        : [...prev, wardId],
    )
  }

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UserFormData>({
    mode: "onBlur",
    defaultValues: isEdit
      ? {
          username: editUser.username,
          name: editUser.name ?? "",
          email: editUser.email ?? "",
          employee_id: editUser.employee_id ?? "",
          join_date: editUser.join_date ?? "",
          designation: editUser.designation ?? "",
          password: "",
          confirm_password: "",
          is_active: editUser.isactive,
          role: currentRole,
        }
      : {
          username: "",
          name: "",
          email: "",
          employee_id: "",
          join_date: "",
          designation: "",
          password: "",
          confirm_password: "",
          is_active: true,
          role: "Nurse",
        },
  })

  const selectedRole = watch("role")
  const showsStaffFields =
    selectedRole === "Nurse" || selectedRole === "NurseManager"
  const showsNurseFields = selectedRole === "Nurse"

  const createMutation = useMutation({
    mutationFn: (data: AdminUserCreate) => AdminService.createUser(data),
    onSuccess: (result) => {
      showSuccessToast("User created successfully.")
      if (result.generated_password) {
        onCreated?.({
          userid: result.userid,
          username: result.username,
          generated_password: result.generated_password,
        })
      }
      reset()
      onClose()
    },
    onError: (err: any) => {
      showErrorToast(
        err.body?.detail ?? err.message ?? "Failed to create user.",
      )
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  })

  const updateMutation = useMutation({
    mutationFn: (data: AdminUserUpdate) =>
      AdminService.updateUser(editUser!.userid, data),
    onSuccess: () => {
      showSuccessToast("User updated successfully.")
      reset()
      onClose()
    },
    onError: (err: any) => {
      showErrorToast(
        err.body?.detail ?? err.message ?? "Failed to update user.",
      )
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  })

  const onSubmit: SubmitHandler<UserFormData> = (data) => {
    if (isEdit) {
      const payload: AdminUserUpdate = {
        username: data.username,
        name: data.name || undefined,
        email: data.email.trim() ? data.email.trim() : null,
        is_active: data.is_active,
        role: data.role,
      }
      if (showsStaffFields) {
        payload.employee_id = data.employee_id.trim()
      }
      if (showsNurseFields) {
        payload.join_date = data.join_date || null
        payload.designation = data.designation.trim()
      }
      if (data.password) payload.password = data.password
      // Only send ward_ids if this user is a nurse or manager
      if (showsStaffFields) {
        payload.ward_ids = selectedWardIds
      }
      updateMutation.mutate(payload)
    } else {
      const payload: AdminUserCreate = {
        name: data.name || undefined,
        is_active: data.is_active,
        role: data.role,
      }
      if (data.email) payload.email = data.email
      if (data.role === "Nurse" || data.role === "NurseManager") {
        payload.employee_id = data.employee_id.trim()
      }
      if (data.role === "Nurse") {
        if (data.join_date) payload.join_date = data.join_date
        payload.designation = data.designation.trim()
      }
      if (data.password) payload.password = data.password
      if (data.role === "Nurse" || data.role === "NurseManager") {
        payload.ward_ids = selectedWardIds
      }
      createMutation.mutate(payload)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">
            {isEdit ? "Edit User" : "Add User"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit as SubmitHandler<UserFormData>)}
          className="flex flex-col overflow-hidden"
        >
          <div className="p-6 space-y-4 overflow-y-auto">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
                {!isEdit && <span className="text-red-500"> *</span>}
              </label>
              <input
                {...register("name", {
                  validate: (value) => {
                    if (!isEdit && !value?.trim()) {
                      return "Name is required"
                    }
                    return true
                  },
                })}
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="LEE Chuen Shu"
              />
              {errors.name && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.name.message}
                </p>
              )}
            </div>

            {isEdit ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username <span className="text-red-500">*</span>
                </label>
                <input
                  {...register("username", {
                    required: "Username is required",
                  })}
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="johndoe"
                />
                {errors.username && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.username.message}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                Username will be auto-generated from Name.
              </p>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email{" "}
                {!isEdit && (
                  <span className="text-gray-400 text-xs">
                    (optional — user can add on first login)
                  </span>
                )}
              </label>
              <input
                {...register("email", {
                  pattern: emailPattern,
                })}
                type="email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="user@example.com"
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role <span className="text-red-500">*</span>
              </label>
              <select
                {...register("role")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Nurse">Nurse</option>
                <option value="NurseManager">Nurse Manager</option>
                <option value="Admin">Admin</option>
              </select>
            </div>

            {showsStaffFields && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Employee ID
                </label>
                <input
                  {...register("employee_id")}
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="EMP00123"
                />
                {errors.employee_id && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.employee_id.message}
                  </p>
                )}
              </div>
            )}

            {showsNurseFields && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Join Date
                </label>
                <input
                  {...register("join_date")}
                  type="date"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.join_date && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.join_date.message}
                  </p>
                )}
              </div>
            )}

            {showsNurseFields && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Designation <span className="text-red-500">*</span>
                </label>
                <select
                  {...register("designation", {
                    validate: (value) => {
                      if (!showsNurseFields) return true
                      if (!value?.trim())
                        return "Designation is required for nurses"
                      return true
                    },
                  })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select designation</option>
                  {designationOptions.map((designation) => (
                    <option key={designation} value={designation}>
                      {designation}
                    </option>
                  ))}
                  {isEdit &&
                    editUser?.designation &&
                    !designationOptions.includes(editUser.designation) && (
                      <option value={editUser.designation}>
                        {editUser.designation}
                      </option>
                    )}
                </select>
                {errors.designation && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.designation.message}
                  </p>
                )}
              </div>
            )}

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password{" "}
                {!isEdit && (
                  <span className="text-gray-400 text-xs">
                    (leave blank to auto-generate)
                  </span>
                )}
                {isEdit && (
                  <span className="text-gray-400 text-xs">
                    (leave blank to keep current)
                  </span>
                )}
              </label>
              <input
                {...register("password", {
                  minLength: {
                    value: 8,
                    message: "Password must be at least 8 characters",
                  },
                })}
                type="password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="********"
              />
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                {...register("confirm_password", {
                  validate: (value) =>
                    !getValues().password ||
                    value === getValues().password ||
                    "Passwords do not match",
                })}
                type="password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="********"
              />
              {errors.confirm_password && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.confirm_password.message}
                </p>
              )}
            </div>

            {/* Ward assignment — show for Nurse / NurseManager */}
            {showsStaffFields && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {selectedRole === "NurseManager"
                    ? "Manages Wards"
                    : "Assigned Wards"}
                  {selectedRole === "Nurse" && (
                    <span className="text-gray-400 text-xs ml-1">
                      (first = primary ward for scheduling)
                    </span>
                  )}
                </label>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-300 divide-y divide-gray-100">
                  {wards.filter((w) => w.isactive).length === 0 ? (
                    <p className="px-3 py-2 text-sm text-gray-400">
                      No wards available
                    </p>
                  ) : (
                    wards
                      .filter((w) => w.isactive)
                      .map((w) => (
                        <label
                          key={w.wardid}
                          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedWardIds.includes(w.wardid)}
                            onChange={() => toggleWard(w.wardid)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-gray-900">{w.wardname}</span>
                          {w.location && (
                            <span className="text-gray-400 text-xs">
                              ({w.location})
                            </span>
                          )}
                        </label>
                      ))
                  )}
                </div>
                {selectedWardIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedWardIds.length} ward
                    {selectedWardIds.length !== 1 ? "s" : ""} selected
                  </p>
                )}
              </div>
            )}

            {/* Active toggle */}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...register("is_active")}
                className="rounded border-gray-300"
              />
              Active
            </label>
          </div>

          <div className="flex justify-end gap-3 p-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : isEdit ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Delete confirmation dialog                                        */
/* ------------------------------------------------------------------ */

function DeleteDialog({
  open,
  onClose,
  user,
}: {
  open: boolean
  onClose: () => void
  user: AdminUser | null
}) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (id: number) => AdminService.deleteUser(id),
    onMutate: async (id) => {
      const queryKey = ["admin-users"]
      await queryClient.cancelQueries({ queryKey })
      const previousUsers = queryClient.getQueriesData<AdminUsersResponse>({
        queryKey,
      })

      queryClient.setQueriesData<AdminUsersResponse>(
        { queryKey },
        (current) => {
          if (!current) return current

          const nextData = current.data.filter((item) => item.userid !== id)
          const removedFromPage = nextData.length !== current.data.length

          return {
            ...current,
            data: nextData,
            count: removedFromPage
              ? Math.max(0, current.count - 1)
              : current.count,
          }
        },
      )

      return { previousUsers }
    },
    onSuccess: () => {
      showSuccessToast("User deleted successfully.")
      onClose()
    },
    onError: (err: any, _id, context) => {
      context?.previousUsers.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data)
      })
      showErrorToast(err.body?.detail ?? "Failed to delete user.")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
  })

  if (!open || !user) return null

  const isAdminUser = user.roles.includes("Admin")

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Delete User
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Are you sure you want to delete{" "}
          <strong>{user.username || user.email}</strong>? This action cannot be
          undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (isAdminUser) {
                showErrorToast("Admin accounts cannot be deleted.")
                return
              }
              mutation.mutate(user.userid)
            }}
            disabled={mutation.isPending || isAdminUser}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {mutation.isPending
              ? "Deleting..."
              : isAdminUser
                ? "Cannot Delete Admin"
                : "Delete"}
          </button>
        </div>
      </div>
    </div>
  )
}

function ResetPasswordDialog({
  open,
  onClose,
  user,
  onConfirm,
  loading,
}: {
  open: boolean
  onClose: () => void
  user: AdminUser | null
  onConfirm: (user: AdminUser) => void
  loading: boolean
}) {
  if (!open || !user) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Reset Password
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Generate a new temporary password for{" "}
          <strong>{user.username || user.email}</strong>? The current password
          will stop working immediately.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(user)}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

const ROLE_COLORS: Record<string, string> = {
  Admin: "bg-orange-100 text-orange-700",
  NurseManager: "bg-purple-100 text-purple-700",
  Nurse: "bg-blue-100 text-blue-700",
}

function AdminUsers() {
  const navigate = useNavigate({ from: Route.fullPath })
  const { page } = Route.useSearch()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [search, setSearch] = useState("")
  const previousSearchRef = useRef(search)
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [passwordFilter, setPasswordFilter] = useState("all")
  const [wardFilter, setWardFilter] = useState("all")
  const [formOpen, setFormOpen] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null)
  const [resetPasswordUser, setResetPasswordUser] = useState<AdminUser | null>(
    null,
  )
  const [createdUserInfo, setCreatedUserInfo] =
    useState<CreatedUserInfo | null>(null)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [copiedDefaultPasswordUserId, setCopiedDefaultPasswordUserId] =
    useState<number | null>(null)
  const [knownDefaultPasswords, setKnownDefaultPasswords] = useState<
    Record<number, string>
  >({})
  const [isImporting, setIsImporting] = useState(false)
  const [pendingImport, setPendingImport] = useState<PendingImportState | null>(
    null,
  )
  const [importPassword, setImportPassword] = useState("")
  const [importProgress, setImportProgress] =
    useState<ImportProgressState | null>(null)
  const [importCancelRequested, setImportCancelRequested] = useState(false)
  const [importFailures, setImportFailures] = useState<string[] | null>(null)
  const importCancelRequestedRef = useRef(false)

  const importRows = async (file: File, password?: string) => {
    importCancelRequestedRef.current = false
    setImportCancelRequested(false)

    const result = await parseStaffWorkbook(
      file,
      wards.filter((ward) => ward.isactive),
      password,
    )

    if (result.rows.length === 0) {
      showErrorToast(
        result.skipped[0] ?? "No staff rows were found in the selected file.",
      )
      return
    }

    const importedUsernames = new Set<string>()
    const rowsToImport = result.rows.map((row) => ({
      ...row,
      username: ensureUniqueUsername(row.username, importedUsernames),
    }))

    const failures: string[] = []
    let importedCount = 0
    let failedCount = 0

    setImportProgress({
      total: rowsToImport.length,
      processed: 0,
      imported: 0,
      failed: 0,
      currentLabel: "",
    })

    for (const [index, row] of rowsToImport.entries()) {
      if (importCancelRequestedRef.current) {
        break
      }

      setImportProgress({
        total: rowsToImport.length,
        processed: index,
        imported: importedCount,
        failed: failedCount,
        currentLabel: row.username,
      })
      try {
        const createdUser = await AdminService.createUser({
          username: row.username,
          name: row.name,
          email: row.email,
          employee_id: row.employee_id,
          join_date: row.join_date,
          designation: row.designation,
          shift_pattern: row.shift_pattern,
          password: row.password,
          is_active: row.is_active,
          role: row.role,
          ward_ids: row.ward_ids,
        })
        if (createdUser.generated_password) {
          setKnownDefaultPasswords((prev) => ({
            ...prev,
            [createdUser.userid]: createdUser.generated_password!,
          }))
        }
        importedCount += 1
      } catch (error: any) {
        const detail = String(
          error?.body?.detail ?? error?.message ?? "Import failed.",
        )
        const isDuplicateUsername =
          detail.toLowerCase().includes("username already exists") ||
          detail.toLowerCase().includes("this username already exists")
        const isDuplicateEmail =
          detail.toLowerCase().includes("email already in use") ||
          detail.toLowerCase().includes("a user with this email already exists")

        if (isDuplicateUsername || isDuplicateEmail) {
          try {
            const searchTerms = [row.username, row.email].filter(
              (value): value is string => !!value?.trim(),
            )
            let existingUser: AdminUser | undefined

            for (const searchTerm of searchTerms) {
              const existingPage = await AdminService.listUsers(
                0,
                20,
                searchTerm,
              )
              existingUser = existingPage.data.find(
                (user) =>
                  user.username === row.username ||
                  (!!row.email && user.email === row.email),
              )
              if (existingUser) {
                break
              }
            }

            if (!existingUser) {
              throw new Error(
                "Existing user not found for duplicate import row.",
              )
            }

            const updatePayload: AdminUserUpdate = {
              is_active: row.is_active,
              ward_ids: row.ward_ids,
            }
            if (row.name) updatePayload.name = row.name
            if (row.email) updatePayload.email = row.email
            if (row.employee_id) updatePayload.employee_id = row.employee_id
            if (row.role === "Nurse" && row.designation) {
              updatePayload.designation = row.designation
            }
            if (row.role === "Nurse" && row.join_date) {
              updatePayload.join_date = row.join_date
            }
            if (row.shift_pattern !== undefined) {
              updatePayload.shift_pattern = row.shift_pattern
            }

            await AdminService.updateUser(existingUser.userid, updatePayload)
            importedCount += 1
            continue
          } catch (updateError: any) {
            failedCount += 1
            failures.push(
              `Row ${row.rowNumber}: ${updateError?.body?.detail ?? updateError?.message ?? detail}`,
            )
            continue
          }
        }

        failedCount += 1
        failures.push(`Row ${row.rowNumber}: ${detail}`)
      }

      if (importCancelRequestedRef.current) {
        setImportProgress({
          total: rowsToImport.length,
          processed: index + 1,
          imported: importedCount,
          failed: failedCount,
          currentLabel: row.username,
        })
        break
      }

      setImportProgress({
        total: rowsToImport.length,
        processed: index + 1,
        imported: importedCount,
        failed: failedCount,
        currentLabel: row.username,
      })
    }

    await queryClient.invalidateQueries({ queryKey: ["admin-users"] })

    if (importCancelRequestedRef.current) {
      showSuccessToast(
        `Import canceled. ${importedCount} ${importedCount === 1 ? "record was" : "records were"} imported before cancellation.`,
      )
    } else if (importedCount > 0) {
      showSuccessToast(
        `Imported ${importedCount} staff ${importedCount === 1 ? "record" : "records"}.`,
      )
    }

    if (result.skipped.length > 0) {
      showErrorToast(result.skipped.slice(0, 3).join(" "))
    }

    if (failures.length > 0) {
      setImportFailures(failures)
      showErrorToast(failures.slice(0, 3).join(" "))
    }

    setTimeout(() => {
      setImportProgress(null)
      setImportCancelRequested(false)
    }, 800)
  }

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)

      if (previousSearchRef.current !== search) {
        previousSearchRef.current = search
        navigate({ search: (prev: any) => ({ ...prev, page: 1 }) })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search, navigate])

  const activeFilters: AdminUserFilters = {
    role: roleFilter,
    status: statusFilter,
    passwordState: passwordFilter,
    wardId: wardFilter === "all" ? undefined : Number(wardFilter),
  }

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: [
      "admin-users",
      { page, search: debouncedSearch, ...activeFilters },
    ],
    queryFn: () =>
      AdminService.listUsers(
        (page - 1) * PER_PAGE,
        PER_PAGE,
        debouncedSearch,
        activeFilters,
      ),
    placeholderData: (prev) => prev,
  })

  const { data: wards = [] } = useQuery<WardOption[]>({
    queryKey: ["admin-wards"],
    queryFn: () => AdminService.listWards(),
    staleTime: 60_000,
  })

  const selectedWardName =
    wardFilter === "all"
      ? "all-wards"
      : (wards.find((ward) => String(ward.wardid) === wardFilter)?.wardname ??
        `ward-${wardFilter}`)

  const users = data?.data ?? []
  const count = data?.count ?? 0
  const totalPages = Math.ceil(count / PER_PAGE)

  useEffect(() => {
    if (!data || isPlaceholderData) return

    const lastPage = Math.max(1, totalPages)
    if (page > lastPage) {
      navigate({
        search: (prev: any) => ({ ...prev, page: lastPage }),
        replace: true,
      })
    }
  }, [data, isPlaceholderData, navigate, page, totalPages])

  useEffect(() => {
    if (users.length === 0) return
    setKnownDefaultPasswords((prev) => {
      const next = { ...prev }
      let changed = false
      users.forEach((user) => {
        if (user.generated_password && !next[user.userid]) {
          next[user.userid] = user.generated_password
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [users])

  const setPage = (p: number) =>
    navigate({ search: (prev: any) => ({ ...prev, page: p }) })

  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value)
    if (page !== 1) {
      setPage(1)
    }
  }

  const resetPasswordMutation = useMutation({
    mutationFn: (user: AdminUser) =>
      AdminService.resetUserPassword(user.userid),
    onSuccess: (result) => {
      if (resetPasswordUser?.userid) {
        setKnownDefaultPasswords((prev) => ({
          ...prev,
          [resetPasswordUser.userid]: result.generated_password,
        }))
      }
      setResetPasswordUser(null)
      setCreatedUserInfo({
        userid: resetPasswordUser?.userid,
        username: result.username,
        generated_password: result.generated_password,
      })
      showSuccessToast("Temporary password generated.")
    },
    onError: (err: any) => {
      showErrorToast(
        err.body?.detail ?? err.message ?? "Failed to reset password.",
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
  })

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    try {
      setIsImporting(true)
      await importRows(file)
    } catch (error: any) {
      const message =
        error?.message ?? "Failed to parse the selected Excel file."
      if (message.toLowerCase().includes("password-protected")) {
        setPendingImport({ file })
        setImportPassword("")
      } else {
        showErrorToast(message)
      }
    } finally {
      setIsImporting(false)
    }
  }

  const handlePasswordProtectedImport = async () => {
    if (!pendingImport) return

    try {
      setIsImporting(true)
      await importRows(pendingImport.file, importPassword)
      setPendingImport(null)
      setImportPassword("")
    } catch (error: any) {
      const message =
        error?.message ?? "Failed to read the protected Excel file."
      if (
        message.toLowerCase().includes("password") ||
        message.toLowerCase().includes("unsupported")
      ) {
        showErrorToast("Wrong password or unsupported Excel protection type.")
      } else {
        showErrorToast(message)
      }
    } finally {
      setIsImporting(false)
    }
  }

  const handleCancelImport = () => {
    importCancelRequestedRef.current = true
    setImportCancelRequested(true)
  }

  const handleCopyCreatedPassword = async () => {
    const password = createdUserInfo?.generated_password
    if (!password) {
      showErrorToast("No password available to copy.")
      return
    }

    try {
      await navigator.clipboard.writeText(password)
      setPasswordCopied(true)
      showSuccessToast("Password copied to clipboard.")
      setTimeout(() => setPasswordCopied(false), 1500)
    } catch {
      showErrorToast("Unable to copy password. Please copy it manually.")
    }
  }

  const handleCopyDefaultPassword = async (userId: number) => {
    const password = knownDefaultPasswords[userId]
    if (!password) {
      showErrorToast("No password available to copy.")
      return
    }

    try {
      await navigator.clipboard.writeText(password)
      setCopiedDefaultPasswordUserId(userId)
      showSuccessToast("Password copied to clipboard.")
      setTimeout(
        () =>
          setCopiedDefaultPasswordUserId((prev) =>
            prev === userId ? null : prev,
          ),
        1500,
      )
    } catch {
      showErrorToast("Unable to copy password. Please copy it manually.")
    }
  }

  const progressPercent = importProgress
    ? Math.round(
        (importProgress.processed / Math.max(importProgress.total, 1)) * 100,
      )
    : 0

  const handleExportDefaultPasswords = async () => {
    if (wardFilter === "all") {
      showErrorToast("Select a specific ward to export default passwords.")
      return
    }
    const wardId = Number(wardFilter)
    if (Number.isNaN(wardId)) {
      showErrorToast("Invalid ward selection.")
      return
    }

    let allUsers: AdminUser[] = []
    try {
      const firstPage = await AdminService.listUsers(0, 200, "")
      allUsers = firstPage.data
      const total = firstPage.count
      for (let skip = allUsers.length; skip < total; skip += 200) {
        const nextPage = await AdminService.listUsers(skip, 200, "")
        allUsers = allUsers.concat(nextPage.data)
      }
    } catch (error: any) {
      showErrorToast(error?.body?.detail ?? "Failed to fetch users for export.")
      return
    }

    const rows = allUsers
      .filter((user) => user.wards.some((ward) => ward.ward_id === wardId))
      .filter(
        (user) =>
          user.must_change_password && knownDefaultPasswords[user.userid],
      )
      .map((user) => ({
        name: user.name ?? "",
        username: user.username,
        ward: user.wards.map((w) => w.ward_name).join("; "),
        password: knownDefaultPasswords[user.userid],
      }))

    if (rows.length === 0) {
      showErrorToast("No default passwords found for the selected ward.")
      return
    }

    const escapeCsv = (value: string) => {
      const safe = value.replace(/"/g, '""')
      return /[",\n]/.test(safe) ? `"${safe}"` : safe
    }

    const header = ["Name", "Username", "Ward", "Default Password"]
    const lines = [
      header.join(","),
      ...rows.map((row) =>
        [
          escapeCsv(row.name),
          escapeCsv(row.username),
          escapeCsv(row.ward),
          escapeCsv(row.password),
        ].join(","),
      ),
    ]

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const dateStamp = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `default-passwords-${selectedWardName}-${dateStamp}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Users Management
            </h1>
            <p className="text-sm text-gray-500">{count} total users</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {isImporting ? "Importing Staff List" : "Import Staff List"}
          </button>
          <button
            onClick={() => {
              setEditUser(null)
              setFormOpen(true)
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
          <button
            onClick={handleExportDefaultPasswords}
            disabled={wardFilter === "all"}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Export Default Passwords (CSV)
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name, email, or employee ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="admin-users-search"
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <select
          value={roleFilter}
          onChange={(e) => updateFilter(setRoleFilter, e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Roles</option>
          <option value="Admin">Admin</option>
          <option value="NurseManager">Nurse Manager</option>
          <option value="Nurse">Nurse</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => updateFilter(setStatusFilter, e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <select
          value={passwordFilter}
          onChange={(e) => updateFilter(setPasswordFilter, e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Password States</option>
          <option value="temporary">Temporary Password</option>
          <option value="updated">Updated Password</option>
        </select>

        <select
          value={wardFilter}
          onChange={(e) => updateFilter(setWardFilter, e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Wards</option>
          {wards.map((ward) => (
            <option key={ward.wardid} value={String(ward.wardid)}>
              {ward.wardname}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Username
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Employee ID
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Join Date
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Roles
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Designation
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Ward
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Default Password
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.userid}
                    className="border-b last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-gray-600">
                      {user.name || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">
                        {user.username}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {user.employee_id || (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatJoinDate(user.join_date) || (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]">
                      {user.email || (
                        <span className="text-gray-400 italic">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length > 0 ? (
                          user.roles.map((role) => (
                            <span
                              key={role}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[role] ?? "bg-gray-100 text-gray-700"}`}
                            >
                              {role}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">
                            No roles
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {user.designation || (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.wards && user.wards.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.wards.map((w) => (
                            <span
                              key={w.ward_id}
                              className="text-xs px-2 py-0.5 rounded-full font-medium bg-teal-100 text-teal-700"
                              data-testid={`admin-user-ward-${w.ward_id}`}
                            >
                              {w.ward_name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          user.isactive
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {user.isactive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.must_change_password &&
                      knownDefaultPasswords[user.userid] ? (
                        <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1">
                          <span className="font-mono text-xs text-gray-900">
                            {knownDefaultPasswords[user.userid]}
                          </span>
                          <button
                            onClick={() =>
                              handleCopyDefaultPassword(user.userid)
                            }
                            className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-white"
                          >
                            {copiedDefaultPasswordUserId === user.userid
                              ? "Copied!"
                              : "Copy"}
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${
                            user.must_change_password
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {user.must_change_password
                            ? "Temporary Password"
                            : "Updated"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setResetPasswordUser(user)}
                          className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Generate temporary password"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditUser(user)
                            setFormOpen(true)
                          }}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit user"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {!user.roles.includes("Admin") && (
                          <button
                            onClick={() => setDeleteUser(user)}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete user"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-4 py-12 text-center text-gray-500"
                    >
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <UserFormDialog
        key={editUser?.userid ?? "new"}
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditUser(null)
        }}
        editUser={editUser}
        onCreated={(info) => {
          setCreatedUserInfo(info)
          const userId = info.userid
          if (info.generated_password && typeof userId === "number") {
            setKnownDefaultPasswords((prev) => ({
              ...prev,
              [userId]: info.generated_password!,
            }))
          }
        }}
      />
      <DeleteDialog
        open={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        user={deleteUser}
      />
      <ResetPasswordDialog
        open={!!resetPasswordUser}
        onClose={() => setResetPasswordUser(null)}
        user={resetPasswordUser}
        loading={resetPasswordMutation.isPending}
        onConfirm={(user) => resetPasswordMutation.mutate(user)}
      />

      {/* Generated password dialog */}
      {createdUserInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              User Created
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Share these credentials with{" "}
              <strong>{createdUserInfo.username}</strong>. They will be required
              to change their password on first login.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Username:</span>
                <span className="font-mono font-medium text-gray-900">
                  {createdUserInfo.username}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Password:</span>
                <span className="font-mono font-medium text-gray-900">
                  {createdUserInfo.generated_password}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCopyCreatedPassword}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {passwordCopied ? "Copied!" : "Copy Password"}
              </button>
              <button
                onClick={() => {
                  setPasswordCopied(false)
                  setCreatedUserInfo(null)
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Excel Password Required
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              This staff list is password protected. Enter the workbook password
              to continue the import.
            </p>
            <input
              type="password"
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Workbook password"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setPendingImport(null)
                  setImportPassword("")
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordProtectedImport}
                disabled={isImporting || !importPassword.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isImporting ? "Importing..." : "Unlock and Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {importProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Import Progress
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Processing {importProgress.processed} of {importProgress.total}{" "}
              rows.
            </p>

            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-blue-600 transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm mb-4">
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-gray-500">Imported</p>
                <p
                  className="font-semibold text-gray-900"
                  data-testid="import-progress-imported"
                >
                  {importProgress.imported}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-gray-500">Failed</p>
                <p
                  className="font-semibold text-gray-900"
                  data-testid="import-progress-failed"
                >
                  {importProgress.failed}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-gray-500">Progress</p>
                <p className="font-semibold text-gray-900">
                  {progressPercent}%
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500 mb-1">Current row</p>
              <p className="text-sm font-medium text-gray-900 break-all">
                {importProgress.currentLabel || "Preparing import..."}
              </p>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleCancelImport}
                disabled={importCancelRequested}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {importCancelRequested ? "Cancelling..." : "Cancel Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {importFailures && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Import Failures
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              {importFailures.length} row
              {importFailures.length !== 1 ? "s" : ""} failed to import.
            </p>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50">
              <ul className="divide-y divide-gray-200">
                {importFailures.map((failure, index) => (
                  <li
                    key={`${failure}-${index}`}
                    className="px-4 py-2 text-sm text-gray-700"
                  >
                    {failure}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setImportFailures(null)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
