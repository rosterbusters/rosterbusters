<img width="1080" height="324" alt="Banners" src="https://github.com/user-attachments/assets/c1ac96e4-8c46-4763-bcaa-9b008f642681" />


# Setup
1. Place .env file in root directory
2. Place google_auth_credentials.json into the backend/
3. docker-compose up

# E2E Testing (Playwright)

Playwright uses `http://localhost:5174` so it doesn’t conflict with the Docker frontend on `5173`.

1. Start your Docker stack (backend + db):
```bash
docker compose up -d backend db
```
2. Apply the E2E env overrides and restart backend so CORS allows `5174`:
```bash
copy /Y .env .env.bak
type .env.e2e >> .env
docker compose restart backend
```
3. Set the E2E superuser credentials in `.env.e2e`:
```dotenv
E2E_SUPERUSER=admin@sach.org.sg
E2E_SUPERUSER_PASSWORD=admin123
```
4. Install browsers and run tests:
```bash
cd frontend
npx playwright install
npm run test:e2e
```

Run only the login flow spec:
```bash
cd frontend
npx playwright test tests/e2e/login.spec.ts
```

# Backend Testing (Pytest)

Run the full backend test suite:
```bash
uv run pytest backend/tests
```

Run the designation mapping tests only:
```bash
uv run pytest backend/tests/services/test_designation_mapping.py
```

# Email Integration (SMTP locally, SES in production)

This project supports two email transports and auto-selects based on env vars:

- **Local development / E2E:** SMTP via Mailcatcher (no real email sent).
- **Staging/Production:** Amazon SES API (uses the EC2 IAM role; no long‑lived keys).

## Local SMTP (Mailcatcher)

`docker-compose.override.yml` starts Mailcatcher and points the backend at it:

- `SMTP_HOST=mailcatcher`
- `SMTP_PORT=1025`
- `EMAILS_FROM_EMAIL=noreply@example.com`

View emails at:

```
http://localhost:1080
```

To force local SMTP when using `.env.template`, leave SES vars blank and set:

```
SMTP_HOST=mailcatcher
SMTP_PORT=1025
SMTP_TLS=False
SMTP_SSL=False
```

## SES in staging/production

Set these in your deployment environment (GitHub Secrets used by workflows):

- `AWS_REGION` (e.g. `ap-southeast-1`)
- `AWS_SES_SENDER_EMAIL` (verified sender, e.g. `noreply@sachduby.com`)

The backend uses SES when `AWS_REGION` + `AWS_SES_SENDER_EMAIL` are set and SMTP is not configured.
On EC2, the IAM role must allow `ses:SendEmail` / `ses:SendRawEmail`.

# Troubleshooting
If you get a package/dependency error, try to delete local volumes and rebuild images:
```bash
docker compose down -v
docker compose up -d --build
```

# Database Seeding

On normal Docker startup, the backend prestart flow runs migrations and seeds:
- core/reference data (`role`, `shiftcode`, `ward`, `ward_shiftcode`)
- the admin account from `.env`

You usually do not need to run manual seed commands for staging/production.

Manual core/reference seeding:

```bash
docker compose exec backend python app/seed_core.py
```

Use this only if you need to repair or reseed core data in an existing environment.

Admin only:

```bash
docker compose exec backend python app/seed_admin.py
```

This creates or updates the admin account from `.env`:
- `FIRST_SUPERUSER`
- `FIRST_SUPERUSER_PASSWORD`

You usually do not need this on first startup because admin bootstrap already runs automatically.

For seeding data into to the database with test data (wards, nurses, shift codes, etc.):

While docker instance is running, detach and run the following code to execute the database seeding script

```bash
docker compose exec backend python app/seed_data.py
```

`seed_data.py` is for local/demo data only. It seeds mock managers, nurses, roster periods, roster entries, requests, and notifications. Core reference data and the admin account are handled separately and are already seeded during startup.
This generates mock data on first run, the data will persist unless volumes in docker are deleted(docker compose down -v) which can be used to regenerate the seed data and start fresh

Regenerating Data:

```bash
docker compose down -v
docker compose up -d --build
docker compose exec backend python app/seed_data.py
```

# Adjusting Roster Period Dates (Local Dev)

Shift request open/close dates are computed in
`backend/app/services/roster_period_service.py`. If the request window is
already closed when you want to test editing, adjust the constants and
rebuild the period window.

What to tweak:
1. `ROSTER_CYCLE_ANCHOR` to move the roster year anchor.
2. `requestopendate` and `requestclosedate` offsets inside
   `build_roster_period_definitions()` to widen or shift the request window.

How to apply changes locally:
1. Update the constants in `backend/app/services/roster_period_service.py`.
2. Re-run the period window generation by re-seeding:
   ```bash
   docker compose exec backend python app/seed_data.py
   ```
   This refreshes roster periods based on the new definitions.

Verify in the DB:
```sql
SELECT periodid, name, startdate, enddate, requestopendate, requestclosedate, status
FROM rosterperiod
ORDER BY startdate DESC;
```
## Test Credentials

After seeding, admin, manager, nurse accounts are available:

Check the console output after seeding for the actual generated emails.

Managers: lim.weiling@sach.org.sg, manager123
Nurses: chan.meiyin@sach.org.sg, nurse123

## Testing the Algorithm

This is the full end-to-end flow to test roster generation from scratch.

### Step 1 — Seed base data (if not already done)

Make sure the database has wards, nurses, and shift codes. If you haven't already:

```bash
docker compose exec backend python app/seed_data.py
```

This creates mock managers, nurses, roster periods, and shift codes. See [Database Seeding](#database-seeding) for details. Note the ward IDs printed during seeding — you'll need one for the next step.

### Step 2 — Seed shift requests for a ward

`test_algo.py` populates shift requests for nurses in a given ward so the algorithm has something to work with:

```bash
docker compose exec backend python app/test_algo.py --ward-id 1
```

Options:
- `--ward-id` — Ward ID to generate requests for (required)
- `--mode` — `deterministic` (default), `hardcoded`, or `anonymized`

Other modes:

```bash
docker compose exec backend python app/test_algo.py --ward-id 1 --mode hardcoded
docker compose exec backend python app/test_algo.py --mode anonymized
```

**What it seeds:**
- The script targets the upcoming (or current) roster period for the ward.
- ~10% of nurses (lowest nurse IDs) receive **1 off-day request** (a non-working shift such as `DO`).
- The remaining ~90% receive **2 working shift requests** (`A`, `P`, or `N` only).
- Day assignments and shift types are fully deterministic based on each nurse's ID — results are identical on every run.
- If a request already exists for a nurse on that date, it is skipped (safe to re-run).

### Step 3 — Trigger generation from the frontend

1. Open the app at `http://localhost:5173` and log in as a manager (e.g. `lim.weiling@sach.org.sg` / `manager123`).
2. Navigate to **Nurse Manager → Roster Planning**.
3. Select the **Ward** (top-right dropdown) that you seeded in Step 2.
4. Select the **Roster Period** that matches the period seeded by `test_algo.py` (upcoming or current).
5. Choose an algorithm using the **Auto / MILP / GA** toggle:

   | Option | Behaviour |
   |--------|-----------|
   | **Auto** | Tries MILP first. If MILP fails or is unavailable, automatically falls back to GA. This is the default. |
   | **MILP** | Forces the Mixed-Integer Linear Programming solver. Produces optimal, constraint-satisfying schedules. Requires Gurobi licence (`gurobi.lic`). Will error if Gurobi is not available — does **not** fall back to GA. |
   | **GA** | Forces the Genetic Algorithm solver. Slower and heuristic but works without any external solver licence. |

6. Click **Generate Algorithm Roster**.
7. A progress bar and percentage indicator will appear while the Celery worker runs the algorithm in the background.
8. Once complete, the roster grid is populated with the generated schedule. The badge at the top-left confirms which algorithm was used (MILP or GA).

### Step 4 — Review and publish

- Edit individual cells in the grid as needed.
- Use **View Edit History** to review changes.
- When satisfied, open the menu (top-right ⋮) and click **Publish Roster** to finalise all assignments.

