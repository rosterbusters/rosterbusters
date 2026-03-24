# Playwright E2E Skills (Frontend)

This guide covers how to add Playwright E2E tests and run them consistently.

## Where Tests Live
- Add tests in `frontend/tests/e2e/`.
- Keep each test self-contained (create and clean up its own data).
- Prefer unique IDs with a suffix (`Date.now().toString().slice(-6)`).

## Recommended Test Patterns
- Use API helpers for setup/cleanup (create users, fetch users, delete users).
- Use the UI only for the behavior under test.
- Always clean up created data in `finally`.
- Always delete users created by the test (even on failure). Track created usernames/IDs and remove them in `finally`.
- Keep checks deterministic (avoid timing-based flakiness).
- Before writing assertions, confirm the current implementation details that affect expectations
  (for example: username generation rules, role mapping logic, import filters).
- Mirror the production logic in test data/expectations (reuse the same derivation rules where possible).
- If behavior recently changed, update existing tests first and then add new ones.
- For staff imports, wait for ward options to be attached before uploading the workbook; `<option>` elements are not visible even when loaded, so prefer `toBeAttached()`.
- When selecting wards for import tests, pick ones with `isactive === true` to match the UI's active-ward filter used during import parsing.
- When a new feature likely needs E2E coverage, explicitly prompt the requester to create or approve a Playwright test for it.
- Always explain code changes in plain language and explicitly list what changed in each file touched.
- When there are new Alembic migrations, remind to run `docker exec <backend-container> alembic upgrade head` so the DB schema stays in sync.

## Running E2E Tests
The Playwright config runs the Vite dev server automatically and expects a backend on `VITE_API_URL`.

From `frontend/`:
```bash
npm run test:e2e
```

To run a single spec:
```bash
npm run test:e2e -- admin-import.spec.ts
```

To open the UI runner:
```bash
npm run test:e2e:ui
```

## Required Environment
Set admin credentials so API setup works:
- `E2E_SUPERUSER`
- `E2E_SUPERUSER_PASSWORD`

Optional:
- `VITE_API_URL` (defaults to `http://127.0.0.1:8000`)

Environment files are loaded in this order:
1. `.env`
2. `frontend/.env`
3. `.env.e2e`
4. `.env.e2e.local` (if present)

## Backend Expectations
- Backend must be running and reachable at `VITE_API_URL`.
- Wards should exist and include importable names (see `frontend/tests/e2e/admin-import.spec.ts`).

## Useful Debug Tips
- Use `await expect(page.getByTestId("toast"))` for error confirmation.
- Add `page.pause()` locally to debug a step.
- Run `npm run test:e2e:debug` for step-by-step execution.
