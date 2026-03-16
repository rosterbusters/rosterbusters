from fastapi import APIRouter
from app.api.routes.password_reset import router as password_reset_router
from app.api.routes import admin, leave, login, notifications, run_rostering, shifts, users, utils, wards

api_router = APIRouter()
api_router.include_router(password_reset_router, prefix="/auth", tags=["password reset"])
api_router.include_router(admin.router)
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(shifts.home_router)
api_router.include_router(shifts.router)
api_router.include_router(leave.router)
api_router.include_router(notifications.router)
api_router.include_router(wards.router)

api_router.include_router(run_rostering.router, prefix="/roster", tags=["rostering"])
