import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { useForm, type SubmitHandler } from "react-hook-form"
import { WardsService, ShiftRequestsService } from "@/client"
import type { Ward, ShiftCodePublic } from "@/client/types.gen"
import type { ApiError } from "@/client/core/ApiError"
import { showErrorToast, showSuccessToast } from "@/components/ui/toast"
import { formatShiftCodeLabel } from "@/utils"
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  MapPin,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react"

export const Route = createFileRoute("/admin/wards")({
  component: AdminWards,
})

/* ------------------------------------------------------------------ */
/*  Ward form dialog                                                  */
/* ------------------------------------------------------------------ */

type WardFormData = Omit<Ward, "wardid"> & { wardid?: number | null }

const EIGHT_HOUR_SHIFT_CODES: string[] = ["A", "P", "N", "DO"]
const TWELVE_HOUR_SHIFT_CODES: string[] = ["A-12", "N-12", "DO"]

function getAllowedShiftCodesByHourType(wardHourType?: string | null) {
  return wardHourType === "12_HOURS"
    ? [...TWELVE_HOUR_SHIFT_CODES]
    : [...EIGHT_HOUR_SHIFT_CODES]
}

function WardFormDialog({
  open,
  onClose,
  editWard,
}: {
  open: boolean
  onClose: () => void
  editWard?: Ward | null
}) {
  const queryClient = useQueryClient()
  const isEdit = !!editWard
  const [showStaffing, setShowStaffing] = useState(false)
  const [showShifts, setShowShifts] = useState(false)
  const [selectedShiftCodes, setSelectedShiftCodes] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<WardFormData>({
    mode: "onBlur",
    defaultValues: isEdit
      ? { ...editWard }
      : {
          wardname: "",
          wardtype: "",
          wardhourtype: "8_HOURS",
          location: "",
          isactive: true,
          am_total: null,
          am_rn: null,
          am_en_na_min: null,
          am_en_na_max: null,
          am_hca_min: null,
          am_hca_max: null,
          pm_total: null,
          pm_rn: null,
          pm_en_na_min: null,
          pm_en_na_max: null,
          pm_hca_min: null,
          pm_hca_max: null,
          nd_total: null,
          nd_rn: null,
          nd_en_na_min: null,
          nd_en_na_max: null,
          nd_hca_min: null,
          nd_hca_max: null,
        },
  })

  // Fetch all requestable shift codes
  const { data: allShiftCodes } = useQuery<ShiftCodePublic[]>({
    queryKey: ["shift-codes-all"],
    queryFn: () => ShiftRequestsService.getAllShiftCodes(),
    enabled: open,
  })

  // Fetch ward's assigned shift codes (only when editing)
  const { data: wardShiftCodes } = useQuery<ShiftCodePublic[]>({
    queryKey: ["ward-shift-codes", editWard?.wardid],
    queryFn: () =>
      editWard?.wardid
        ? ShiftRequestsService.getWardShiftCodesAdmin({ wardId: editWard.wardid })
        : Promise.resolve([] as ShiftCodePublic[]),
    enabled: open && !!editWard?.wardid,
  })

  const selectedWardHourType = watch("wardhourtype") ?? "8_HOURS"
  const allowedShiftCodes = useMemo(
    () => getAllowedShiftCodesByHourType(selectedWardHourType),
    [selectedWardHourType],
  )
  const shiftCodesForHourType = useMemo(
    () => {
      const order = new Map(allowedShiftCodes.map((code, index) => [code, index]))
      return (allShiftCodes ?? [])
        .filter((shift) => allowedShiftCodes.includes(shift.shiftcode))
        .sort((a, b) => (order.get(a.shiftcode) ?? 999) - (order.get(b.shiftcode) ?? 999))
    },
    [allShiftCodes, allowedShiftCodes],
  )

  useEffect(() => {
    if (!open) return
    if (isEdit && editWard) {
      reset({
        ...editWard,
        wardhourtype: editWard.wardhourtype ?? "8_HOURS",
      })
    } else {
      reset({
        wardname: "",
        wardtype: "",
        wardhourtype: "8_HOURS",
        location: "",
        isactive: true,
        am_total: null,
        am_rn: null,
        am_en_na_min: null,
        am_en_na_max: null,
        am_hca_min: null,
        am_hca_max: null,
        pm_total: null,
        pm_rn: null,
        pm_en_na_min: null,
        pm_en_na_max: null,
        pm_hca_min: null,
        pm_hca_max: null,
        nd_total: null,
        nd_rn: null,
        nd_en_na_min: null,
        nd_en_na_max: null,
        nd_hca_min: null,
        nd_hca_max: null,
      })
      setSelectedShiftCodes(getAllowedShiftCodesByHourType("8_HOURS"))
    }
  }, [open, isEdit, editWard, reset])

  useEffect(() => {
    if (!open || !isEdit || !wardShiftCodes) return
    const wardCodes = wardShiftCodes.map((shift) => shift.shiftcode)
    const filtered = wardCodes.filter((code) => allowedShiftCodes.includes(code))
    setSelectedShiftCodes(filtered.length > 0 ? filtered : [...allowedShiftCodes])
  }, [open, isEdit, wardShiftCodes, allowedShiftCodes])

  useEffect(() => {
    if (!open) return
    setSelectedShiftCodes((prev) => {
      const filtered = prev.filter((code) => allowedShiftCodes.includes(code))
      return filtered.length > 0 ? filtered : [...allowedShiftCodes]
    })
  }, [open, allowedShiftCodes])

  const createMutation = useMutation({
    mutationFn: (data: Ward) =>
      WardsService.createWard({ requestBody: data }),
    onError: (err: ApiError) => {
      console.error(err)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Ward>) =>
      WardsService.updateWard({
        wardId: editWard!.wardid!,
        requestBody: data,
      }),
    onError: (err: ApiError) => {
      console.error(err)
    },
  })

  const syncWardShiftCodes = async (wardId: number, currentCodes: string[]) => {
    const toAdd = selectedShiftCodes.filter((code) => !currentCodes.includes(code))
    const toRemove = currentCodes.filter((code) => !selectedShiftCodes.includes(code))

    await Promise.all([
      ...toAdd.map((shiftCode) => ShiftRequestsService.addShiftToWard({ wardId, shiftCode })),
      ...toRemove.map((shiftCode) => ShiftRequestsService.removeShiftFromWard({ wardId, shiftCode })),
    ])
  }

  const onSubmit: SubmitHandler<WardFormData> = async (data) => {
    // Convert empty string numbers to null
    const cleaned = { ...data } as any
    const numericFields = [
      "am_total",
      "am_rn",
      "am_en_na_min",
      "am_en_na_max",
      "am_hca_min",
      "am_hca_max",
      "pm_total",
      "pm_rn",
      "pm_en_na_min",
      "pm_en_na_max",
      "pm_hca_min",
      "pm_hca_max",
      "nd_total",
      "nd_rn",
      "nd_en_na_min",
      "nd_en_na_max",
      "nd_hca_min",
      "nd_hca_max",
    ]
    for (const f of numericFields) {
      if (cleaned[f] === "" || cleaned[f] === undefined) cleaned[f] = null
      else cleaned[f] = Number(cleaned[f])
    }

    try {
      let wardId = editWard?.wardid ?? null
      if (isEdit) {
        await updateMutation.mutateAsync(cleaned)
      } else {
        const createdWard = await createMutation.mutateAsync(cleaned)
        wardId = createdWard.wardid ?? null
      }

      if (!wardId) {
        throw new Error("Unable to resolve ward id for shift option update")
      }

      const existingCodes = isEdit
        ? (wardShiftCodes ?? []).map((shift) => shift.shiftcode)
        : []
      await syncWardShiftCodes(wardId, existingCodes)

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wards"] }),
        queryClient.invalidateQueries({ queryKey: ["ward-shift-codes", wardId] }),
      ])

      showSuccessToast(isEdit ? "Ward updated successfully." : "Ward created successfully.")
      reset()
      onClose()
    } catch (error: any) {
      const detail = error?.body?.detail
      showErrorToast(detail || "Failed to save ward")
    }
  }

  const numInput = (name: keyof WardFormData, label: string) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
      </label>
      <input
        {...register(name as any, { valueAsNumber: false })}
        type="number"
        min={0}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />
    </div>
  )

  const wardId = editWard?.wardid

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold">
            {isEdit ? "Edit Ward" : "Create Ward"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-6 space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ward Name <span className="text-red-500">*</span>
                </label>
                <input
                  {...register("wardname", {
                    required: "Ward name is required",
                  })}
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. Ward 5A"
                />
                {errors.wardname && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.wardname.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ward Type
                </label>
                <input
                  {...register("wardtype")}
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. Medical, Surgical"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  {...register("location")}
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. Building A, Floor 3"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm pb-2">
                  <input
                    type="checkbox"
                    {...register("isactive")}
                    className="rounded border-gray-300"
                  />
                  Active
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ward Hour Type <span className="text-red-500">*</span>
                </label>
                <select
                  {...register("wardhourtype", { required: "Ward hour type is required" })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="8_HOURS">8-hours Ward</option>
                  <option value="12_HOURS">12-hours Ward</option>
                </select>
                {errors.wardhourtype && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.wardhourtype.message as string}
                  </p>
                )}
              </div>
            </div>

            {/* Shift Request Options - Collapsible */}
            {
              <div className="border rounded-lg bg-blue-50 border-blue-200">
                <button
                  type="button"
                  onClick={() => setShowShifts(!showShifts)}
                  className="w-full flex items-center justify-between p-4 text-sm font-medium text-blue-900 hover:bg-blue-100"
                >
                  <span className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Shift Request Options (Nurse)
                  </span>
                  {showShifts ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                {showShifts && (
                  <div className="p-4 pt-0 space-y-3 bg-white border-t border-blue-200">
                    <p className="text-xs text-gray-500">
                      Select which shifts nurses can request for this ward:
                    </p>
                    <div className="space-y-2">
                      {shiftCodesForHourType.length > 0 ? (
                        shiftCodesForHourType.map((shift) => {
                          const isAssigned = selectedShiftCodes.includes(shift.shiftcode)
                          return (
                            <label
                              key={shift.shiftcode}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isAssigned}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedShiftCodes((prev) =>
                                      prev.includes(shift.shiftcode)
                                        ? prev
                                        : [...prev, shift.shiftcode],
                                    )
                                  } else {
                                    setSelectedShiftCodes((prev) =>
                                      prev.filter((code) => code !== shift.shiftcode),
                                    )
                                  }
                                }}
                                className="rounded border-gray-300"
                              />
                              <span className="text-sm text-gray-700">
                                {formatShiftCodeLabel(shift.shiftcode)} - {shift.description}
                              </span>
                            </label>
                          )
                        })
                      ) : (
                        <p className="text-xs text-gray-400">No shift options available for this ward hour type.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            }

            {/* Staffing Requirements - Collapsible */}
            <div className="border rounded-lg">
              <button
                type="button"
                onClick={() => setShowStaffing(!showStaffing)}
                className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <span>Staffing Requirements</span>
                {showStaffing ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showStaffing && (
                <div className="p-4 pt-0 space-y-4">
                  {/* AM Shift */}
                  <div>
                    <h4 className="text-sm font-medium text-blue-600 mb-2">
                      AM Shift
                    </h4>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {numInput("am_total", "Total")}
                      {numInput("am_rn", "RN")}
                      {numInput("am_en_na_min", "EN/NA Min")}
                      {numInput("am_en_na_max", "EN/NA Max")}
                      {numInput("am_hca_min", "HCA Min")}
                      {numInput("am_hca_max", "HCA Max")}
                    </div>
                  </div>

                  {/* PM Shift */}
                  <div>
                    <h4 className="text-sm font-medium text-purple-600 mb-2">
                      PM Shift
                    </h4>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {numInput("pm_total", "Total")}
                      {numInput("pm_rn", "RN")}
                      {numInput("pm_en_na_min", "EN/NA Min")}
                      {numInput("pm_en_na_max", "EN/NA Max")}
                      {numInput("pm_hca_min", "HCA Min")}
                      {numInput("pm_hca_max", "HCA Max")}
                    </div>
                  </div>

                  {/* ND (Night) Shift */}
                  <div>
                    <h4 className="text-sm font-medium text-indigo-600 mb-2">
                      Night Shift
                    </h4>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {numInput("nd_total", "Total")}
                      {numInput("nd_rn", "RN")}
                      {numInput("nd_en_na_min", "EN/NA Min")}
                      {numInput("nd_en_na_max", "EN/NA Max")}
                      {numInput("nd_hca_min", "HCA Min")}
                      {numInput("nd_hca_max", "HCA Max")}
                    </div>
                  </div>
                </div>
              )}
            </div>
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
              disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {isSubmitting || createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : isEdit
                  ? "Update Ward"
                  : "Create Ward"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Delete ward confirmation                                          */
/* ------------------------------------------------------------------ */

function DeleteWardDialog({
  open,
  onClose,
  ward,
}: {
  open: boolean
  onClose: () => void
  ward: Ward | null
}) {
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState(false)

  const mutation = useMutation({
    mutationFn: (id: number) => WardsService.deleteWard({ wardId: id }),
    onSuccess: () => {
      showSuccessToast("Ward deleted successfully.")
      onClose()
    },
    onError: () => showErrorToast("Failed to delete ward."),
    onSettled: () => {
      setDeleting(false)
      queryClient.invalidateQueries({ queryKey: ["wards"] })
    },
  })

  if (!open || !ward) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Delete Ward
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Are you sure you want to delete{" "}
          <strong>{ward.wardname}</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setDeleting(true)
              mutation.mutate(ward.wardid!)
            }}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

function AdminWards() {
  const [search, setSearch] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editWard, setEditWard] = useState<Ward | null>(null)
  const [deleteWard, setDeleteWard] = useState<Ward | null>(null)

  const { data: wards, isLoading } = useQuery({
    queryKey: ["wards"],
    queryFn: () => WardsService.getWards(),
  })

  const wardList = wards ?? []
  const filtered = search
    ? wardList.filter(
        (w) =>
          w.wardname.toLowerCase().includes(search.toLowerCase()) ||
          (w.wardtype ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (w.location ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : wardList

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Wards Management
            </h1>
            <p className="text-sm text-gray-500">
              {wardList.length} total wards
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setEditWard(null)
            setFormOpen(true)
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Ward
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name, type, or location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* Ward cards */}
      {isLoading ? (
        <div className="p-12 text-center text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          No wards found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ward) => (
            <div
              key={ward.wardid}
              className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {ward.wardname}
                    </h3>
                    {ward.wardtype && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full mt-1 inline-block">
                        {ward.wardtype}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      ward.isactive !== false
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {ward.isactive !== false ? "Active" : "Inactive"}
                  </span>
                </div>

                {ward.location && (
                  <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
                    <MapPin className="w-3.5 h-3.5" />
                    {ward.location}
                  </div>
                )}

                {/* Staffing summary */}
                {(ward.am_total || ward.pm_total || ward.nd_total) && (
                  <div className="flex gap-3 text-xs text-gray-500 mb-3">
                    {ward.am_total != null && (
                      <span className="bg-gray-100 px-2 py-1 rounded">
                        AM: {ward.am_total}
                      </span>
                    )}
                    {ward.pm_total != null && (
                      <span className="bg-gray-100 px-2 py-1 rounded">
                        PM: {ward.pm_total}
                      </span>
                    )}
                    {ward.nd_total != null && (
                      <span className="bg-gray-100 px-2 py-1 rounded">
                        ND: {ward.nd_total}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-1 pt-2 border-t">
                  <button
                    onClick={() => {
                      setEditWard(ward)
                      setFormOpen(true)
                    }}
                    className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="Edit ward"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteWard(ward)}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete ward"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <WardFormDialog
        key={editWard?.wardid ?? "new"}
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditWard(null)
        }}
        editWard={editWard}
      />
      <DeleteWardDialog
        open={!!deleteWard}
        onClose={() => setDeleteWard(null)}
        ward={deleteWard}
      />
    </div>
  )
}
