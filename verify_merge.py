import ast, pathlib, sys

root = pathlib.Path("backend")
app_root = pathlib.Path("backend/app")

print("=== CHECK 1: No conflict markers ===")
conflict_files = []
for f in root.rglob("*"):
    if f.is_file() and f.suffix in (".py", ".ts", ".tsx", ".html"):
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
            if "<<<<<<" in text or ">>>>>>>" in text:
                conflict_files.append(str(f))
        except Exception:
            pass
if conflict_files:
    print("FAIL - conflict markers in:", conflict_files)
    sys.exit(1)
print("PASS - no conflict markers")

print()
print("=== CHECK 2: All Python files parse ===")
py_files = list(app_root.rglob("*.py"))
errors = []
for f in py_files:
    try:
        ast.parse(f.read_text(encoding="utf-8"))
    except SyntaxError as e:
        errors.append(f"{f}: {e}")
if errors:
    print("FAIL:", errors)
    sys.exit(1)
print(f"PASS - {len(py_files)} files clean")

print()
print("=== CHECK 3: Enum correctness ===")
enums_text = pathlib.Path("backend/app/models/enums.py").read_text()
assert "SHIFT_REQUEST_PERIOD_CLOSING_SOON" in enums_text, "Missing SHIFT_REQUEST_PERIOD_CLOSING_SOON"
assert "SHIFT_REQUEST_PERIOD_CLOSED" not in enums_text, "Old SHIFT_REQUEST_PERIOD_CLOSED still present"
print("PASS - enum has CLOSING_SOON, not CLOSED")

print()
print("=== CHECK 4: seed_data uses correct enum ===")
seed_text = pathlib.Path("backend/app/seed_data.py").read_text()
assert "SHIFT_REQUEST_PERIOD_CLOSING_SOON" in seed_text, "seed_data missing CLOSING_SOON"
assert "SHIFT_REQUEST_PERIOD_CLOSED" not in seed_text, "seed_data still has CLOSED"
print("PASS - seed_data uses CLOSING_SOON")

print()
print("=== CHECK 5: get_email_enabled + BackgroundTasks in both route files ===")
shifts_text = pathlib.Path("backend/app/api/routes/shifts.py").read_text()
rostering_text = pathlib.Path("backend/app/api/routes/run_rostering.py").read_text()
assert "get_email_enabled" in shifts_text, "Missing in shifts.py"
assert "background_tasks.add_task" in shifts_text, "Missing add_task in shifts.py"
assert "get_email_enabled" in rostering_text, "Missing in run_rostering.py"
assert "background_tasks.add_task" in rostering_text, "Missing add_task in run_rostering.py"
print("PASS - preference guard + background tasks in both files")

print()
print("=== CHECK 6: Key new files exist ===")
required = [
    "backend/app/alembic/versions/s1t2u3v4w5x6_add_notificationpreference_table.py",
    "backend/app/models/notification_models.py",
    "backend/app/api/routes/notifications.py",
    "frontend/src/routes/nurse-manager/settings.tsx",
    "frontend/src/routes/ward-staff/settings.tsx",
]
for path in required:
    assert pathlib.Path(path).exists(), f"Missing: {path}"
print("PASS - all key files present")

print()
print("=== CHECK 7: utils.py has both sets of additions ===")
utils_text = pathlib.Path("backend/app/utils.py").read_text()
assert "_email_verification_key" in utils_text, "Missing main email verification helper"
assert "generate_shift_request_period_closing_soon_email" in utils_text, "Missing closing soon email fn"
assert "generate_hris_portal_closing_soon_email" in utils_text, "Missing HRIS email fn"
print("PASS - utils.py has both main verification improvements and new email generators")

print()
print("=== CHECK 8: No BOM in Python files ===")
bom = b"\xef\xbb\xbf"
bom_files = [str(f) for f in root.rglob("*.py") if f.read_bytes()[:3] == bom]
if bom_files:
    print("FAIL - BOM found in:", bom_files)
    sys.exit(1)
print("PASS - no BOM in any Python file")

print()
print("=== CHECK 9: Branch is ahead of main, not behind ===")
import subprocess
result = subprocess.run(
    ["git", "log", "--oneline", "aaron-b..origin/main"],
    capture_output=True, text=True
)
behind = [l for l in result.stdout.strip().splitlines() if l]
if behind:
    print(f"FAIL - still {len(behind)} commits behind main")
    sys.exit(1)
result2 = subprocess.run(
    ["git", "log", "--oneline", "origin/main..aaron-b"],
    capture_output=True, text=True
)
ahead = [l for l in result2.stdout.strip().splitlines() if l]
print(f"PASS - 0 behind, {len(ahead)} ahead of main: {[c.split()[0] for c in ahead]}")

print()
print("============================================")
print("ALL CHECKS PASSED. Branch is ready for PR.")
print("============================================")
