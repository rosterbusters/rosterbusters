// Shift code types matching the database ShiftCode table
export type ShiftCode = 'D' | 'A' | 'N' | 'P' | 'DO' | 'OFF' | 'RD' | 'AL' | 'HOL' | 'MC' | 'URG' | 'N-12' | 'BCL' | 'CCL' | 'ML' | 'CL' | 'UPL' | 'PH' | 'EML';

export interface ShiftCodeInfo {
  code: ShiftCode;
  description: string;
  isWorking: boolean;
  defaultStart?: string;
  defaultEnd?: string;
  durationHours?: number;
}

// Mapping of shift codes to their display properties
export const SHIFT_CODE_MAP: Record<ShiftCode, ShiftCodeInfo> = {
  'D': { code: 'D', description: 'Day Shift', isWorking: true, defaultStart: '07:00', defaultEnd: '15:00', durationHours: 8 },
  'A': { code: 'A', description: 'AM Shift', isWorking: true, defaultStart: '07:00', defaultEnd: '13:00', durationHours: 6 },
  'N': { code: 'N', description: 'Night Shift', isWorking: true, defaultStart: '21:00', defaultEnd: '07:00', durationHours: 10 },
  'N-12': { code: 'N-12', description: 'Night 12h', isWorking: true, defaultStart: '19:00', defaultEnd: '07:00', durationHours: 12 },
  'P': { code: 'P', description: 'PM Shift', isWorking: true, defaultStart: '13:00', defaultEnd: '21:00', durationHours: 8 },
  'DO': { code: 'DO', description: 'Day Off', isWorking: false },
  'OFF': { code: 'OFF', description: 'Day Off', isWorking: false },
  'RD': { code: 'RD', description: 'Rest Day', isWorking: false },
  'AL': { code: 'AL', description: 'Annual Leave', isWorking: false },
  'HOL': { code: 'HOL', description: 'Public Holiday Leave', isWorking: false },
  'MC': { code: 'MC', description: 'Medical Certificate', isWorking: false },
  'URG': { code: 'URG', description: 'Urgent Leave', isWorking: false },
  'BCL': { code: 'BCL', description: 'Birthday Leave', isWorking: false },
  'CCL': { code: 'CCL', description: 'Childcare Leave', isWorking: false },
  'ML': { code: 'ML', description: 'Marriage Leave', isWorking: false },
  'CL': { code: 'CL', description: 'Compassionate Leave', isWorking: false },
  'UPL': { code: 'UPL', description: 'Unpaid Leave', isWorking: false },
  'PH': { code: 'PH', description: 'Public Holiday', isWorking: false },
  'EML': { code: 'EML', description: 'Extended Marriage Leave', isWorking: false },
};

// Theme color mapping for shift codes
export const SHIFT_COLOR_MAP: Record<string, string> = {
  'D': '#0891b2',    // cyan.600 - Day
  'A': '#06b6d4',    // cyan.500 - AM
  'N': '#164e63',    // cyan.900 - Night
  'N-12': '#164e63', // cyan.900 - Night 12h
  'P': '#0e7490',    // cyan.700 - PM
  'DO': '#a3a3a3',   // neutral.400 - Day Off
  'RD': '#737373',   // neutral.500 - Rest Day
  'AL': '#64748b',   // slate.500 - Annual Leave
  'MC': '#475569',   // slate.600 - Medical Certificate
  'CCL': '#334155',  // slate.700 - Childcare Leave
  'ML': '#52525b',   // zinc.600 - Marriage/Maternity Leave
  'EML': '#3f3f46',  // zinc.700 - Extended Marriage/Maternity Leave
  'Mar': '#27272a',  // zinc.800 - Marriage Leave
  'CL': '#374151',   // gray.700 - Compassionate Leave
  'BDL': '#1f2937',  // gray.800 - Birthday Leave
  'BCL': '#71717a',  // zinc.500 - Birthday Leave
  'FCL': '#6b7280',  // gray.500 - Family Care Leave
  'SPL': '#4b5563',  // gray.600 - Shared Parental Leave
  'HOL': '#78716c',  // stone.500 - Public Holiday Leave
  'FD': '#57534e',   // stone.600 - Family Day
  'SD': '#44403c',   // stone.700 - Sleeping Day
  'OFF': '#7c8087',  // cool gray - Off
  'REST': '#94a3b8', // slate.400 - Rest
  'URG': '#18181b',  // zinc.900 - Urgent Leave
  'UPL': '#0f172a',  // slate.900 - Unpaid Leave
  'PH': '#5e6673',   // cool gray - Public Holiday
};

export function getBaseShiftCode(shiftCode: string): string {
  const [baseCode] = shiftCode.split("-");
  return baseCode || shiftCode;
}

export function getShiftColor(shiftCode: string | null | undefined): string {
  if (!shiftCode) {
    return "#4b5563";
  }

  return (
    SHIFT_COLOR_MAP[shiftCode] ??
    SHIFT_COLOR_MAP[getBaseShiftCode(shiftCode)] ??
    "#4b5563"
  );
}

// Staff designation/role types
export type StaffDesignation = 
  | 'Senior Nursing Aide II'
  | 'Senior Staff Nurse I'
  | 'Staff Nurse II'
  | 'Registered Nurse'
  | 'Healthcare Assistant';

// Ward information
export interface Ward {
  wardId: number;
  wardName: string;
  wardType: string;
  campus: string;
  managerId?: number | null;
  am_total?: number | null;
  am_rn?: number | null;
  am_en_na_min?: number | null;
  am_en_na_max?: number | null;
  am_hca_min?: number | null;
  am_hca_max?: number | null;
  pm_total?: number | null;
  pm_rn?: number | null;
  pm_en_na_min?: number | null;
  pm_en_na_max?: number | null;
  pm_hca_min?: number | null;
  pm_hca_max?: number | null;
  nd_total?: number | null;
  nd_rn?: number | null;
  nd_en_na_min?: number | null;
  nd_en_na_max?: number | null;
  nd_hca_min?: number | null;
  nd_hca_max?: number | null;
  staffingJson?: string | null;
}

// Roster period information
export interface RosterPeriod {
  periodId: number;
  name: string;
  startDate: string;
  endDate: string;
  planningLockDate?: string;
  status: 'RequestOpen' | 'Pending' | 'Published' | 'RequestClosed' | 'Finalized';
}

export interface RosterPeriodWindow {
  currentPeriod: RosterPeriod | null;
  upcomingPeriod: RosterPeriod | null;
  requestOpenPeriod: RosterPeriod | null;
}

// ============================================
// Shift Request Overlay Types
// ============================================

export type ShiftRequestStatus = 'Pending' | 'Approved' | 'Rejected';

export type ShiftRequestCategory = 'Algorithm' | 'Nurse Manager' | 'Self Changed';

export interface ShiftRequestOverlay {
  status: ShiftRequestStatus;
  category: ShiftRequestCategory;
  reason: string;
}

// Shift assignment for a specific day
export interface ShiftAssignment {
  rosterId: number;
  nurseId: number;
  shiftDate: string;
  shiftCode: ShiftCode;
  status: 'Confirmed' | 'Pending' | 'Swapped' | 'Cancelled';
  startTime?: string;
  endTime?: string;
  comment?: string;
}

// Hours summary for a nurse
export interface HoursSummary {
  worked: number;
  contracted: number;
}

// Row data structure for the roster grid
export interface RosterRow {
  nurseId: number;
  name: string;
  designation: StaffDesignation | string;
  staffingRole?: StaffRole | null;
  hours: HoursSummary;
  // Dynamic shift properties for each day
  shifts: Record<string, ShiftAssignment | null>;
  // Alert flags
  hasOvertime: boolean;
  hasWarning: boolean;
}

// Grid column configuration for day columns
export interface DayColumn {
  field: string;
  title: string;
  date: Date;
  dayOfWeek: string;
}

// View mode for the roster
export type ViewMode = 'week' | 'twoWeeks';

// Roster state for the component
export interface RosterState {
  selectedWard: Ward | null;
  selectedPeriod: RosterPeriod | null;
  viewMode: ViewMode;
  currentStartDate: Date;
  isLoading: boolean;
}

// API response types
export interface WardRosterResponse {
  ward: Ward;
  period: RosterPeriod;
  roster_entries: Array<{
    roster_id: number;
    nurse_id: number;
    shift_date: string;
    shift_code: string;
    status: string;
    assignment_method?: string;
    comment?: string | null;
  }>;
}

export interface NurseInfo {
  nurseId: number;
  name: string;
  userId?: number | null;
  username?: string | null;
  mustChangePassword?: boolean;
  defaultPassword?: string | null;
  employeeId?: string | null;
  designation: string;
  staffing_role?: StaffRole | null;
  roster_rank?: "A" | "B" | "C" | null;
  email: string;
  contactNumber: string;
  wardId: number;
  employmentType: string;
  shiftPattern?: "AM_ONLY" | "PM_ONLY" | null;
  isActive: boolean;
}

export type ShiftPattern = "AM_ONLY" | "PM_ONLY" | null;

export interface NursePeriodConstraint {
  constraintid: number;
  nurseid: number;
  periodid: number;
  constrainttype: string;
  value: string;
  reason?: string | null;
}

export interface WardStatisticsResponse {
  ward_id: number;
  total_nurses: number;
  rn_count: number;
  staff_nurse_count: number;
  hca_count: number;
  nurses: NurseInfo[];
}

// ============================================
// Edit History Types
// ============================================

export type EditHistoryChangeType = 'shift_change' | 'comment';

export interface EditHistoryEntry {
  id: number;
  modifiedDate: string;        // ISO datetime string
  changeType: EditHistoryChangeType;
  // For shift changes
  previousShiftCode?: ShiftCode;
  newShiftCode?: ShiftCode;
  // For comments
  comment?: string;
  // Context
  shiftDate: string;           // The date of the shift that was modified
  nurseName: string;
  modifiedBy: string;
}

// ============================================
// Staffing Guidelines / Shift Summary Types
// ============================================

// Role categories for summary
export type StaffRole = 'RN' | 'EN' | 'NA' | 'HCA12' | 'HCA3';

// Shift types for summary (A = AM/Day, P = PM, N = Night)
export type SummaryShiftType = 'A' | 'P' | 'N';

// Staffing requirements per shift type per role
export interface ShiftRequirement {
  minimum: number;
  maximum?: number;
}

export interface DailyStaffingGuideline {
  RN:   { A: ShiftRequirement; P: ShiftRequirement; N: ShiftRequirement };
  EN:   { A: ShiftRequirement; P: ShiftRequirement; N: ShiftRequirement };
  NA:   { A: ShiftRequirement; P: ShiftRequirement; N: ShiftRequirement };
  HCA12: { A: ShiftRequirement; P: ShiftRequirement; N: ShiftRequirement };
  HCA3: { A: ShiftRequirement; P: ShiftRequirement; N: ShiftRequirement };
}




