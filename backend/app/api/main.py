from fastapi import APIRouter

from app.api.routes import admin, items, login, private, users, utils, shifts, wards, run_rostering, home, notifications
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(home.router, prefix="/home", tags=["home"])
api_router.include_router(notifications.router)
api_router.include_router(shifts.router)
api_router.include_router(wards.router)
api_router.include_router(admin.router)

api_router.include_router(run_rostering.router, prefix="/roster", tags=["rostering"])

if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
