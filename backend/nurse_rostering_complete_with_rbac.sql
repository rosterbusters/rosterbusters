-- ============================================================================
-- NURSE ROSTERING SYSTEM - COMPLETE POSTGRESQL SCHEMA WITH RBAC
-- ============================================================================
-- Total Tables: 32 (25 core + 7 RBAC)
-- Database: PostgreSQL 12+
-- Features: Auto-scheduling, Smart notifications, Fairness tracking, 
--           Replacement management, External nurse support, RBAC System
-- ============================================================================
-- Version: 2.0
-- Last Updated: 2025-11-19
-- ============================================================================

-- ============================================================================
-- DROP EXISTING TABLES (in reverse dependency order)
-- ============================================================================

-- RBAC Tables
DROP TABLE IF EXISTS AuditAuthLog CASCADE;
DROP TABLE IF EXISTS SessionToken CASCADE;
DROP TABLE IF EXISTS UserRole CASCADE;
DROP TABLE IF EXISTS RolePermission CASCADE;
DROP TABLE IF EXISTS Permission CASCADE;
DROP TABLE IF EXISTS Role CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;

-- Core Tables
DROP TABLE IF EXISTS AuditLog CASCADE;
DROP TABLE IF EXISTS SystemConfiguration CASCADE;
DROP TABLE IF EXISTS PublicHoliday CASCADE;
DROP TABLE IF EXISTS LeaveBalance CASCADE;
DROP TABLE IF EXISTS RosterTemplateDetail CASCADE;
DROP TABLE IF EXISTS RosterTemplate CASCADE;
DROP TABLE IF EXISTS NurseAvailability CASCADE;
DROP TABLE IF EXISTS SchedulingConstraintViolation CASCADE;
DROP TABLE IF EXISTS AutoSchedulingRule CASCADE;
DROP TABLE IF EXISTS ReplacementRequest CASCADE;
DROP TABLE IF EXISTS ShiftSwap CASCADE;
DROP TABLE IF EXISTS FairnessMetrics CASCADE;
DROP TABLE IF EXISTS NotificationPreference CASCADE;
DROP TABLE IF EXISTS NotificationQueue CASCADE;
DROP TABLE IF EXISTS RosterChangeLog CASCADE;
DROP TABLE IF EXISTS Roster CASCADE;
DROP TABLE IF EXISTS ShiftCode CASCADE;
DROP TABLE IF EXISTS LeaveRequest CASCADE;
DROP TABLE IF EXISTS ShiftRequest CASCADE;
DROP TABLE IF EXISTS RosterPeriod CASCADE;
DROP TABLE IF EXISTS NurseReplacementPool CASCADE;
DROP TABLE IF EXISTS ExternalNurse CASCADE;
DROP TABLE IF EXISTS Nurse CASCADE;
DROP TABLE IF EXISTS Ward CASCADE;
DROP TABLE IF EXISTS NurseManager CASCADE;

-- ============================================================================
-- CORE TABLES (25 TABLES)
-- ============================================================================

-- ============================================================================
-- TABLE 1: NurseManager
-- ============================================================================
CREATE TABLE NurseManager (
  ManagerID SERIAL PRIMARY KEY,
  Name VARCHAR(100) NOT NULL,
  ContactNumber VARCHAR(20),
  Department VARCHAR(100),
  Email VARCHAR(100),
  WhatsAppNumber VARCHAR(20),
  IsActive BOOLEAN DEFAULT TRUE,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_nursemanager_active ON NurseManager(IsActive);

-- ============================================================================
-- TABLE 2: Ward
-- ============================================================================
CREATE TABLE Ward (
  WardID SERIAL PRIMARY KEY,
  WardName VARCHAR(100) NOT NULL,
  WardType VARCHAR(50), -- ICU / General / Pediatric
  Location VARCHAR(100), -- Floor / block
  ManagerID INTEGER,
  
  -- Morning shift requirements
  Morning_RN_Required INTEGER DEFAULT 0,
  Morning_StaffNurse_Required INTEGER DEFAULT 0,
  Morning_HCA_Required INTEGER DEFAULT 0,
  
  -- Night shift requirements
  Night_RN_Required INTEGER DEFAULT 0,
  Night_StaffNurse_Required INTEGER DEFAULT 0,
  Night_HCA_Required INTEGER DEFAULT 0,
  
  -- Auto-scheduling settings
  AllowAutoScheduling BOOLEAN DEFAULT TRUE,
  RequiresMinimumSSN BOOLEAN DEFAULT TRUE,
  MinimumSSNPerShift INTEGER DEFAULT 1,
  
  -- Replacement settings
  AllowCrossWardReplacement BOOLEAN DEFAULT TRUE,
  AllowExternalReplacement BOOLEAN DEFAULT TRUE,
  
  IsActive BOOLEAN DEFAULT TRUE,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Staffing requirements - AM shift
  am_total INTEGER,
  am_rn INTEGER,
  am_en_na_min INTEGER,
  am_en_na_max INTEGER,
  am_hca_min INTEGER,
  am_hca_max INTEGER,

  -- Staffing requirements - PM shift
  pm_total INTEGER,
  pm_rn INTEGER,
  pm_en_na_min INTEGER,
  pm_en_na_max INTEGER,
  pm_hca_min INTEGER,
  pm_hca_max INTEGER,

  -- Staffing requirements - ND (Night) shift
  nd_total INTEGER,
  nd_rn INTEGER,
  nd_en_na_min INTEGER,
  nd_en_na_max INTEGER,
  nd_hca_min INTEGER,
  nd_hca_max INTEGER,

  CONSTRAINT fk_ward_manager FOREIGN KEY (ManagerID)
    REFERENCES NurseManager(ManagerID) ON DELETE SET NULL,

  CONSTRAINT chk_ward_staffing_positive CHECK (
    Morning_RN_Required >= 0 AND Morning_StaffNurse_Required >= 0 AND
    Morning_HCA_Required >= 0 AND Night_RN_Required >= 0 AND
    Night_StaffNurse_Required >= 0 AND Night_HCA_Required >= 0
  )
);

CREATE INDEX idx_ward_manager ON Ward(ManagerID);
CREATE INDEX idx_ward_active ON Ward(IsActive);

-- ============================================================================
-- TABLE 3: Nurse
-- ============================================================================
CREATE TABLE Nurse (
  NurseID SERIAL PRIMARY KEY,
  Name VARCHAR(100) NOT NULL,
  ContactNumber VARCHAR(20),
  Email VARCHAR(100),
  WhatsAppNumber VARCHAR(20),
  Designation VARCHAR(50) NOT NULL, -- RN / StaffNurse / HCA
  WardID INTEGER, -- Primary/home ward
  ManagerID INTEGER,
  Probation BOOLEAN DEFAULT FALSE,
  EmploymentType VARCHAR(20), -- Full-time / Part-time / Contract
  
  -- Communication preferences
  PreferredContactMethod VARCHAR(20) DEFAULT 'WhatsApp', -- WhatsApp / Email / Both
  
  -- Work constraints
  MaxWeeklyHours DECIMAL(5,2) DEFAULT 40.00,
  MaxConsecutiveDays INTEGER DEFAULT 5,
  
  IsActive BOOLEAN DEFAULT TRUE,
  HireDate DATE,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_nurse_ward FOREIGN KEY (WardID) 
    REFERENCES Ward(WardID) ON DELETE SET NULL,
  CONSTRAINT fk_nurse_manager FOREIGN KEY (ManagerID) 
    REFERENCES NurseManager(ManagerID) ON DELETE SET NULL
);

CREATE INDEX idx_nurse_ward ON Nurse(WardID);
CREATE INDEX idx_nurse_manager ON Nurse(ManagerID);
CREATE INDEX idx_nurse_designation ON Nurse(Designation);
CREATE INDEX idx_nurse_active_ward ON Nurse(IsActive, WardID);

-- ============================================================================
-- TABLE 4: ExternalNurse
-- ============================================================================
CREATE TABLE ExternalNurse (
  ExternalNurseID SERIAL PRIMARY KEY,
  Name VARCHAR(100) NOT NULL,
  ContactNumber VARCHAR(20),
  Email VARCHAR(100),
  WhatsAppNumber VARCHAR(20),
  Designation VARCHAR(50) NOT NULL, -- RN / StaffNurse / HCA
  Agency VARCHAR(100), -- Agency name if applicable
  IsActive BOOLEAN DEFAULT TRUE,
  HourlyRate DECIMAL(8,2), -- For cost tracking
  Notes TEXT,
  
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_externalnurse_designation_active ON ExternalNurse(Designation, IsActive);

-- ============================================================================
-- TABLE 5: NurseReplacementPool
-- ============================================================================
CREATE TABLE NurseReplacementPool (
  PoolID SERIAL PRIMARY KEY,
  WardID INTEGER NOT NULL,
  NurseID INTEGER NOT NULL,
  Designation VARCHAR(50) NOT NULL,
  IsAvailableForReplacement BOOLEAN DEFAULT TRUE,
  PreferredShiftTypes VARCHAR(100), -- JSON or CSV: "Morning,Night"
  MaxReplacementShiftsPerMonth INTEGER DEFAULT 5,
  CurrentMonthReplacements INTEGER DEFAULT 0,
  
  LastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_pool_ward FOREIGN KEY (WardID) 
    REFERENCES Ward(WardID) ON DELETE CASCADE,
  CONSTRAINT fk_pool_nurse FOREIGN KEY (NurseID) 
    REFERENCES Nurse(NurseID) ON DELETE CASCADE
);

CREATE INDEX idx_pool_ward_available ON NurseReplacementPool(WardID, IsAvailableForReplacement);
CREATE INDEX idx_pool_designation ON NurseReplacementPool(Designation);

-- ============================================================================
-- TABLE 6: RosterPeriod
-- ============================================================================
CREATE TABLE RosterPeriod (
  PeriodID SERIAL PRIMARY KEY,
  Name VARCHAR(100) NOT NULL, -- e.g. "Dec 1-14 2025"
  StartDate DATE NOT NULL,
  EndDate DATE NOT NULL,
  RequestOpenDate DATE NOT NULL,
  RequestCloseDate DATE NOT NULL,
  Status VARCHAR(20) DEFAULT 'RequestOpen', -- RequestOpen / RequestClosed / Finalized
  
  -- Algorithm tracking
  AlgorithmStatus VARCHAR(20) DEFAULT 'NotStarted', -- NotStarted / Running / Completed / Failed
  AlgorithmStartedAt TIMESTAMP,
  AlgorithmCompletedAt TIMESTAMP,
  AlgorithmErrorLog TEXT,
  GeneratedBy VARCHAR(20) DEFAULT 'Algorithm', -- Algorithm / Manual
  
  -- Finalization
  AutoScheduledAt TIMESTAMP,
  FinalizedBy INTEGER,
  FinalizedAt TIMESTAMP,
  PublishedAt TIMESTAMP,
  NotificationsSent BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT fk_period_finalizer FOREIGN KEY (FinalizedBy) 
    REFERENCES NurseManager(ManagerID) ON DELETE SET NULL,
  
  CONSTRAINT chk_period_dates CHECK (
    StartDate < EndDate AND 
    RequestOpenDate < RequestCloseDate AND
    RequestCloseDate <= StartDate
  )
);

CREATE INDEX idx_period_status ON RosterPeriod(Status);
CREATE INDEX idx_period_dates ON RosterPeriod(StartDate, EndDate);
CREATE INDEX idx_period_algo_status ON RosterPeriod(AlgorithmStatus);

-- ============================================================================
-- TABLE 7: ShiftCode
-- ============================================================================
CREATE TABLE ShiftCode (
  ShiftCode VARCHAR(10) PRIMARY KEY, -- D, N-12, DO, AL, MC, URG
  Description VARCHAR(100) NOT NULL, -- Day shift, Night 12h, Day Off, Annual Leave
  IsWorking BOOLEAN DEFAULT TRUE, -- TRUE = working shift, FALSE = off/leave
  DefaultStart TIME, -- 07:00
  DefaultEnd TIME, -- 15:00
  ShiftDurationHours DECIMAL(4,2) -- Calculated or manual
);

CREATE INDEX idx_shiftcode_isworking ON ShiftCode(IsWorking);

-- ============================================================================
-- TABLE 8: ShiftRequest
-- ============================================================================
CREATE TABLE ShiftRequest (
  RequestID SERIAL PRIMARY KEY,
  NurseID INTEGER NOT NULL,
  PeriodID INTEGER NOT NULL,
  PreferredDate DATE NOT NULL,
  PreferredShiftType VARCHAR(10) NOT NULL, -- References ShiftCode
  RequestNumber INTEGER NOT NULL DEFAULT 1, -- 1, 2, or 3
  Reason TEXT,
  Priority INTEGER DEFAULT 1, -- 1-5, higher = more important to nurse
  Timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Approval workflow
  Status VARCHAR(20) DEFAULT 'Pending', -- Pending / Approved / Rejected / Cancelled
  ReviewedBy INTEGER,
  ReviewedAt TIMESTAMP,
  RejectionReason TEXT,
  NotificationSent BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT fk_shiftreq_nurse FOREIGN KEY (NurseID) 
    REFERENCES Nurse(NurseID) ON DELETE CASCADE,
  CONSTRAINT fk_shiftreq_period FOREIGN KEY (PeriodID) 
    REFERENCES RosterPeriod(PeriodID) ON DELETE CASCADE,
  CONSTRAINT fk_shiftreq_shiftcode FOREIGN KEY (PreferredShiftType) 
    REFERENCES ShiftCode(ShiftCode),
  CONSTRAINT fk_shiftreq_reviewer FOREIGN KEY (ReviewedBy) 
    REFERENCES NurseManager(ManagerID) ON DELETE SET NULL,
  
  CONSTRAINT chk_shiftreq_request_number CHECK (RequestNumber BETWEEN 1 AND 3)
);

CREATE UNIQUE INDEX idx_shiftreq_nurse_period_num 
  ON ShiftRequest(NurseID, PeriodID, RequestNumber);

CREATE INDEX idx_shiftreq_nurse_period ON ShiftRequest(NurseID, PeriodID);
CREATE INDEX idx_shiftreq_status ON ShiftRequest(Status, PeriodID);
CREATE INDEX idx_shiftreq_date ON ShiftRequest(PreferredDate);

-- ============================================================================
-- TABLE 9: LeaveRequest
-- ============================================================================
CREATE TABLE LeaveRequest (
  LeaveID SERIAL PRIMARY KEY,
  NurseID INTEGER NOT NULL,
  StartDate DATE NOT NULL,
  EndDate DATE NOT NULL,
  LeaveType VARCHAR(10) NOT NULL, -- AL / MC / URG / UPL / CL
  LeaveCategory VARCHAR(20) DEFAULT 'PreApproved', -- PreApproved / Urgent / MedicalCertificate
  SubmittedDuringPeriod VARCHAR(20) DEFAULT 'BeforeRoster', -- BeforeRoster / AfterFinalization
  RequiresReplacement BOOLEAN DEFAULT FALSE, -- TRUE for urgent/MC after finalization
  Reason TEXT,
  RequestedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Approval workflow
  Status VARCHAR(20) DEFAULT 'Pending', -- Pending / Approved / Rejected / Cancelled
  ApprovedBy INTEGER,
  ApprovedAt TIMESTAMP,
  RejectionReason TEXT,
  NotificationSent BOOLEAN DEFAULT FALSE,
  ImpactsRoster BOOLEAN DEFAULT FALSE, -- TRUE if overlaps finalized roster
  AttachmentURL VARCHAR(500), -- For MC certificates
  
  CONSTRAINT fk_leavereq_nurse FOREIGN KEY (NurseID) 
    REFERENCES Nurse(NurseID) ON DELETE CASCADE,
  CONSTRAINT fk_leavereq_approver FOREIGN KEY (ApprovedBy) 
    REFERENCES NurseManager(ManagerID) ON DELETE SET NULL,
  
  CONSTRAINT chk_leavereq_dates CHECK (StartDate <= EndDate),
  CONSTRAINT chk_leavereq_type CHECK (LeaveType IN ('AL', 'MC', 'URG', 'UPL', 'CL'))
);

CREATE INDEX idx_leavereq_nurse ON LeaveRequest(NurseID);
CREATE INDEX idx_leavereq_status ON LeaveRequest(Status, NurseID);
CREATE INDEX idx_leavereq_date_range ON LeaveRequest(StartDate, EndDate);
CREATE INDEX idx_leavereq_category_status ON LeaveRequest(LeaveCategory, Status);

-- ============================================================================
-- TABLE 10: Roster
-- ============================================================================
CREATE TABLE Roster (
  RosterID SERIAL PRIMARY KEY,
  NurseID INTEGER, -- NULL if external nurse
  ExternalNurseID INTEGER, -- NULL if internal nurse
  WardID INTEGER NOT NULL, -- Actual ward for this shift
  PeriodID INTEGER NOT NULL,
  ShiftDate DATE NOT NULL,
  ShiftCode VARCHAR(10) NOT NULL, -- D / N-12 / DO / AL / MC
  StartTime TIME,
  EndTime TIME,
  Status VARCHAR(20) DEFAULT 'Confirmed', -- Confirmed / Swapped / Cancelled / Training / Pending
  
  -- Assignment tracking
  AssignedBy INTEGER, -- ManagerID or NULL for auto-scheduled
  AssignmentMethod VARCHAR(20) DEFAULT 'Manual', -- Auto / Manual / Template / Swap
  
  -- Replacement tracking
  IsReplacement BOOLEAN DEFAULT FALSE,
  ReplacedNurseID INTEGER, -- Original nurse who was replaced
  ReplacementReason VARCHAR(20), -- UrgentLeave / MC / Emergency
  IsExternalNurse BOOLEAN DEFAULT FALSE, -- TRUE if using external nurse
  ReplacementNotes TEXT,
  
  -- Overtime & special conditions
  IsOvertime BOOLEAN DEFAULT FALSE,
  OvertimeHours DECIMAL(4,2) DEFAULT 0.00,
  IsPublicHoliday BOOLEAN DEFAULT FALSE,
  
  -- Audit fields
  LastModifiedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  LastModifiedBy INTEGER,
  Version INTEGER DEFAULT 1, -- For optimistic locking in drag-drop
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_roster_nurse FOREIGN KEY (NurseID) 
    REFERENCES Nurse(NurseID) ON DELETE SET NULL,
  CONSTRAINT fk_roster_external FOREIGN KEY (ExternalNurseID) 
    REFERENCES ExternalNurse(ExternalNurseID) ON DELETE SET NULL,
  CONSTRAINT fk_roster_ward FOREIGN KEY (WardID) 
    REFERENCES Ward(WardID) ON DELETE CASCADE,
  CONSTRAINT fk_roster_period FOREIGN KEY (PeriodID) 
    REFERENCES RosterPeriod(PeriodID) ON DELETE CASCADE,
  CONSTRAINT fk_roster_shiftcode FOREIGN KEY (ShiftCode) 
    REFERENCES ShiftCode(ShiftCode),
  CONSTRAINT fk_roster_assigned_by FOREIGN KEY (AssignedBy) 
    REFERENCES NurseManager(ManagerID) ON DELETE SET NULL,
  CONSTRAINT fk_roster_modified_by FOREIGN KEY (LastModifiedBy) 
    REFERENCES NurseManager(ManagerID) ON DELETE SET NULL,
  CONSTRAINT fk_roster_replaced_nurse FOREIGN KEY (ReplacedNurseID) 
    REFERENCES Nurse(NurseID) ON DELETE SET NULL,
  
  -- Either internal or external nurse must be assigned
  CONSTRAINT chk_roster_nurse_assigned CHECK (
    (NurseID IS NOT NULL AND ExternalNurseID IS NULL) OR
    (NurseID IS NULL AND ExternalNurseID IS NOT NULL)
  ),
  
  CONSTRAINT chk_roster_status CHECK (
    Status IN ('Confirmed', 'Swapped', 'Cancelled', 'Training', 'Pending')
  )
);

-- Prevent double-booking for internal nurses
CREATE UNIQUE INDEX idx_roster_nurse_date_unique ON Roster(NurseID, ShiftDate) 
  WHERE NurseID IS NOT NULL;

CREATE INDEX idx_roster_ward_date ON Roster(WardID, ShiftDate);
CREATE INDEX idx_roster_period ON Roster(PeriodID);
CREATE INDEX idx_roster_status ON Roster(Status);
CREATE INDEX idx_roster_replacement ON Roster(IsReplacement, ReplacedNurseID);
CREATE INDEX idx_roster_external ON Roster(ExternalNurseID) WHERE ExternalNurseID IS NOT NULL;

-- ============================================================================
-- TABLE 11: RosterChangeLog
-- ============================================================================
CREATE TABLE RosterChangeLog (
  ChangeID SERIAL PRIMARY KEY,
  RosterID INTEGER,
  ChangedByManagerID INTEGER,
  ChangedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ChangeType VARCHAR(20) NOT NULL, -- Override / Swap / Cancel / Create / Delete / Replacement
  
  -- Before values
  OldNurseID INTEGER,
  OldShiftCode VARCHAR(10),
  OldStartTime TIME,
  OldEndTime TIME,
  OldStatus VARCHAR(20),
  
  -- After values
  NewNurseID INTEGER,
  NewShiftCode VARCHAR(10),
  NewStartTime TIME,
  NewEndTime TIME,
  NewStatus VARCHAR(20),
  
  Reason TEXT,
  
  -- Additional tracking
  ChangeSource VARCHAR(20) DEFAULT 'Manual', -- Manual / AutoSchedule / Swap / API
  NotificationTriggered BOOLEAN DEFAULT FALSE,
  IsReplacementChange BOOLEAN DEFAULT FALSE,
  ReplacementReason VARCHAR(20),
  ReplacedNurseID INTEGER,
  ReplacementNurseID INTEGER,
  IsExternalReplacement BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT fk_changelog_roster FOREIGN KEY (RosterID) 
    REFERENCES Roster(RosterID) ON DELETE CASCADE,
  CONSTRAINT fk_changelog_manager FOREIGN KEY (ChangedByManagerID) 
    REFERENCES NurseManager(ManagerID) ON DELETE SET NULL
);

CREATE INDEX idx_changelog_roster ON RosterChangeLog(RosterID);
CREATE INDEX idx_changelog_timestamp ON RosterChangeLog(ChangedAt);
CREATE INDEX idx_changelog_type ON RosterChangeLog(ChangeType);

-- ============================================================================
-- TABLE 12: ReplacementRequest
-- ============================================================================
CREATE TABLE ReplacementRequest (
  ReplacementID SERIAL PRIMARY KEY,
  OriginalRosterID INTEGER NOT NULL, -- The shift that needs replacement
  OriginalNurseID INTEGER NOT NULL, -- Nurse who went on urgent leave
  
  LeaveRequestID INTEGER, -- Link to the urgent leave/MC
  ReplacementReason VARCHAR(20) NOT NULL, -- UrgentLeave / MC / Emergency / NoShow
  
  RequestedByManagerID INTEGER NOT NULL,
  RequestedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Replacement nurse (internal or external)
  ReplacementNurseID INTEGER, -- NULL if external
  ExternalNurseID INTEGER, -- NULL if internal
  
  NewRosterID INTEGER, -- The created roster entry for replacement
  
  Status VARCHAR(20) DEFAULT 'Pending', -- Pending / Confirmed / Cancelled
  ConfirmedAt TIMESTAMP,
  
  Notes TEXT,
  
  CONSTRAINT fk_replacement_original_roster FOREIGN KEY (OriginalRosterID) 
    REFERENCES Roster(RosterID) ON DELETE CASCADE,
  CONSTRAINT fk_replacement_original_nurse FOREIGN KEY (OriginalNurseID) 
    REFERENCES Nurse(NurseID) ON DELETE CASCADE,
  CONSTRAINT fk_replacement_leave FOREIGN KEY (LeaveRequestID) 
    REFERENCES LeaveRequest(LeaveID) ON DELETE SET NULL,
  CONSTRAINT fk_replacement_manager FOREIGN KEY (RequestedByManagerID) 
    REFERENCES NurseManager(ManagerID) ON DELETE CASCADE,
  CONSTRAINT fk_replacement_nurse FOREIGN KEY (ReplacementNurseID) 
    REFERENCES Nurse(NurseID) ON DELETE SET NULL,
  CONSTRAINT fk_replacement_external FOREIGN KEY (ExternalNurseID) 
    REFERENCES ExternalNurse(ExternalNurseID) ON DELETE SET NULL,
  CONSTRAINT fk_replacement_new_roster FOREIGN KEY (NewRosterID) 
    REFERENCES Roster(RosterID) ON DELETE SET NULL
);

CREATE INDEX idx_replacement_status ON ReplacementRequest(Status);
CREATE INDEX idx_replacement_manager ON ReplacementRequest(RequestedByManagerID);
CREATE INDEX idx_replacement_original ON ReplacementRequest(OriginalRosterID);

-- ============================================================================
-- TABLE 13: NotificationQueue
-- ============================================================================
CREATE TABLE NotificationQueue (
  NotificationID SERIAL PRIMARY KEY,
  RecipientType VARCHAR(20) NOT NULL, -- Nurse / Manager
  RecipientID INTEGER NOT NULL,
  NotificationType VARCHAR(50) NOT NULL, -- LeaveApproval / LeaveReminder / ShiftUpdate / SwapRequest
  Channel VARCHAR(20) NOT NULL, -- WhatsApp / Email / Both
  Priority VARCHAR(20) DEFAULT 'Normal', -- Urgent / Normal / Low
  
  Subject VARCHAR(200),
  MessageBody TEXT NOT NULL,
  
  RelatedEntityType VARCHAR(50), -- LeaveRequest / Roster / ShiftSwap
  RelatedEntityID INTEGER,
  
  Status VARCHAR(20) DEFAULT 'Pending', -- Pending / Sent / Failed / Read
  ScheduledAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  SentAt TIMESTAMP,
  ReadAt TIMESTAMP,
  FailureReason TEXT,
  RetryCount INTEGER DEFAULT 0,
  
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT chk_notification_status CHECK (
    Status IN ('Pending', 'Sent', 'Failed', 'Read')
  )
);

CREATE INDEX idx_notification_status_scheduled ON NotificationQueue(Status, ScheduledAt);
CREATE INDEX idx_notification_recipient ON NotificationQueue(RecipientType, RecipientID);
CREATE INDEX idx_notification_type ON NotificationQueue(NotificationType);

-- ============================================================================
-- TABLE 14: NotificationPreference
-- ============================================================================
CREATE TABLE NotificationPreference (
  PreferenceID SERIAL PRIMARY KEY,
  NurseID INTEGER NOT NULL,
  NotificationType VARCHAR(50) NOT NULL,
  WhatsAppEnabled BOOLEAN DEFAULT TRUE,
  EmailEnabled BOOLEAN DEFAULT TRUE,
  PreferredChannel VARCHAR(20) DEFAULT 'Both', -- WhatsApp / Email / Both
  
  CONSTRAINT fk_notifpref_nurse FOREIGN KEY (NurseID) 
    REFERENCES Nurse(NurseID) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_notifpref_nurse_type ON NotificationPreference(NurseID, NotificationType);

-- ============================================================================
-- TABLE 15: FairnessMetrics
-- ============================================================================
CREATE TABLE FairnessMetrics (
  MetricID SERIAL PRIMARY KEY,
  NurseID INTEGER NOT NULL,
  PeriodID INTEGER NOT NULL,
  
  -- Workload tracking
  TotalShiftsAssigned INTEGER DEFAULT 0,
  TotalHoursWorked DECIMAL(6,2) DEFAULT 0.00,
  NightShiftCount INTEGER DEFAULT 0,
  WeekendShiftCount INTEGER DEFAULT 0,
  PublicHolidayShiftCount INTEGER DEFAULT 0,
  ConsecutiveDaysWorked INTEGER DEFAULT 0,
  
  -- Request fulfillment
  TotalShiftRequests INTEGER DEFAULT 0,
  ApprovedShiftRequests INTEGER DEFAULT 0,
  FulfillmentRate DECIMAL(5,2) DEFAULT 0.00, -- Percentage
  
  -- Leave balance
  TotalLeaveDaysTaken DECIMAL(5,2) DEFAULT 0.00,
  RemainingLeaveBalance DECIMAL(5,2) DEFAULT 0.00,
  
  -- Fairness scores (computed)
  WorkloadFairnessScore DECIMAL(5,2) DEFAULT 0.00, -- 0-100
  NightShiftFairnessScore DECIMAL(5,2) DEFAULT 0.00,
  RequestFulfillmentScore DECIMAL(5,2) DEFAULT 0.00,
  OverallFairnessScore DECIMAL(5,2) DEFAULT 0.00,
  
  LastCalculatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_fairness_nurse FOREIGN KEY (NurseID) 
    REFERENCES Nurse(NurseID) ON DELETE CASCADE,
  CONSTRAINT fk_fairness_period FOREIGN KEY (PeriodID) 
    REFERENCES RosterPeriod(PeriodID) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_fairness_nurse_period ON FairnessMetrics(NurseID, PeriodID);
CREATE INDEX idx_fairness_period_score ON FairnessMetrics(PeriodID, OverallFairnessScore);

-- ============================================================================
-- TABLE 16: ShiftSwap
-- ============================================================================
CREATE TABLE ShiftSwap (
  SwapID SERIAL PRIMARY KEY,
  RequestingNurseID INTEGER NOT NULL,
  TargetNurseID INTEGER NOT NULL,
  OriginalRosterID INTEGER NOT NULL,
  ReplacementRosterID INTEGER, -- Created after approval
  
  RequestedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  Status VARCHAR(20) DEFAULT 'Pending', -- Pending / Approved / Rejected / Cancelled
  
  TargetNurseResponse VARCHAR(20), -- Accepted / Declined / Pending
  TargetNurseResponseAt TIMESTAMP,
  
  ManagerID INTEGER,
  ManagerResponse VARCHAR(20), -- Approved / Rejected
  ManagerResponseAt TIMESTAMP,
  
  Reason TEXT,
  RejectionReason TEXT,
  
  NotificationSent BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT fk_swap_requesting FOREIGN KEY (RequestingNurseID) 
    REFERENCES Nurse(NurseID) ON DELETE CASCADE,
  CONSTRAINT fk_swap_target FOREIGN KEY (TargetNurseID) 
    REFERENCES Nurse(NurseID) ON DELETE CASCADE,
  CONSTRAINT fk_swap_original_roster FOREIGN KEY (OriginalRosterID) 
    REFERENCES Roster(RosterID) ON DELETE CASCADE,
  CONSTRAINT fk_swap_manager FOREIGN KEY (ManagerID) 
    REFERENCES NurseManager(ManagerID) ON DELETE SET NULL
);

CREATE INDEX idx_swap_status ON ShiftSwap(Status);
CREATE INDEX idx_swap_requesting ON ShiftSwap(RequestingNurseID, Status);
CREATE INDEX idx_swap_target ON ShiftSwap(TargetNurseID, Status);

-- ============================================================================
-- TABLE 17: AutoSchedulingRule
-- ============================================================================
CREATE TABLE AutoSchedulingRule (
  RuleID SERIAL PRIMARY KEY,
  RuleName VARCHAR(100) NOT NULL,
  RuleType VARCHAR(50) NOT NULL, -- MaxConsecutiveDays / MinRestHours / MaxWeeklyHours / NightShiftLimit
  
  AppliesTo VARCHAR(20) DEFAULT 'All', -- All / RN / StaffNurse / HCA / Probation
  
  RuleValue DECIMAL(10,2) NOT NULL, -- e.g., 5 for max consecutive days
  RulePriority INTEGER DEFAULT 1, -- Higher = more important
  IsHardConstraint BOOLEAN DEFAULT TRUE, -- TRUE = must satisfy, FALSE = prefer
  
  IsActive BOOLEAN DEFAULT TRUE,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rule_type ON AutoSchedulingRule(RuleType, IsActive);

-- ============================================================================
-- TABLE 18: SchedulingConstraintViolation
-- ============================================================================
CREATE TABLE SchedulingConstraintViolation (
  ViolationID SERIAL PRIMARY KEY,
  RosterID INTEGER,
  NurseID INTEGER NOT NULL,
  PeriodID INTEGER NOT NULL,
  
  RuleID INTEGER NOT NULL,
  ViolationType VARCHAR(50) NOT NULL, -- MaxHoursExceeded / InsufficientRest
  ViolationSeverity VARCHAR(20) DEFAULT 'Medium', -- Critical / High / Medium / Low
  
  ExpectedValue DECIMAL(10,2),
  ActualValue DECIMAL(10,2),
  
  DetectedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ResolvedAt TIMESTAMP,
  Resolution VARCHAR(20), -- Override / Fixed / Accepted
  ResolvedBy INTEGER, -- ManagerID
  ResolutionNotes TEXT,
  
  CONSTRAINT fk_violation_roster FOREIGN KEY (RosterID) 
    REFERENCES Roster(RosterID) ON DELETE CASCADE,
  CONSTRAINT fk_violation_nurse FOREIGN KEY (NurseID) 
    REFERENCES Nurse(NurseID) ON DELETE CASCADE,
  CONSTRAINT fk_violation_period FOREIGN KEY (PeriodID) 
    REFERENCES RosterPeriod(PeriodID) ON DELETE CASCADE,
  CONSTRAINT fk_violation_rule FOREIGN KEY (RuleID) 
    REFERENCES AutoSchedulingRule(RuleID) ON DELETE CASCADE,
  CONSTRAINT fk_violation_resolver FOREIGN KEY (ResolvedBy) 
    REFERENCES NurseManager(ManagerID) ON DELETE SET NULL
);

CREATE INDEX idx_violation_unresolved ON SchedulingConstraintViolation(ResolvedAt, ViolationSeverity);
CREATE INDEX idx_violation_nurse ON SchedulingConstraintViolation(NurseID, PeriodID);

-- ============================================================================
-- TABLE 19: NurseAvailability
-- ============================================================================
CREATE TABLE NurseAvailability (
  AvailabilityID SERIAL PRIMARY KEY,
  NurseID INTEGER NOT NULL,
  AvailabilityDate DATE NOT NULL,
  ShiftType VARCHAR(20) NOT NULL, -- Morning / Afternoon / Night / Any / Unavailable
  AvailabilityStatus VARCHAR(20) DEFAULT 'Available', -- Available / Preferred / Unavailable
  Reason VARCHAR(200),
  
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_availability_nurse FOREIGN KEY (NurseID) 
    REFERENCES Nurse(NurseID) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_availability_nurse_date_shift 
  ON NurseAvailability(NurseID, AvailabilityDate, ShiftType);
CREATE INDEX idx_availability_date_status ON NurseAvailability(AvailabilityDate, AvailabilityStatus);

-- ============================================================================
-- TABLE 20: RosterTemplate
-- ============================================================================
CREATE TABLE RosterTemplate (
  TemplateID SERIAL PRIMARY KEY,
  TemplateName VARCHAR(100) NOT NULL,
  WardID INTEGER NOT NULL,
  Description TEXT,
  
  IsActive BOOLEAN DEFAULT TRUE,
  CreatedBy INTEGER NOT NULL, -- ManagerID
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  LastUsedAt TIMESTAMP,
  
  CONSTRAINT fk_template_ward FOREIGN KEY (WardID) 
    REFERENCES Ward(WardID) ON DELETE CASCADE,
  CONSTRAINT fk_template_creator FOREIGN KEY (CreatedBy) 
    REFERENCES NurseManager(ManagerID) ON DELETE CASCADE
);

CREATE INDEX idx_template_ward_active ON RosterTemplate(WardID, IsActive);

-- ============================================================================
-- TABLE 21: RosterTemplateDetail
-- ============================================================================
CREATE TABLE RosterTemplateDetail (
  TemplateDetailID SERIAL PRIMARY KEY,
  TemplateID INTEGER NOT NULL,
  DayOfWeek INTEGER NOT NULL, -- 1=Monday, 7=Sunday
  ShiftCode VARCHAR(10) NOT NULL,
  NurseDesignation VARCHAR(50) NOT NULL, -- RN / StaffNurse / HCA
  RequiredCount INTEGER NOT NULL,
  
  CONSTRAINT fk_templatedetail_template FOREIGN KEY (TemplateID) 
    REFERENCES RosterTemplate(TemplateID) ON DELETE CASCADE,
  CONSTRAINT fk_templatedetail_shiftcode FOREIGN KEY (ShiftCode) 
    REFERENCES ShiftCode(ShiftCode),
  
  CONSTRAINT chk_templatedetail_day CHECK (DayOfWeek BETWEEN 1 AND 7),
  CONSTRAINT chk_templatedetail_count CHECK (RequiredCount >= 0)
);

CREATE INDEX idx_templatedetail_template ON RosterTemplateDetail(TemplateID);

-- ============================================================================
-- TABLE 22: LeaveBalance
-- ============================================================================
CREATE TABLE LeaveBalance (
  BalanceID SERIAL PRIMARY KEY,
  NurseID INTEGER NOT NULL,
  Year INTEGER NOT NULL,
  
  AnnualLeaveEntitlement DECIMAL(5,2) NOT NULL, -- e.g., 21.0 days
  AnnualLeaveTaken DECIMAL(5,2) DEFAULT 0.00,
  AnnualLeaveRemaining DECIMAL(5,2) GENERATED ALWAYS AS (AnnualLeaveEntitlement - AnnualLeaveTaken) STORED,
  
  MedicalLeaveEntitlement DECIMAL(5,2) NOT NULL,
  MedicalLeaveTaken DECIMAL(5,2) DEFAULT 0.00,
  MedicalLeaveRemaining DECIMAL(5,2) GENERATED ALWAYS AS (MedicalLeaveEntitlement - MedicalLeaveTaken) STORED,
  
  CarryForwardDays DECIMAL(5,2) DEFAULT 0.00,
  
  LastReminderSent TIMESTAMP,
  
  UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_balance_nurse FOREIGN KEY (NurseID) 
    REFERENCES Nurse(NurseID) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_balance_nurse_year ON LeaveBalance(NurseID, Year);
CREATE INDEX idx_balance_reminder ON LeaveBalance(Year, AnnualLeaveRemaining, LastReminderSent);

-- ============================================================================
-- TABLE 23: PublicHoliday
-- ============================================================================
CREATE TABLE PublicHoliday (
  HolidayID SERIAL PRIMARY KEY,
  HolidayDate DATE NOT NULL UNIQUE,
  HolidayName VARCHAR(100) NOT NULL,
  RequiresHigherStaffing BOOLEAN DEFAULT TRUE,
  StaffingMultiplier DECIMAL(3,2) DEFAULT 1.5 -- e.g., 1.5x normal requirement
);

CREATE INDEX idx_holiday_date ON PublicHoliday(HolidayDate);

-- ============================================================================
-- TABLE 24: SystemConfiguration
-- ============================================================================
CREATE TABLE SystemConfiguration (
  ConfigKey VARCHAR(100) PRIMARY KEY,
  ConfigValue TEXT NOT NULL,
  DataType VARCHAR(20) DEFAULT 'String', -- String / Integer / Boolean / Decimal / JSON
  Description TEXT,
  Category VARCHAR(50), -- Scheduling / Notification / Fairness
  UpdatedBy INTEGER,
  UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_config_updater FOREIGN KEY (UpdatedBy) 
    REFERENCES NurseManager(ManagerID) ON DELETE SET NULL
);

CREATE INDEX idx_config_category ON SystemConfiguration(Category);

-- ============================================================================
-- TABLE 25: AuditLog
-- ============================================================================
CREATE TABLE AuditLog (
  AuditID BIGSERIAL PRIMARY KEY,
  UserType VARCHAR(20) NOT NULL, -- Manager / Nurse / System
  UserID INTEGER NOT NULL,
  Action VARCHAR(100) NOT NULL, -- CreateRoster / ApproveLeave / SendNotification
  EntityType VARCHAR(50), -- Roster / LeaveRequest / ShiftSwap
  EntityID INTEGER,
  OldValue TEXT,
  NewValue TEXT,
  IPAddress VARCHAR(45),
  UserAgent TEXT,
  Timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON AuditLog(UserType, UserID, Timestamp);
CREATE INDEX idx_audit_action ON AuditLog(Action, Timestamp);
CREATE INDEX idx_audit_entity ON AuditLog(EntityType, EntityID);

-- ============================================================================
-- RBAC TABLES (7 TABLES)
-- ============================================================================

-- ============================================================================
-- TABLE 26: User (Authentication)
-- ============================================================================
CREATE TABLE "User" (
  UserID SERIAL PRIMARY KEY,
  Username VARCHAR(100) NOT NULL UNIQUE,
  Email VARCHAR(100) NOT NULL UNIQUE,
  PasswordHash VARCHAR(255) NOT NULL,
  
  -- Link to entity based on role
  NurseID INTEGER, -- NULL if not a nurse
  ManagerID INTEGER, -- NULL if not a manager
  
  -- Account status
  IsActive BOOLEAN DEFAULT TRUE,
  IsEmailVerified BOOLEAN DEFAULT FALSE,
  MustChangePassword BOOLEAN DEFAULT FALSE,
  
  -- Security
  LastLogin TIMESTAMP,
  FailedLoginAttempts INTEGER DEFAULT 0,
  LockedUntil TIMESTAMP,
  PasswordChangedAt TIMESTAMP,
  
  -- Audit
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CreatedBy INTEGER,
  
  CONSTRAINT fk_user_nurse FOREIGN KEY (NurseID) 
    REFERENCES Nurse(NurseID) ON DELETE SET NULL,
  CONSTRAINT fk_user_manager FOREIGN KEY (ManagerID) 
    REFERENCES NurseManager(ManagerID) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_user_username ON "User"(Username) WHERE IsActive = TRUE;
CREATE UNIQUE INDEX idx_user_email ON "User"(Email) WHERE IsActive = TRUE;
CREATE INDEX idx_user_nurse ON "User"(NurseID) WHERE NurseID IS NOT NULL;
CREATE INDEX idx_user_manager ON "User"(ManagerID) WHERE ManagerID IS NOT NULL;
CREATE INDEX idx_user_active ON "User"(IsActive);

-- ============================================================================
-- TABLE 27: Role
-- ============================================================================
CREATE TABLE Role (
  RoleID SERIAL PRIMARY KEY,
  RoleName VARCHAR(50) NOT NULL UNIQUE, -- Nurse / NurseManager / Admin
  DisplayName VARCHAR(100) NOT NULL,
  Description TEXT,
  IsActive BOOLEAN DEFAULT TRUE,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_role_active ON Role(IsActive);

-- ============================================================================
-- TABLE 28: Permission
-- ============================================================================
CREATE TABLE Permission (
  PermissionID SERIAL PRIMARY KEY,
  PermissionName VARCHAR(100) NOT NULL UNIQUE, -- view_own_roster / approve_leave / manage_all_wards
  Resource VARCHAR(50) NOT NULL, -- Roster / LeaveRequest / ShiftRequest / Ward / Nurse
  Action VARCHAR(50) NOT NULL, -- View / Create / Update / Delete / Approve / Reject
  Description TEXT,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_permission_resource ON Permission(Resource, Action);
CREATE INDEX idx_permission_name ON Permission(PermissionName);

-- ============================================================================
-- TABLE 29: RolePermission (Many-to-Many)
-- ============================================================================
CREATE TABLE RolePermission (
  RolePermissionID SERIAL PRIMARY KEY,
  RoleID INTEGER NOT NULL,
  PermissionID INTEGER NOT NULL,
  
  CONSTRAINT fk_roleperm_role FOREIGN KEY (RoleID) 
    REFERENCES Role(RoleID) ON DELETE CASCADE,
  CONSTRAINT fk_roleperm_permission FOREIGN KEY (PermissionID) 
    REFERENCES Permission(PermissionID) ON DELETE CASCADE,
  
  CONSTRAINT uq_role_permission UNIQUE(RoleID, PermissionID)
);

CREATE INDEX idx_roleperm_role ON RolePermission(RoleID);
CREATE INDEX idx_roleperm_permission ON RolePermission(PermissionID);

-- ============================================================================
-- TABLE 30: UserRole (Users can have multiple roles)
-- ============================================================================
CREATE TABLE UserRole (
  UserRoleID SERIAL PRIMARY KEY,
  UserID INTEGER NOT NULL,
  RoleID INTEGER NOT NULL,
  
  -- Optional: Ward-specific role assignment
  WardID INTEGER, -- NULL = all wards (for admin), specific ward for managers
  
  AssignedBy INTEGER, -- UserID who assigned this role
  AssignedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ExpiresAt TIMESTAMP, -- NULL = never expires
  
  IsActive BOOLEAN DEFAULT TRUE,
  
  CONSTRAINT fk_userrole_user FOREIGN KEY (UserID) 
    REFERENCES "User"(UserID) ON DELETE CASCADE,
  CONSTRAINT fk_userrole_role FOREIGN KEY (RoleID) 
    REFERENCES Role(RoleID) ON DELETE CASCADE,
  CONSTRAINT fk_userrole_ward FOREIGN KEY (WardID) 
    REFERENCES Ward(WardID) ON DELETE CASCADE,
  CONSTRAINT fk_userrole_assignedby FOREIGN KEY (AssignedBy) 
    REFERENCES "User"(UserID) ON DELETE SET NULL
);

CREATE INDEX idx_userrole_user_active ON UserRole(UserID, IsActive);
CREATE INDEX idx_userrole_role ON UserRole(RoleID);
CREATE INDEX idx_userrole_ward ON UserRole(WardID) WHERE WardID IS NOT NULL;

-- ============================================================================
-- TABLE 31: SessionToken (JWT/Session Management)
-- ============================================================================
CREATE TABLE SessionToken (
  TokenID SERIAL PRIMARY KEY,
  UserID INTEGER NOT NULL,
  Token VARCHAR(500) NOT NULL UNIQUE,
  TokenType VARCHAR(20) DEFAULT 'Access', -- Access / Refresh
  
  ExpiresAt TIMESTAMP NOT NULL,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  LastUsedAt TIMESTAMP,
  
  IPAddress VARCHAR(45),
  UserAgent TEXT,
  
  IsRevoked BOOLEAN DEFAULT FALSE,
  RevokedAt TIMESTAMP,
  RevokedReason TEXT,
  
  CONSTRAINT fk_session_user FOREIGN KEY (UserID) 
    REFERENCES "User"(UserID) ON DELETE CASCADE
);

CREATE INDEX idx_session_token ON SessionToken(Token) WHERE IsRevoked = FALSE;
CREATE INDEX idx_session_user_active ON SessionToken(UserID, IsRevoked, ExpiresAt);
CREATE INDEX idx_session_expires ON SessionToken(ExpiresAt) WHERE IsRevoked = FALSE;

-- ============================================================================
-- TABLE 32: AuditAuthLog (Authentication & Authorization Audit)
-- ============================================================================
CREATE TABLE AuditAuthLog (
  AuthLogID BIGSERIAL PRIMARY KEY,
  UserID INTEGER,
  Username VARCHAR(100),
  EventType VARCHAR(50) NOT NULL, -- Login / Logout / FailedLogin / PasswordChange / RoleChange
  Success BOOLEAN DEFAULT TRUE,
  FailureReason TEXT,
  
  IPAddress VARCHAR(45),
  UserAgent TEXT,
  
  Timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_authlog_user ON AuditAuthLog(UserID, Timestamp);
CREATE INDEX idx_authlog_event ON AuditAuthLog(EventType, Timestamp);
CREATE INDEX idx_authlog_timestamp ON AuditAuthLog(Timestamp);

-- ============================================================================
-- SEED DATA: Roles and Permissions
-- ============================================================================

-- Insert Roles
INSERT INTO Role (RoleName, DisplayName, Description) VALUES
('Nurse', 'Nurse', 'Can view own roster, submit shift requests, and request leave'),
('NurseManager', 'Nurse Manager', 'Can approve rosters and make adjustments for managed wards'),
('Admin', 'Administrator', 'Full system access to all features and data');

-- Insert Permissions
INSERT INTO Permission (PermissionName, Resource, Action, Description) VALUES
-- Nurse Permissions
('view_own_roster', 'Roster', 'View', 'View own roster schedule'),
('view_ward_roster', 'Roster', 'View', 'View roster for assigned ward'),
('submit_shift_request', 'ShiftRequest', 'Create', 'Submit shift preferences'),
('view_own_shift_requests', 'ShiftRequest', 'View', 'View own shift requests'),
('submit_leave_request', 'LeaveRequest', 'Create', 'Request leave'),
('view_own_leave_requests', 'LeaveRequest', 'View', 'View own leave requests'),
('cancel_own_leave_request', 'LeaveRequest', 'Update', 'Cancel own pending leave request'),

-- Nurse Manager Permissions
('view_managed_ward_rosters', 'Roster', 'View', 'View rosters for managed wards'),
('create_roster', 'Roster', 'Create', 'Create roster assignments'),
('update_roster', 'Roster', 'Update', 'Modify roster assignments'),
('delete_roster', 'Roster', 'Delete', 'Delete roster assignments'),
('approve_leave_request', 'LeaveRequest', 'Approve', 'Approve/reject leave requests'),
('view_leave_requests', 'LeaveRequest', 'View', 'View leave requests for managed wards'),
('approve_shift_request', 'ShiftRequest', 'Approve', 'Approve/reject shift requests'),
('view_shift_requests', 'ShiftRequest', 'View', 'View shift requests for managed wards'),
('manage_replacements', 'ReplacementRequest', 'Create', 'Manage nurse replacements'),
('view_ward_nurses', 'Nurse', 'View', 'View nurses in managed wards'),
('finalize_roster_period', 'RosterPeriod', 'Update', 'Finalize and publish roster'),

-- Admin Permissions
('manage_all_wards', 'Ward', 'Create,Update,Delete', 'Full ward management'),
('manage_all_nurses', 'Nurse', 'Create,Update,Delete', 'Full nurse management'),
('manage_all_rosters', 'Roster', 'Create,Update,Delete', 'Full roster management'),
('view_all_rosters', 'Roster', 'View', 'View all rosters'),
('manage_users', 'User', 'Create,Update,Delete', 'User account management'),
('manage_roles', 'Role', 'Create,Update,Delete', 'Role and permission management'),
('view_audit_logs', 'AuditLog', 'View', 'View system audit logs'),
('manage_system_config', 'SystemConfiguration', 'Create,Update', 'System configuration'),
('manage_all_leave_requests', 'LeaveRequest', 'Approve,Reject,View', 'Override leave decisions'),
('run_auto_scheduling', 'RosterPeriod', 'Create', 'Run auto-scheduling algorithm');

-- Assign Permissions to Roles
-- Nurse Role Permissions
INSERT INTO RolePermission (RoleID, PermissionID)
SELECT r.RoleID, p.PermissionID
FROM Role r, Permission p
WHERE r.RoleName = 'Nurse' 
  AND p.PermissionName IN (
    'view_own_roster',
    'view_ward_roster',
    'submit_shift_request',
    'view_own_shift_requests',
    'submit_leave_request',
    'view_own_leave_requests',
    'cancel_own_leave_request'
  );

-- Nurse Manager Role Permissions
INSERT INTO RolePermission (RoleID, PermissionID)
SELECT r.RoleID, p.PermissionID
FROM Role r, Permission p
WHERE r.RoleName = 'NurseManager' 
  AND p.PermissionName IN (
    'view_managed_ward_rosters',
    'create_roster',
    'update_roster',
    'delete_roster',
    'approve_leave_request',
    'view_leave_requests',
    'approve_shift_request',
    'view_shift_requests',
    'manage_replacements',
    'view_ward_nurses',
    'finalize_roster_period',
    -- Managers can also do nurse things
    'view_own_roster',
    'view_ward_roster',
    'submit_shift_request',
    'view_own_shift_requests',
    'submit_leave_request',
    'view_own_leave_requests'
  );

-- Admin Role Permissions (ALL)
INSERT INTO RolePermission (RoleID, PermissionID)
SELECT r.RoleID, p.PermissionID
FROM Role r, Permission p
WHERE r.RoleName = 'Admin';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function: Check if user has permission
CREATE OR REPLACE FUNCTION user_has_permission(
  p_user_id INTEGER,
  p_permission_name VARCHAR(100)
) RETURNS BOOLEAN AS $$
DECLARE
  has_perm BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM "User" u
    JOIN UserRole ur ON u.UserID = ur.UserID
    JOIN RolePermission rp ON ur.RoleID = rp.RoleID
    JOIN Permission p ON rp.PermissionID = p.PermissionID
    WHERE u.UserID = p_user_id
      AND u.IsActive = TRUE
      AND ur.IsActive = TRUE
      AND (ur.ExpiresAt IS NULL OR ur.ExpiresAt > CURRENT_TIMESTAMP)
      AND p.PermissionName = p_permission_name
  ) INTO has_perm;
  
  RETURN has_perm;
END;
$$ LANGUAGE plpgsql;

-- Function: Get user's managed wards (for nurse managers)
CREATE OR REPLACE FUNCTION get_user_managed_wards(p_user_id INTEGER)
RETURNS TABLE(WardID INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ur.WardID
  FROM UserRole ur
  JOIN Role r ON ur.RoleID = r.RoleID
  WHERE ur.UserID = p_user_id
    AND r.RoleName = 'NurseManager'
    AND ur.IsActive = TRUE
    AND (ur.ExpiresAt IS NULL OR ur.ExpiresAt > CURRENT_TIMESTAMP)
    AND ur.WardID IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Function: Check if user can access ward
CREATE OR REPLACE FUNCTION user_can_access_ward(
  p_user_id INTEGER,
  p_ward_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  can_access BOOLEAN;
  user_nurse_ward INTEGER;
BEGIN
  -- Check if admin (can access all)
  IF EXISTS(
    SELECT 1 FROM UserRole ur
    JOIN Role r ON ur.RoleID = r.RoleID
    WHERE ur.UserID = p_user_id
      AND r.RoleName = 'Admin'
      AND ur.IsActive = TRUE
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if manager of this ward
  IF EXISTS(
    SELECT 1 FROM UserRole ur
    JOIN Role r ON ur.RoleID = r.RoleID
    WHERE ur.UserID = p_user_id
      AND r.RoleName = 'NurseManager'
      AND ur.WardID = p_ward_id
      AND ur.IsActive = TRUE
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if nurse assigned to this ward
  SELECT n.WardID INTO user_nurse_ward
  FROM "User" u
  JOIN Nurse n ON u.NurseID = n.NurseID
  WHERE u.UserID = p_user_id;
  
  IF user_nurse_ward = p_ward_id THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function: Get user roles
CREATE OR REPLACE FUNCTION get_user_roles(p_user_id INTEGER)
RETURNS TABLE(
  RoleID INTEGER,
  RoleName VARCHAR(50),
  DisplayName VARCHAR(100),
  WardID INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.RoleID,
    r.RoleName,
    r.DisplayName,
    ur.WardID
  FROM UserRole ur
  JOIN Role r ON ur.RoleID = r.RoleID
  WHERE ur.UserID = p_user_id
    AND ur.IsActive = TRUE
    AND r.IsActive = TRUE
    AND (ur.ExpiresAt IS NULL OR ur.ExpiresAt > CURRENT_TIMESTAMP);
END;
$$ LANGUAGE plpgsql;

-- Function: Get user permissions
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id INTEGER)
RETURNS TABLE(PermissionName VARCHAR(100)) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT p.PermissionName
  FROM UserRole ur
  JOIN RolePermission rp ON ur.RoleID = rp.RoleID
  JOIN Permission p ON rp.PermissionID = p.PermissionID
  WHERE ur.UserID = p_user_id
    AND ur.IsActive = TRUE
    AND (ur.ExpiresAt IS NULL OR ur.ExpiresAt > CURRENT_TIMESTAMP);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS FOR REPORTING & DASHBOARDS
-- ============================================================================

-- View: User with roles and permissions
CREATE OR REPLACE VIEW UserWithRoles AS
SELECT 
  u.UserID,
  u.Username,
  u.Email,
  u.NurseID,
  u.ManagerID,
  u.IsActive,
  u.LastLogin,
  json_agg(
    DISTINCT jsonb_build_object(
      'roleId', r.RoleID,
      'roleName', r.RoleName,
      'displayName', r.DisplayName,
      'wardId', ur.WardID
    )
  ) FILTER (WHERE r.RoleID IS NOT NULL) AS Roles,
  array_agg(DISTINCT p.PermissionName) FILTER (WHERE p.PermissionName IS NOT NULL) AS Permissions
FROM "User" u
LEFT JOIN UserRole ur ON u.UserID = ur.UserID 
  AND ur.IsActive = TRUE
  AND (ur.ExpiresAt IS NULL OR ur.ExpiresAt > CURRENT_TIMESTAMP)
LEFT JOIN Role r ON ur.RoleID = r.RoleID AND r.IsActive = TRUE
LEFT JOIN RolePermission rp ON r.RoleID = rp.RoleID
LEFT JOIN Permission p ON rp.PermissionID = p.PermissionID
GROUP BY u.UserID, u.Username, u.Email, u.NurseID, u.ManagerID, u.IsActive, u.LastLogin;

-- View: Nurse Fairness Summary
CREATE OR REPLACE VIEW NurseFairnessSummary AS
SELECT 
  n.NurseID,
  n.Name,
  n.Designation,
  n.WardID,
  fm.PeriodID,
  fm.TotalShiftsAssigned,
  fm.TotalHoursWorked,
  fm.NightShiftCount,
  fm.WeekendShiftCount,
  fm.FulfillmentRate,
  fm.OverallFairnessScore,
  RANK() OVER (PARTITION BY fm.PeriodID ORDER BY fm.OverallFairnessScore ASC) AS FairnessRank
FROM Nurse n
LEFT JOIN FairnessMetrics fm ON n.NurseID = fm.NurseID
WHERE n.IsActive = TRUE;

-- View: Ward Staffing Status
CREATE OR REPLACE VIEW WardStaffingStatus AS
SELECT 
  r.WardID,
  r.ShiftDate,
  r.ShiftCode,
  w.WardName,
  COUNT(CASE WHEN n.Designation = 'RN' THEN 1 END) AS ActualRN,
  COUNT(CASE WHEN n.Designation = 'StaffNurse' THEN 1 END) AS ActualStaffNurse,
  COUNT(CASE WHEN n.Designation = 'HCA' THEN 1 END) AS ActualHCA,
  CASE 
    WHEN r.ShiftCode LIKE '%Morning%' OR r.ShiftCode = 'D' THEN w.Morning_RN_Required
    WHEN r.ShiftCode LIKE '%Night%' OR r.ShiftCode = 'N%' THEN w.Night_RN_Required
    ELSE 0
  END AS RequiredRN,
  CASE 
    WHEN r.ShiftCode LIKE '%Morning%' OR r.ShiftCode = 'D' THEN w.Morning_StaffNurse_Required
    WHEN r.ShiftCode LIKE '%Night%' OR r.ShiftCode = 'N%' THEN w.Night_StaffNurse_Required
    ELSE 0
  END AS RequiredStaffNurse
FROM Roster r
JOIN Ward w ON r.WardID = w.WardID
LEFT JOIN Nurse n ON r.NurseID = n.NurseID
WHERE r.Status = 'Confirmed'
GROUP BY r.WardID, r.ShiftDate, r.ShiftCode, w.WardName, w.Morning_RN_Required, 
         w.Night_RN_Required, w.Morning_StaffNurse_Required, w.Night_StaffNurse_Required;

-- ============================================================================
-- SAMPLE COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE "User" IS 'User accounts for authentication and authorization';
COMMENT ON TABLE Role IS 'System roles: Nurse, NurseManager, Admin';
COMMENT ON TABLE Permission IS 'Fine-grained permissions for resources and actions';
COMMENT ON TABLE UserRole IS 'User-to-Role mapping with optional ward-specific assignments';
COMMENT ON TABLE RolePermission IS 'Role-to-Permission mapping';

COMMENT ON FUNCTION user_has_permission(INTEGER, VARCHAR) IS 'Check if user has a specific permission';
COMMENT ON FUNCTION get_user_managed_wards(INTEGER) IS 'Get list of wards managed by a nurse manager';
COMMENT ON FUNCTION user_can_access_ward(INTEGER, INTEGER) IS 'Check if user can access a specific ward';

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Nurse Rostering System Database Created';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total Tables: 32';
  RAISE NOTICE '  - Core Tables: 25';
  RAISE NOTICE '  - RBAC Tables: 7';
  RAISE NOTICE '';
  RAISE NOTICE 'Roles Created: 3';
  RAISE NOTICE '  - Nurse';
  RAISE NOTICE '  - NurseManager';
  RAISE NOTICE '  - Admin';
  RAISE NOTICE '';
  RAISE NOTICE 'Permissions Created: 27';
  RAISE NOTICE 'Helper Functions: 4';
  RAISE NOTICE 'Views: 3';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '1. Create sample users with: INSERT INTO "User" ...';
  RAISE NOTICE '2. Assign roles with: INSERT INTO UserRole ...';
  RAISE NOTICE '3. Insert shift codes with: INSERT INTO ShiftCode ...';
  RAISE NOTICE '4. Create wards and nurses';
  RAISE NOTICE '5. Set up roster periods';
  RAISE NOTICE '========================================';
END $$;
