# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

RosterBusters is a nurse scheduling/rostering application with a FastAPI backend and React frontend, containerized with Docker.

## Development Commands

### Start Development Environment
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml watch
```

### Backend
```bash
# Run tests (with stack running)
docker compose exec backend bash scripts/tests-start.sh

# Run single test
docker compose exec backend bash scripts/tests-start.sh -x -k "test_name"

# Create database migration after model changes
docker compose exec backend alembic revision --autogenerate -m "Description"
docker compose exec backend alembic upgrade head

# Seed database with test data
docker compose exec backend python app/seed_data.py

# Local backend without Docker
cd backend && uv sync && source .venv/bin/activate
fastapi dev app/main.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev           # Start dev server with route watching
npm run generate-client  # Regenerate OpenAPI client after backend changes
npm run lint          # Run Biome linter
```

### Linting
```bash
uv run pre-commit run --all-files  # Run all pre-commit hooks
```

## Architecture

### Backend (`backend/app/`)

**Models** (`models/`): SQLModel classes organized by domain:
- `web.py` - User authentication (table: `web_user`), Items, JWT tokens
- `rbac.py` - Role-based access: Nurse, NurseManager, Role, UserRole
- `roster.py` - Scheduling: Ward, ShiftCode, Roster, RosterPeriod, LeaveRequest, ShiftRequest
- `__init__.py` - Re-exports all models for `from app.models import ...`

**API Routes** (`api/routes/`): FastAPI routers, each file defines a router with prefix/tags. Register new routers in `api/main.py`.

**Dependencies** (`api/deps.py`): Injectable dependencies:
- `SessionDep` - Database session
- `CurrentUser` - Authenticated user from JWT
- `TokenDep` - Raw JWT token

**Configuration** (`core/config.py`): Pydantic Settings loading from `../.env`

**CRUD** (`crud.py`): Database operations for User/Item models

### Frontend (`frontend/src/`)

**Routing**: TanStack Router with file-based routing in `routes/`. Run `npm run dev` to auto-generate routes.

**API Client** (`client/`): Auto-generated from OpenAPI schema. Regenerate with `npm run generate-client` after backend changes.

**UI**: Chakra UI v3 + Tailwind CSS + Radix UI primitives

## Adding a New API Endpoint

1. **Model** (if needed): Add SQLModel classes to appropriate file in `backend/app/models/`, export in `__init__.py`
2. **Migration**: `alembic revision --autogenerate -m "Add X"` then `alembic upgrade head`
3. **Route**: Create router in `backend/app/api/routes/yourroute.py`:
   ```python
   from fastapi import APIRouter
   from app.api.deps import CurrentUser, SessionDep
   router = APIRouter(prefix="/yourprefix", tags=["yourtag"])
   ```
4. **Register**: Add to `backend/app/api/main.py`: `api_router.include_router(yourroute.router)`
5. **Client**: Run `./scripts/generate-client.sh` or `npm run generate-client` in frontend

## URLs (Development)

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Adminer (DB): http://localhost:8080
- MailCatcher: http://localhost:1080
