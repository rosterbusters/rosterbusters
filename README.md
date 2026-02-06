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

For seeding data into to the database with test data (wards, nurses, shift codes, etc.):

While docker instance is running, detach and run the following code to execute the database seeding script

```bash
docker compose exec backend python app/seed_data.py
```
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

## Development vs Production

### Local Development (Current Setup)
- Uses Docker PostgreSQL container
- Database port exposed: `localhost:5432`
- Direct port access to all services
- No SSL/HTTPS

### Production Deployment
Uses separate `docker-compose.prod.yml` with:
- AWS RDS PostgreSQL
- Traefik reverse proxy with SSL
- Domain-based routing
- No exposed ports (everything via Traefik)

To deploy to production:

```bash
# Copy production environment file
cp .env.prod .env

# Deploy with production overrides
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```
