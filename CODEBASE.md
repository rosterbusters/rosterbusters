# Codebase Reference — RosterBusters

This document is the primary developer reference for the RosterBusters project. It covers the full-stack architecture, all major directories, backend API routes, database models, frontend pages and components, algorithms, infrastructure, and developer workflows.

For setup, seeding, and test-running commands, see [README.md](README.md).

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Repository Structure](#3-repository-structure)
4. [Backend (`/backend/`)](#4-backend-backend)
5. [Frontend (`/frontend/`)](#5-frontend-frontend)
6. [Infrastructure & Deployment](#6-infrastructure--deployment)
7. [Database Migrations (Alembic)](#7-database-migrations-alembic)
8. [Testing](#8-testing)
9. [Developer Workflows](#9-developer-workflows)

---

## 1. Project Overview

RosterBusters is a hospital nurse rostering system built for **SACH (St Andrew's Community Hospital)**. It automates and manages the bi-weekly scheduling of ward nursing staff across three shift types: AM, PM, and Night (ND).

### User Roles

| Role | Description |
|------|-------------|
| **Admin** | Super-user. Manages all system users (create/edit/delete), controls ward configuration, and has full access to all data. |
| **NurseManager** | Ward manager. Reviews and approves nurse shift/leave requests, triggers the rostering algorithm, edits the generated roster, and publishes the final schedule. |
| **Nurse (WardStaff)** | Clinical staff. Submits shift preferences and leave requests for the upcoming roster period, and views their published schedule. |

### Core Capabilities

- **Shift request submission** — Nurses submit their preferred shift types (AM/PM/Night) for specific dates within the request window.
- **Leave management** — Nurses apply for leave (Annual Leave, Medical, Compassionate, etc.). Managers review and approve or reject.
- **Algorithm-generated rosters** — Managers trigger roster generation for their ward. The system runs MILP (optimal) or falls back to a heuristic AB-Ratio algorithm, respecting all staffing constraints and nurse preferences.
- **Roster editing & publishing** — Managers can manually adjust the generated roster grid before publishing. All edits are tracked in a changelog. Publishing triggers notifications to ward nurses.
- **Notifications** — Automated email and in-app notifications for roster releases, request approvals/rejections, and period open/close events.
- **2FA & OAuth** — Email-based 2FA on login; Google OAuth supported.

---

## 2. Architecture Overview

```
                    Internet
                       │
          ┌────────────▼────────────┐
          │   Traefik Reverse Proxy  │
          │  (Port 80/443, TLS/SSL)  │
          └──┬─────────────┬────────┘
             │             │
   ┌─────────▼──┐   ┌──────▼───────────┐
   │  Frontend   │   │    Backend        │
   │ (Nginx/SPA) │   │  (FastAPI :8000)  │
   │  React+Vite │   │  Python 3.12      │
   └─────────────┘   └──┬──────────┬────┘
                        │          │
            ┌───────────▼──┐  ┌────▼────────────┐
            │  PostgreSQL   │  │     Redis        │
            │  (DB :5432)   │  │  (:6379 broker)  │
            └───────────────┘  └────┬────────────┘
                                    │
                          ┌─────────▼──────────┐
                          │   Celery Worker      │
                          │  Roster algorithms   │
                          │  (MILP / AB-Ratio)   │
                          └────────────────────-─┘
```

### Service Responsibilities

| Service | Technology | Responsibility |
|---------|-----------|----------------|
| **Frontend** | React 19, Vite, Nginx | SPA served via Nginx. Proxies `/api/*` to backend. |
| **Backend** | FastAPI, Python 3.12 | REST API, auth, business logic, algorithm orchestration. |
| **PostgreSQL** | postgres:18 | Persistent data store (users, wards, rosters, requests). |
| **Redis** | redis:7-alpine | Celery message broker, result backend, algorithm lock store. |
| **Celery Worker** | Python (Celery 5) | Runs async roster generation tasks; retries on failure. |
| **Traefik** | Traefik v3 | Reverse proxy with automatic TLS (staging: Let's Encrypt, prod: Cloudflare CA). |
| **Adminer** | adminer | Web-based database client at `adminer.{DOMAIN}` (dev/staging). |

### Environment Tiers

| Environment | Trigger | TLS | Email |
|-------------|---------|-----|-------|
| **Local** | `docker compose up` | None | Mailcatcher (view at `:1080`) |
| **Staging** | Push to `main` branch | Let's Encrypt ACME | AWS SES |
| **Production** | Push to `production` branch | Cloudflare Origin CA | AWS SES |

---

## 3. Repository Structure

```
rosterbusters/
├── backend/                    # FastAPI Python application
├── frontend/                   # React + Vite TypeScript application
├── .github/workflows/          # CI/CD GitHub Actions pipelines
├── docker-compose.yml          # Base Docker Compose config
├── docker-compose.override.yml # Local dev overrides (live reload, debug)
├── docker-compose.staging.yml  # Staging overrides (4 workers, staging domains)
├── docker-compose.prod.yml     # Production overrides (4 workers, prod domains)
├── docker-compose.cuda.yml     # Optional GPU/CUDA overlay for Celery worker
├── docker-compose.traefik.yml      # Traefik base config
├── docker-compose.traefik.staging.yml # Traefik + Let's Encrypt
├── docker-compose.traefik.prod.yml    # Traefik + Cloudflare CA
├── docker-compose.ci-prod.yml  # CI production build testing
├── .env.template               # All required environment variables documented
├── .env.e2e                    # E2E test environment overrides
├── README.md                   # Setup, seeding, and testing commands
├── CODEBASE.md                 # This file — developer reference
├── deployment.md               # Detailed deployment walkthrough
└── development.md              # Local development guide
```

---

## 4. Backend (`/backend/`)

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Web framework | FastAPI 0.114+ |
| ORM | SQLModel (SQLAlchemy + Pydantic) |
| Database | PostgreSQL 18 via psycopg3 |
| Migrations | Alembic 1.12+ |
| Background jobs | Celery 5.3+ with Redis broker |
| MILP solver | Pyomo 6.9+ (Gurobi preferred; COIN-OR fallback) |
| CP-SAT solver | Google OR-Tools 9.14+ |
| Email | SMTP (dev) / AWS SES via boto3 (production) |
| Security | bcrypt, passlib, PyJWT, Fernet encryption |
| OAuth | Authlib (Google OAuth 2.0) |
| Monitoring | Sentry |
| Package manager | `uv` |

### Directory Map

```
backend/
├── app/
│   ├── alembic/
│   │   ├── env.py                      # Alembic runtime environment
│   │   └── versions/                   # 22 migration files (see §7)
│   ├── api/
│   │   ├── deps.py                     # Dependency injection: DB session, auth, RBAC guards
│   │   ├── main.py                     # Aggregates all routers under /api/v1
│   │   └── routes/
│   │       ├── admin.py                # User & designation management (superuser only)
│   │       ├── leave.py                # Leave request CRUD & review workflow
│   │       ├── login.py                # JWT auth, Google OAuth, email 2FA
│   │       ├── notifications.py        # Notification fetch, mark-read, stats
│   │       ├── run_rostering.py        # Roster entries, generation, publish, constraints
│   │       ├── shifts.py               # Shift requests, ward rosters, shift codes
│   │       ├── users.py                # User profile, password change, email verify
│   │       ├── utils.py                # Health check endpoint
│   │       └── wards.py                # Ward CRUD & staffing config
│   ├── core/
│   │   ├── config.py                   # Pydantic BaseSettings (reads from .env)
│   │   ├── db.py                       # SQLAlchemy engine, init_db(), column healing
│   │   └── security.py                 # bcrypt hashing, JWT encode/decode, Fernet
│   ├── models/
│   │   ├── __init__.py                 # Re-exports all models
│   │   ├── designation.py              # Designation reference table
│   │   ├── enums.py                    # NotificationType enum with message templates
│   │   ├── leave.py                    # LeaveRequest model
│   │   ├── notification_models.py      # Notification API request/response schemas
│   │   ├── rbac.py                     # User, Nurse, NurseManager, Role, UserRole models
│   │   ├── roster.py                   # Ward, RosterPeriod, Roster, RosterChangeLog, constraints
│   │   ├── shifts.py                   # ShiftCode, WardShiftCode, ShiftRequest models
│   │   └── web.py                      # Auth schemas (Token, NewPassword, etc.)
│   ├── rostering/
│   │   ├── algo_scheduler.py           # Orchestrator: validates input, dispatches MILP → AB-Ratio
│   │   ├── milp_algo.py                # MILP algorithm via Pyomo (68 KB, Gurobi/COIN-OR)
│   │   ├── ab_ratio_algo.py            # AB-Ratio heuristic via OR-Tools CP-SAT (92 KB)
│   │   ├── ab_ratio_algo.md            # Algorithm documentation (18 KB)
│   │   └── cp_sat_algo.py              # Direct CP-SAT solver integration (59 KB)
│   ├── services/
│   │   ├── algorithm_lock_service.py   # Redis distributed lock (1 algorithm run per ward at a time)
│   │   └── roster_period_service.py    # Builds 26 bi-weekly roster periods per year
│   ├── tasks/
│   │   └── roster_tasks.py             # Celery task: generate_roster_task(), auto-retry, notifications
│   ├── email-templates/                # Jinja2 HTML email templates (password reset, roster release, etc.)
│   ├── cache.py                        # Redis JSON cache helpers (graceful degradation)
│   ├── crud.py                         # DB helpers: authenticate(), notification queries
│   ├── designation_mapping.py          # Maps designation strings → StaffingRole + RosterRank
│   ├── rbac.py                         # get_user_roles(), user_has_role(), ward-scoped checks
│   ├── utils.py                        # Email sending (SMTP or SES), Jinja2 rendering
│   ├── worker.py                       # Celery app init (broker=Redis, result backend=Redis)
│   ├── main.py                         # FastAPI app: CORS, middleware, router mount, Sentry
│   ├── backend_pre_start.py            # Pre-startup: waits for DB ready, runs migrations
│   ├── tests_pre_start.py              # Test DB init (called in CI before pytest)
│   ├── seed_admin.py                   # Creates/updates admin account from .env
│   ├── seed_core.py                    # Seeds reference data: roles, shift codes, wards
│   ├── seed_data.py                    # Seeds demo data: managers, nurses, periods, entries
│   ├── test_algo.py                    # CLI tool: seeds shift requests to test algorithm (52 KB)
│   └── initial_data.py                 # Calls seed_core + seed_admin on first startup
├── tests/
│   ├── api/routes/                     # API endpoint tests (admin, login, roster, users)
│   ├── rostering/                      # Algorithm correctness tests
│   ├── services/                       # Service unit tests (designation mapping, etc.)
│   ├── scripts/                        # Startup script tests
│   ├── utils/                          # Test helpers (user factories, token generation)
│   └── conftest.py                     # Pytest fixtures: db session, test client, auth tokens
├── database/                           # DB init scripts
├── scripts/                            # Utility scripts
├── alembic.ini                         # Alembic connection config
├── pyproject.toml                      # Python dependencies, pytest/ruff/mypy config
└── nurse_rostering_complete_with_rbac.sql  # Full DB schema dump (54 KB)
```

---

### 4.1 API Routes

All routes are mounted under `/api/v1/`. The OpenAPI docs are available at `/docs` (Swagger) and `/redoc`.

#### Auth & Login — `routes/login.py`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/login/access-token` | Login with email + password; returns JWT |
| POST | `/login/test-token` | Validates existing token, returns current user |
| POST | `/login/email-2fa/verify` | Verify emailed 2FA code |
| POST | `/login/email-2fa/resend` | Resend 2FA email |
| GET | `/login/google` | Initiate Google OAuth flow |
| GET | `/auth/google/callback` | OAuth callback handler |
| POST | `/password-recovery/{email}` | Send password reset email |
| POST | `/reset-password/` | Reset password using emailed token |

#### Users & Profile — `routes/users.py`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/me` | Get current authenticated user |
| PATCH | `/users/me/password` | Change own password |
| POST | `/users/me/first-login-setup` | Set initial password (forced on first login) |
| POST | `/users/me/send-email-verification-code` | Send email verification code |
| POST | `/users/me/verify-email-code` | Confirm email verification code |
| DELETE | `/users/me` | Delete own account |

#### Admin — `routes/admin.py` *(superuser only)*

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/users` | List all users (paginated) |
| GET | `/admin/users/{userid}` | Get a user's details |
| POST | `/admin/users` | Create a new user (assign designation + ward) |
| PATCH | `/admin/users/{userid}` | Update user info |
| POST | `/admin/users/{userid}/reset-password` | Admin-triggered password reset |
| DELETE | `/admin/users/{userid}` | Delete a user |
| GET | `/admin/designations` | List all designations |
| POST | `/admin/ward/{ward_id}/shift-codes/{shift_code}` | Add a shift code to a ward |
| DELETE | `/admin/ward/{ward_id}/shift-codes/{shift_code}` | Remove a shift code from a ward |

#### Wards — `routes/wards.py`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/roster/` | List all wards |
| GET | `/roster/{ward_id}` | Get a ward |
| POST | `/roster/` | Create a ward |
| PATCH | `/roster/{ward_id}` | Update a ward |
| PATCH | `/roster/{ward_id}/staffing` | Update staffing requirements |
| DELETE | `/roster/{ward_id}` | Delete a ward |

#### Shift Codes — `routes/shifts.py`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/roster/shift-codes` | All shift codes |
| GET | `/roster/shift-codes/working` | Working shift codes only |
| GET | `/roster/shift-codes/ward/{ward_id}` | Shift codes for a specific ward |
| PATCH | `/roster/nurses/{nurse_id}/shift-pattern` | Set a nurse's shift pattern (AM_ONLY, PM_ONLY) |

#### Roster Periods — `routes/shifts.py`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/roster/periods` | All 26 roster periods for the year |
| GET | `/roster/period` | The current active period |
| GET | `/roster/periods/current-upcoming` | Current, upcoming, and open-for-requests periods |

#### Shift Requests — `routes/shifts.py`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/roster/` | Get current user's shift requests |
| POST | `/roster/` | Submit a shift request |
| PATCH | `/roster/{request_id}` | Update a shift request |
| DELETE | `/roster/{request_id}` | Cancel a shift request |
| GET | `/roster/ward/{ward_id}` | Get all shift requests for a ward (manager) |
| PATCH | `/roster/{request_id}/review` | Approve or reject a shift request (manager) |

#### Leave Requests — `routes/leave.py`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/leave/me` | Get own leave requests |
| POST | `/leave/` | Submit a leave request |
| PATCH | `/leave/{leave_id}` | Update a leave request |
| DELETE | `/leave/{leave_id}` | Cancel a leave request |
| GET | `/leave/ward/{ward_id}` | Get ward leave requests (manager) |
| PATCH | `/leave/{leave_id}/review` | Approve or reject a leave request (manager) |
| GET | `/leave/codes` | Get all valid leave codes |

#### Rostering — `routes/run_rostering.py`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/roster/ward/{ward_id}` | Get the roster for a ward+period |
| POST | `/roster/create` | Create or update a single roster entry |
| POST | `/roster/bulk-upsert` | Bulk create/update roster entries |
| POST | `/roster/ward/{ward_id}/publish` | Publish the roster (triggers nurse notifications) |
| DELETE | `/roster/ward/{ward_id}/clear` | Clear all unpublished entries for a ward+period |
| PATCH | `/roster/roster/{roster_id}/comment` | Add/edit a comment on a roster entry |
| GET | `/roster/ward/{ward_id}/shift-requirements` | Staffing requirements for a ward |
| GET | `/roster/ward/{ward_id}/requests` | Pending shift + leave requests for a period |
| POST | `/roster/constraints` | Add a nurse period constraint |
| GET | `/roster/constraints` | Get period constraints |
| DELETE | `/roster/constraints/{constraint_id}` | Remove a constraint |
| GET | `/roster/manager/statistics` | Rostering stats for the manager's ward |

#### Changelog — `routes/run_rostering.py`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/roster/changelog` | Log a roster change |
| GET | `/roster/changelog` | Retrieve change history for a ward+period |

#### Notifications — `routes/notifications.py`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications/nurse` | Fetch nurse notifications (paginated, unread first) |
| GET | `/notifications/manager` | Fetch manager notifications |
| POST | `/notifications/mark-read` | Mark notification IDs as read |
| POST | `/notifications/mark-unread` | Mark notification IDs as unread |
| GET | `/notifications/stats` | Get unread counts by notification type |

---

### 4.2 Database Models

All models are defined with SQLModel (combines SQLAlchemy table definition + Pydantic schema).

#### RBAC & Users — `models/rbac.py`

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `RBACUser` | `userid`, `email`, `hashed_password`, `is_active`, `mustchangepassword` | System login account |
| `Nurse` | `nurseid`, `name`, `employeeid`, `designation`, `wardid`, `shift_pattern` | Clinical staff member |
| `NurseManager` | `managerid`, `name`, `email`, `wardid` | Ward manager |
| `Role` | `roleid`, `name` (Admin/NurseManager/Nurse) | System roles |
| `UserRole` | `userid`, `roleid`, `wardid` | Many-to-many user↔role (ward-scoped for managers/nurses) |

#### Ward & Roster — `models/roster.py`

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `Ward` | `wardid`, `name`, `hour_type` (8H/12H), staffing columns, `staffing_json` | Hospital ward; staffing levels stored as individual columns and as JSON |
| `RosterPeriod` | `periodid`, `name`, `startdate`, `enddate`, `requestopendate`, `requestclosedate`, `status` | Bi-weekly scheduling window (26/year) |
| `Roster` | `rosterid`, `nurseid`, `wardid`, `periodid`, `shiftdate`, `shiftcode`, `status`, `assignmentmethod` | Single nurse-day-shift assignment |
| `RosterChangeLog` | `changeid`, `rosterid`, `changedat`, `old_shiftcode`, `new_shiftcode`, `source`, `reason` | Full audit trail of all roster edits |
| `NursePeriodConstraint` | `constraintid`, `nurseid`, `periodid`, `constrainttype`, `value`, `reason` | Period-level overrides (e.g., no nights, max shifts) |

#### Requests — `models/shifts.py`, `models/leave.py`

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `ShiftRequest` | `requestid`, `nurseid`, `periodid`, `preferreddate`, `preferredshifttype`, `priority` (1–5), `status` | Nurse's preferred shift for a date |
| `LeaveRequest` | `leaveid`, `nurseid`, `startdate`, `enddate`, `leavetype`, `category`, `status` | Leave application (AL/MC/CCL/HOL/SD/FD/PH/ML) |

#### Reference Data — `models/shifts.py`, `models/designation.py`

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `ShiftCode` | `shiftcode` (A/P/N/DO/AL), `isworking`, `defaultstart`, `defaultend`, `duration` | Master list of all shift types |
| `WardShiftCode` | `wardid`, `shiftcode` | Which shift codes a ward uses |
| `Designation` | `designation`, `rank` (A/B/C) | Staff designations mapped to ranking for algorithm |

#### Notifications — `models/notification_models.py`, `models/enums.py`

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `NotificationQueue` | `notificationid`, `recipienttype`, `recipientid`, `type`, `channel`, `priority`, `status`, `payload` | Queued/sent notification records |
| `NotificationType` | Enum values with formatted message templates | e.g., `RosterRelease`, `ShiftRequestPeriodOpen`, `LeaveApproved` |

---

### 4.3 Rostering Algorithms

The scheduler is invoked asynchronously by a Celery task (`roster_tasks.py`).

#### Orchestrator — `rostering/algo_scheduler.py`

- Entry point: `generate_roster(ward_data, nurses, requests, period, preferences)`
- Normalises shift names (A→AM, P→PM, N→NIGHT)
- Validates inputs (minimum nurses, required shift codes)
- **Strategy:** attempts MILP first; on `MILPInfeasibilityError` automatically falls back to AB-Ratio
- Returns `{"method": "MILP" | "AB-RATIO", "roster": {...}}`

#### MILP Algorithm — `rostering/milp_algo.py` (68 KB)

- **Framework:** Pyomo (Gurobi preferred solver; COIN-OR CBC as open-source fallback)
- **Decision variables:** Binary `x[nurse, day, shift]`
- **Hard constraints:**
  - Minimum RN / EN / HCA coverage per shift per day
  - Night shift blocks: must work 2 consecutive nights; mandatory day-off after
  - Weekly caps: ≤ 2 night shifts, ≤ 5 total shifts per 7-day window
  - Shift pattern enforcement (AM_ONLY, PM_ONLY nurses)
  - Mandatory days off (medical leave, pre-approved leave)
- **Soft constraints (objective):** Minimise weighted preference violations (priority 1–5 weights)
- Raises `MILPError` or `MILPInfeasibilityError` (triggers AB-Ratio fallback)

#### AB-Ratio Algorithm — `rostering/ab_ratio_algo.py` (92 KB)

- **Framework:** Google OR-Tools CP-SAT solver
- Heuristic approach: greedy warm-start → CP-SAT refinement
- Round-robin night assignment, leave/off-day handling
- Used when MILP cannot find a feasible solution
- Documented in `rostering/ab_ratio_algo.md`

#### CP-SAT Integration — `rostering/cp_sat_algo.py` (59 KB)

- Direct CP-SAT solver wrapper for alternative constraint programming approach

---

### 4.4 Background Tasks

**Celery Worker** (`worker.py`):
- Broker: `REDIS_URL`
- Result backend: Redis (1-hour TTL)
- Serialiser: JSON

**`roster_tasks.py`**:
- `generate_roster_task(ward_id, period_id, algorithm)` — Async task with auto-retry (exponential backoff)
- Acquires a per-ward Redis lock (`algorithm_lock_service.py`) to prevent concurrent runs
- On completion: saves roster to DB, queues completion notifications

---

### 4.5 Key Utilities

| File | Purpose |
|------|---------|
| `core/config.py` | Pydantic `Settings` class; reads all env vars from `.env` |
| `core/security.py` | bcrypt hashing, JWT HS256 encode/decode, Fernet encryption for default passwords |
| `core/db.py` | Engine creation, `init_db()` (creates tables, bootstraps admin, heals legacy columns) |
| `api/deps.py` | `get_db()` session generator; `get_current_user()` JWT guard; `require_nurse_manager()` / `require_nurse()` RBAC guards |
| `designation_mapping.py` | Maps designation strings (e.g. "SN", "Senior Nurse") → `StaffingRole` (RN/EN/HCA) + `RosterRank` (A/B/C) used by algorithm |
| `rbac.py` | `get_user_roles()`, `user_has_role()`, ward-scoped role checks |
| `cache.py` | Redis JSON cache with graceful degradation if Redis is unavailable |
| `utils.py` | Email sending (auto-selects SMTP vs SES), Jinja2 template rendering |

---

## 5. Frontend (`/frontend/`)

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | React 19 + TypeScript (strict) |
| Build tool | Vite 7 + SWC |
| Routing | TanStack Router (file-based, auto code-split) |
| Server state | TanStack React Query 5 |
| UI library | Chakra UI 3 + Tailwind CSS 4 + shadcn/ui (Radix primitives) |
| Icons | Lucide React + React Icons |
| HTTP client | Axios; auto-generated OpenAPI SDK |
| Calendar | React Big Calendar + React Day Picker + date-fns |
| Forms | React Hook Form |
| Export | XLSX (Excel file generation) |
| Testing | Playwright (E2E) |
| Linting | Biome |

### Directory Map

```
frontend/src/
├── client/                          # API integration layer
│   ├── sdk.gen.ts                   # AUTO-GENERATED — full SDK from OpenAPI spec (32 KB)
│   ├── types.gen.ts                 # AUTO-GENERATED — all API types (9 KB)
│   ├── schemas.gen.ts               # AUTO-GENERATED — JSON schemas (22 KB)
│   ├── LeaveRequestsService.ts      # MANUAL — leave request API calls
│   ├── NotificationsService.ts      # MANUAL — notification API calls
│   ├── adminService.ts              # MANUAL — admin-specific API calls
│   └── core/
│       ├── OpenAPI.ts               # Base URL config, token resolver
│       ├── request.ts               # HTTP request execution
│       └── auth.ts                  # Token management from localStorage
├── components/
│   ├── Admin/
│   │   └── AdminNavbar.tsx          # Navigation bar for admin role
│   ├── Common/
│   │   ├── Navbar.tsx               # Main top navigation bar (all roles)
│   │   ├── NotificationDropdown.tsx # Bell icon + notification list
│   │   ├── NotificationBannerContainer.tsx  # Toast-style notifications
│   │   ├── LockdownBanner.tsx       # Banner when system is locked
│   │   ├── DatePicker.tsx           # Shared date selection component
│   │   └── CalendarRequestBlock.tsx # Calendar event block for requests
│   ├── NurseManager/
│   │   ├── NurseManagerNavbar.tsx   # Manager navigation
│   │   ├── HomePage/
│   │   │   └── StatusBanner.tsx     # Roster period status banner
│   │   ├── RosterTable/             # Core roster grid
│   │   │   ├── RosterGrid.tsx       # Main grid: inline editing, shift badges, summaries
│   │   │   ├── RosterHeader.tsx     # Period selector, view modes, export button
│   │   │   ├── ShiftEditPopover.tsx # Inline shift change popover
│   │   │   ├── ShiftCommentPopover.tsx  # Add/edit comment on a shift cell
│   │   │   ├── ShiftBadge.tsx       # Visual shift code display
│   │   │   ├── ShiftSummaryTable.tsx    # Staffing summary statistics
│   │   │   ├── EditHistoryDialog.tsx    # Changelog viewer dialog
│   │   │   ├── ManpowerEditDialog.tsx   # Edit required staffing levels
│   │   │   ├── useRosterData.ts     # React Query hooks for roster data
│   │   │   ├── staffingGuidelines.ts    # Staffing validation rules
│   │   │   └── types.ts             # Roster component types
│   │   ├── RosterPlanning/          # Algorithm trigger interface
│   │   │   ├── AlgorithmInputsDialog.tsx    # Set algorithm parameters
│   │   │   ├── AlgorithmGeneratedBadge.tsx  # Badge: MILP or GA indicator
│   │   │   ├── RosterPlanningHeader.tsx     # Page header
│   │   │   ├── requestReview.ts             # Request review logic
│   │   │   └── wardStaffingGuidelines.ts    # Ward-specific staffing rules
│   │   └── Requests/
│   │       ├── RequestsOverviewTable.tsx    # All pending requests table
│   │       ├── RequestReviewModal.tsx       # Approve/reject modal
│   │       ├── LeaveRequests/               # Leave request management views
│   │       └── ShiftRequests/               # Shift request management views
│   ├── WardStaff/
│   │   ├── HomePage/
│   │   │   ├── StaffCalendar.tsx    # Staff's published schedule calendar
│   │   │   └── StatusBanner.tsx     # Request window open/close status
│   │   └── Requests/
│   │       ├── LeaveRequests/       # Leave request submission & editing
│   │       └── ShiftRequests/       # Shift request submission & editing
│   ├── UserSettings/
│   │   └── Appearance.tsx           # Dark/light theme toggle
│   ├── Pending/
│   │   └── PendingUsers.tsx         # Pending account approvals (admin)
│   └── ui/                          # Shared UI primitives (Chakra + shadcn)
│       ├── button.tsx, dialog.tsx, drawer.tsx, input-group.tsx
│       ├── toast.tsx, toaster.tsx, tooltip.tsx
│       └── (+ 15 more primitives)
├── routes/                          # File-based pages (TanStack Router)
│   ├── __root.tsx                   # Root layout; loads devtools
│   ├── index.tsx                    # Redirects based on role
│   ├── login.tsx                    # Login with email 2FA
│   ├── recover-password.tsx         # Initiate password reset
│   ├── reset-password.tsx           # Reset from email link
│   ├── first-login-setup.tsx        # Forced password change on first login
│   ├── admin.tsx                    # Admin layout wrapper
│   ├── admin/
│   │   ├── dashboard.tsx            # Admin stats overview
│   │   ├── users.tsx                # User management table
│   │   └── wards.tsx                # Ward configuration
│   ├── nurse-manager.tsx            # Manager layout wrapper
│   ├── nurse-manager/
│   │   ├── home.tsx                 # Roster grid + period selector
│   │   ├── roster-planning.tsx      # Algorithm trigger + progress
│   │   ├── request-overview.tsx     # All leave & shift requests
│   │   ├── request-application.tsx  # Create new request
│   │   ├── ward-staff-directory.tsx # View all nurses in ward
│   │   ├── profile.tsx              # Manager profile
│   │   └── settings.tsx             # Manager preferences
│   ├── ward-staff.tsx               # Staff layout wrapper
│   ├── ward-staff/
│   │   ├── home.tsx                 # Staff home page
│   │   ├── staffrosterschedule.tsx  # Published roster calendar view
│   │   ├── leaveandshiftrequest.tsx # Combined request interface
│   │   ├── leave-request.tsx        # Leave request interface
│   │   ├── request-overview.tsx     # Own requests history
│   │   ├── request-application.tsx  # Submit new request
│   │   ├── profile.tsx              # Staff profile
│   │   └── settings.tsx             # Staff preferences
│   └── auth/
│       └── callback.tsx             # OAuth callback handler
├── hooks/
│   ├── useAuth.ts                   # Login, 2FA, logout, role-based redirect
│   ├── useApplicationLockStatus.ts  # Is the system currently locked?
│   ├── useRosterPlanningLockStatus.ts  # Is roster planning locked for this ward?
│   └── use-mobile.ts                # Mobile breakpoint detection
├── models/
│   ├── Shift.ts                     # Shift data model
│   └── Event.ts                     # Calendar event model
├── types/
│   ├── notifications.ts             # Notification payload types
│   └── react-big-calendar.d.ts      # Type augmentation for calendar library
├── theme/
│   ├── button.recipe.ts             # Chakra button variants
│   ├── badge.recipe.ts              # Chakra badge variants
│   └── table.recipe.ts              # Chakra table layout recipe
├── styles/
│   └── bigCalendar.scss             # React Big Calendar style overrides
├── lib/
│   └── utils.ts                     # `cn()` className utility (clsx + tailwind-merge)
├── main.tsx                         # App entry: React Query client, Router, OpenAPI config
├── theme.tsx                        # Chakra UI system theme (colors, semantic tokens)
├── utils.ts                         # `handleError()` — toast on API error, auto-logout on 401
├── index.css                        # Global Tailwind imports + custom styles
└── routeTree.gen.ts                 # AUTO-GENERATED — TanStack Router route tree (27 KB)
```

---

### 5.1 Pages & Features by Role

#### Admin (`/admin`)

| Route | Component | Features |
|-------|-----------|---------|
| `/admin/dashboard` | `admin/dashboard.tsx` | System stats: total users, wards, nurses, managers |
| `/admin/users` | `admin/users.tsx` | Create, edit, delete users; assign designation & ward; admin-reset passwords |
| `/admin/wards` | `admin/wards.tsx` | Create, edit, delete wards; configure shift codes |

#### Nurse Manager (`/nurse-manager`)

| Route | Component | Features |
|-------|-----------|---------|
| `/nurse-manager/home` | `nurse-manager/home.tsx` | **Primary page.** Roster grid with inline shift editing, comment popovers, staffing summaries, period selector, Excel export, edit history viewer |
| `/nurse-manager/roster-planning` | `nurse-manager/roster-planning.tsx` | Set algorithm mode (Auto/MILP/GA), view shift requests, trigger generation, watch Celery progress bar |
| `/nurse-manager/request-overview` | `nurse-manager/request-overview.tsx` | Table of all nurse leave + shift requests; approve/reject with modal |
| `/nurse-manager/ward-staff-directory` | `nurse-manager/ward-staff-directory.tsx` | List of all nurses in the manager's ward |
| `/nurse-manager/profile` | `nurse-manager/profile.tsx` | Manager profile view/edit |
| `/nurse-manager/settings` | `nurse-manager/settings.tsx` | Preferences |

#### Ward Staff (`/ward-staff`)

| Route | Component | Features |
|-------|-----------|---------|
| `/ward-staff/home` | `ward-staff/home.tsx` | Status banner showing request window; upcoming schedule |
| `/ward-staff/staffrosterschedule` | `ward-staff/staffrosterschedule.tsx` | Published roster calendar (read-only) |
| `/ward-staff/leaveandshiftrequest` | `ward-staff/leaveandshiftrequest.tsx` | Combined leave + shift request submission calendar |
| `/ward-staff/leave-request` | `ward-staff/leave-request.tsx` | Leave request submission & management |
| `/ward-staff/request-overview` | `ward-staff/request-overview.tsx` | View own request history & statuses |

#### Auth (`/login`, `/recover-password`, etc.)

| Route | Features |
|-------|---------|
| `/login` | Email + password; conditional email 2FA code step |
| `/recover-password` | Request password reset email |
| `/reset-password` | Set new password from emailed token |
| `/first-login-setup` | Forced password change for new accounts |
| `/auth/callback` | Google OAuth token exchange |

---

### 5.2 API Service Layer

The frontend uses an auto-generated type-safe SDK created from the backend's OpenAPI spec.

**Regenerating the client:**
```bash
cd frontend
npm run generate-client    # reads openapi.json, writes to src/client/
```

**Generated files** (do not edit manually):
- `src/client/sdk.gen.ts` — Service classes (UsersService, WardsService, RostersService, etc.)
- `src/client/types.gen.ts` — All request/response types
- `src/client/schemas.gen.ts` — JSON schemas
- `src/routeTree.gen.ts` — Route tree (regenerated on `npm run generate-routes`)

**Manual service extensions:**

| File | Services Provided |
|------|-----------------|
| `client/LeaveRequestsService.ts` | `getLeaveCodes()`, `createLeaveRequest()`, `getMyLeaveRequests()`, `getWardLeaveRequests()`, `reviewLeaveRequest()`, `updateLeaveRequest()`, `deleteLeaveRequest()` |
| `client/NotificationsService.ts` | `getNurseNotifications()`, `getManagerNotifications()`, `getNotificationStats()`, `markNotificationsRead()`, `markNotificationsUnread()` |
| `client/adminService.ts` | Admin-specific endpoints for bulk user/ward operations |

**Base config** (`client/core/OpenAPI.ts`):
- `OpenAPI.BASE` = `import.meta.env.VITE_API_URL`
- `OpenAPI.TOKEN` = dynamic resolver reading `access_token` from `localStorage`

---

### 5.3 State Management

| Concern | Approach |
|---------|---------|
| All server data | TanStack React Query (caching, auto-refetch on focus, mutation invalidation) |
| Auth token | `localStorage` (`access_token`) |
| UI state (modals, filters) | React `useState` / `useReducer` |
| Roster editor undo/redo | `useReducer` with action history |
| Theme (dark/light) | `next-themes` + Chakra color mode |

---

## 6. Infrastructure & Deployment

### Docker Services

| Service | Image | Local Port | Purpose |
|---------|-------|-----------|---------|
| `db` | `postgres:18` | `5432` | Primary database |
| `backend` | Built from `backend/` | `8000` | FastAPI REST API |
| `frontend` | Built from `frontend/` | `5173` (dev) / `80` (prod) | React SPA |
| `celery_worker` | Same as backend | — | Background task processor |
| `redis` | `redis:7-alpine` | `6379` | Celery broker + result store |
| `adminer` | `adminer` | `8080` | Web DB client |
| `prestart` | Same as backend | — | Runs migrations before backend starts |
| `mailcatcher` | `schickling/mailcatcher` | `1080` (web), `1025` (SMTP) | Local email capture |

### Traefik Routing

| Domain | Forwards to | Service |
|--------|------------|---------|
| `dashboard.{DOMAIN}` | Port 80 (Nginx) | Frontend |
| `api.{DOMAIN}` | Port 8000 | Backend |
| `adminer.{DOMAIN}` | Port 8080 | Adminer |
| `traefik.{DOMAIN}` | Port 8080 | Traefik dashboard |

### CI/CD Workflows

| Workflow | File | Trigger | Action |
|----------|------|---------|--------|
| Deploy staging | `deploy-staging.yml` | Push to `main` | SSH to EC2, sync code, rebuild + restart with staging compose |
| Deploy production | `deploy-prod.yml` | Push to `production` | SSH to EC2, sync code, rebuild + restart with prod compose, health check |
| E2E tests | `playwright-e2e.yml` | Push to `main` / PR | Start backend+db, run Playwright suite on Chromium, upload report artifact |
| Prod build test | `test-prod-build.yml` | PR | Build production Docker images, verify health endpoints |
| Conflict detection | `detect-conflicts.yml` | PR | Detect merge conflicts |
| Release notes | `latest-changes.yml` | Push | Generate changelog |
| Dependabot merge | `dependabot-auto-merge.yml` | Dependabot PR | Auto-merge minor/patch updates |

### Environment Variables Reference

All variables are documented in `.env.template`. Key ones:

| Variable | Purpose |
|----------|---------|
| `DOMAIN` | Base domain (e.g. `sachduby.com`) |
| `ENVIRONMENT` | `local` / `staging` / `production` |
| `SECRET_KEY` | FastAPI session + JWT signing secret (generate with `openssl rand -hex 32`) |
| `POSTGRES_SERVER/DB/USER/PASSWORD` | Database connection |
| `REDIS_URL` | Redis connection for Celery |
| `FIRST_SUPERUSER` / `FIRST_SUPERUSER_PASSWORD` | Initial admin account |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `AWS_REGION` / `AWS_SES_SENDER_EMAIL` | AWS SES email (leave blank to use SMTP) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_TLS` / `SMTP_SSL` | SMTP config (dev: Mailcatcher) |
| `SENTRY_DSN` | Sentry error tracking DSN |
| `GRB_WLSACCESSID` / `GRB_WLSSECRET` / `GRB_LICENSEID` | Gurobi solver licence (leave blank for COIN-OR) |
| `FRONTEND_HOST` | Base URL used in email links |
| `BACKEND_CORS_ORIGINS` | Comma-separated allowed CORS origins |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT TTL (default: `11520` = 8 days) |
| `E2E_SUPERUSER` / `E2E_SUPERUSER_PASSWORD` | E2E test admin credentials |

---

## 7. Database Migrations (Alembic)

Migrations live in `backend/app/alembic/versions/` and run automatically via the `prestart` service on every Docker startup (`alembic upgrade head`).

| Migration File | Change |
|---------------|--------|
| `25d7001141de` | Added `comment` field to `roster` table |
| `33ed5b3c81d0` | Added `web_user` table (safe) |
| `7a9b529f97da` | Created `ward_shiftcode` join table |
| `a1b2c3d4e5f6` | Updated `leaverequest` type constraint (added ML, CCL, etc.) |
| `b2c3d4e5f6g7` | Added per-shift staffing columns to `ward` table (AM/PM/ND RN/EN/HCA min/max) |
| `d4e5f6a7b8c9` | Relaxed shift request number constraint |
| `e5f6a7b8c9d0` | Created `notificationqueue` table |
| `e5f6a7b8c9d0` (2) | Dropped legacy `web_user` and `item` tables |
| `f1a2b3c4d5e6` | Added `mustchangepassword` column to user |
| `f8880bf38a7a` | Added `staffing_json` column to `ward` |
| `g2h3i4j5k6l7` | Created `rosterchangelog` audit table |
| `h3i4j5k6l7m8` | Added `employeeid` to nurse and manager tables |
| `i4j5k6l7m8n9` | Dropped legacy `ward_morning_*` columns |
| `j5k6l7m8n9o0` | Created `designation` reference table |
| `k1l2m3n4o5p6` | Added `PH` (Public Holiday) leave type |
| `l7m8n9o0p1q2` | Added `HOL` (Holiday) leave type |
| `m0n1o2p3q4r5` | Set `HOL`, `SD`, `FD` as valid leave types |
| `n1o2p3q4r5s6` | Added `defaultpassword` (encrypted) to user |
| `n1o2p3q4r5s6` (2) | Added `shift_pattern` to nurse + created `nurse_period_constraint` table |
| `p1q2r3s4t5u6` | Removed `PSA` designation |
| `q7r8s9t0u1v2` | Enforced foreign key from nurse → designation |
| `r8s9t0u1v2w3` | Added `hour_type` (8H/12H) column to `ward` |

**To create a new migration:**
```bash
docker compose exec backend uv run alembic revision --autogenerate -m "describe_your_change"
```

**To apply manually:**
```bash
docker compose exec backend uv run alembic upgrade head
```

---

## 8. Testing

### Backend (pytest)

- **Run all tests:**
  ```bash
  uv run pytest backend/tests
  ```
- **Run a specific suite:**
  ```bash
  uv run pytest backend/tests/services/test_designation_mapping.py
  ```
- **Test structure:**
  - `tests/api/routes/` — API endpoint integration tests (TestClient + real DB)
  - `tests/rostering/` — Algorithm correctness tests
  - `tests/services/` — Service unit tests
  - `tests/utils/` — Test helper utilities
  - `conftest.py` — Session-scoped DB fixture, auth token fixtures
- **Coverage:** configured in `pyproject.toml`, source: `app/`

### Frontend E2E (Playwright)

- **Run all tests:**
  ```bash
  cd frontend && npm run test:e2e
  ```
- **Available commands:**
  ```bash
  npm run test:e2e:ui      # Playwright UI inspector
  npm run test:e2e:debug   # Step-through debugger
  npm run test:e2e:report  # View HTML report
  ```
- **Test suites** (all in `frontend/tests/e2e/`):

  | Spec file | Coverage |
  |-----------|---------|
  | `login.spec.ts` | Auth flows, 2FA, redirect by role |
  | `admin-users.spec.ts` | User CRUD via admin panel |
  | `admin-wards.spec.ts` | Ward configuration |
  | `admin-import.spec.ts` | Bulk user import |
  | `admin-password-sharing.spec.ts` | Admin password share feature |
  | `nurse-manager-leave-requests.spec.ts` | Manager leave approval flow |
  | `ward-shift-requests.spec.ts` | Staff shift request submission |
  | `ward-leave-requests.spec.ts` | Staff leave request submission |
  | `roster-*.spec.ts` | Roster generation, editing, publishing |
  | `*-notifications.spec.ts` | Notification delivery |
  | `password-recovery.spec.ts` | Password reset flow |
  | `email-test.spec.ts` | Email delivery via Mailcatcher |

- **Config:** `playwright.config.ts` — base URL `:5174`, 1 worker (sequential), retries: 2 in CI
- **Auth setup:** `tests/auth.setup.ts` — establishes authenticated browser state
- Playwright uses port `5174` (separate from the dev server at `5173`)

---

## 9. Developer Workflows

### Regenerate the Frontend API Client

After any backend endpoint change, regenerate the TypeScript SDK:

```bash
cd frontend
npm run generate-client
```

This reads `openapi.json` (pulled from the running backend's `/openapi.json`) and rewrites `src/client/sdk.gen.ts`, `types.gen.ts`, and `schemas.gen.ts`.

### Regenerate the Route Tree

After adding or renaming a frontend route file:

```bash
cd frontend
npm run generate-routes
# or use the file watcher during development:
npm run dev    # runs generate-routes in watch mode alongside Vite
```

### Add a Database Migration

1. Make your model change in `backend/app/models/`
2. Generate migration:
   ```bash
   docker compose exec backend uv run alembic revision --autogenerate -m "your_description"
   ```
3. Review the generated file in `backend/app/alembic/versions/`
4. Apply it:
   ```bash
   docker compose exec backend uv run alembic upgrade head
   ```

### Seed & Test the Algorithm

See [README.md → Testing the Algorithm](README.md#testing-the-algorithm) for the full step-by-step guide.

### Adjust Roster Period Dates (Local Dev)

If the request window is closed and you need to test request editing, see [README.md → Adjusting Roster Period Dates](README.md#adjusting-roster-period-dates-local-dev).

### Regenerate Chakra UI Theme Types

After modifying `src/theme.tsx`:

```bash
cd frontend
npm run typegen
```
