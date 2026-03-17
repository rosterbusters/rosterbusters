// Export all roster table components
export { RosterGrid } from "./RosterGrid";
export { RosterHeader } from "./RosterHeader";
export { ShiftBadge } from "./ShiftBadge";
export { ShiftEditPopover } from "./ShiftEditPopover";
export { ShiftCommentPopover } from "./ShiftCommentPopover";
export { ShiftSummaryTable } from "./ShiftSummaryTable";
export { EditHistoryDialog } from "./EditHistoryDialog";
export { ManpowerEditDialog } from "./ManpowerEditDialog";

// Export hooks
export {
  useWards,
  useRosterPeriods,
  useRosterPeriodWindow,
  useWardStatistics,
  useWardRoster,
  useBulkUpsertRoster,
  useUpdateRoster,
  usePublishRoster,
  useRosterPageData,
  useRosterExport,
  useGenerateAlgorithmRoster,
  useShiftCodes,
  useRosterChangelog,
  useCreateChangelog,
  useUpdateRosterComment,
  getShiftDurationHours,
  transformRosterData,
} from "./useRosterData";

// Export API response types
export type { AlgorithmRosterResponse, ChangelogEntry, ChangelogCreatePayload } from "./useRosterData";

// Export types
export * from "./types";

// Export staffing guidelines utilities
export {
  MOCK_STAFFING_GUIDELINES,
  mapDesignationToRole,
  mapShiftCodeToSummaryType,
} from "./staffingGuidelines";

