from fastapi import APIRouter

from app.api.routes import admin, login, users, utils, shifts, wards, run_rostering, home, notifications

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(home.router, prefix="/home", tags=["home"])
api_router.include_router(notifications.router)
api_router.include_router(shifts.router)
api_router.include_router(wards.router)
api_router.include_router(admin.router)

api_router.include_router(run_rostering.router, prefix="/roster", tags=["rostering"])
