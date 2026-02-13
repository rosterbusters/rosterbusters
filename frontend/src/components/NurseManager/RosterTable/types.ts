// Shift code types matching the database ShiftCode table
export type ShiftCode = 'D' | 'A' | 'N' | 'P' | 'DO' | 'AL' | 'MC' | 'URG' | 'N-12' | 'BCL' | 'CCL' | 'ML' | 'CL' | 'EML';

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
  'AL': { code: 'AL', description: 'Annual Leave', isWorking: false },
  'MC': { code: 'MC', description: 'Medical Certificate', isWorking: false },
  'URG': { code: 'URG', description: 'Urgent Leave', isWorking: false },
  'BCL': { code: 'BCL', description: 'Birthday Leave', isWorking: false },
  'CCL': { code: 'CCL', description: 'Childcare Leave', isWorking: false },
  'ML': { code: 'ML', description: 'Marriage Leave', isWorking: false },
  'CL': { code: 'CL', description: 'Compassionate Leave', isWorking: false },
  'EML': { code: 'EML', description: 'Extended Marriage Leave', isWorking: false },
};

// Theme color mapping for shift codes
export const SHIFT_COLOR_MAP: Record<ShiftCode, string> = {
  'D': '#0891b2',    // cyan.600 - Day
  'A': '#06b6d4',    // cyan.500 - AM
  'N': '#164e63',    // cyan.900 - Night
  'N-12': '#164e63', // cyan.900 - Night 12h
  'P': '#0e7490',    // cyan.700 - PM
  'DO': '#a3a3a3',   // neutral.400 - Day Off
  'AL': '#94a3b8',   // slate.400 - Annual Leave
  'MC': '#fbbf24',   // amber.400 - Medical Certificate
  'URG': '#f87171',  // red.400 - Urgent Leave
  'BCL': '#a78bfa',  // violet.400 - Birthday Leave
  'CCL': '#34d399',  // emerald.400 - Childcare Leave
  'ML': '#f472b6',   // pink.400 - Marriage Leave
  'CL': '#60a5fa',   // blue.400 - Compassionate Leave
  'EML': '#c084fc',  // purple.400 - Extended Marriage Leave
};

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
}

// Roster period information
export interface RosterPeriod {
  periodId: number;
  name: string;
  startDate: string;
  endDate: string;
  status: 'RequestOpen' | 'RequestClosed' | 'Finalized';
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
  }>;
}

export interface NurseInfo {
  nurseId: number;
  name: string;
  designation: string;
  email: string;
  contactNumber: string;
  wardId: number;
  employmentType: string;
  isActive: boolean;
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
export type StaffRole = 'RN' | 'EN' | 'HCA';

// Shift types for summary (A = AM/Day, P = PM, N = Night)
export type SummaryShiftType = 'A' | 'P' | 'N';

// Staffing requirements per shift type per role
export interface ShiftRequirement {
  minimum: number;
  maximum?: number;
}

export interface DailyStaffingGuideline {
  RN: { A: ShiftRequirement; P: ShiftRequirement; N: ShiftRequirement };
  EN: { A: ShiftRequirement; P: ShiftRequirement; N: ShiftRequirement };
  HCA: { A: ShiftRequirement; P: ShiftRequirement; N: ShiftRequirement };
}




