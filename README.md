<img width="1080" height="324" alt="Banners" src="https://github.com/user-attachments/assets/c1ac96e4-8c46-4763-bcaa-9b008f642681" />


# Setup
1. Place .env file in root directory
2. Place google_auth_credentials.json into the backend/
3. docker-compose up

# Troubleshooting
If you get a package/dependency error, try to delete local volumes and rebuild images:
```bash
docker compose down -v
docker compose up --build
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
docker compose up --build -d
docker compose exec backend python app/seed_data.py
```
## Test Credentials

After seeding, admin, manager, nurse accounts are available:

Check the console output after seeding for the actual generated emails.

Managers: lim.weiling@sach.org.sg, manager123
Nurses: chan.meiyin@sach.org.sg, nurse123

