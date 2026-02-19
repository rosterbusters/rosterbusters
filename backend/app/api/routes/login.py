from datetime import timedelta, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.requests import Request
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from authlib.integrations.starlette_client import OAuth
from sqlmodel import select

from app import crud
from app.api.deps import SessionDep
from app.core import security
from app.core.config import settings
from app.core.security import get_password_hash
from app.models import User

router = APIRouter()

# oauth = OAuth()
# oauth.register(
#     name="google",
#     client_id=settings.GOOGLE_CLIENT_ID,
#     client_secret=settings.GOOGLE_CLIENT_SECRET,
#     server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
#     client_kwargs={"scope": "openid email profile"},
# )


@router.get("/login/google")
async def login_google(request: Request) -> RedirectResponse:
    """Initiate Google OAuth login"""
    redirect_uri = f"{settings.BACKEND_HOST}/api/v1/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/auth/google/callback")
async def auth_google_callback(
    request: Request,
    session: SessionDep,
) -> RedirectResponse:
    """Handle Google OAuth callback"""
    try:
        token = await oauth.google.authorize_access_token(request)
        user_info = token.get("userinfo")

        if not user_info:
            raise HTTPException(status_code=400, detail="Could not get user info from Google")

        email = user_info.get("email")
        if not email:
            raise HTTPException(status_code=400, detail="Email not provided by Google")

        if settings.GOOGLE_OAUTH_ALLOWED_DOMAINS:
            email_domain = email.split("@")[1]
            allowed_domains = settings.GOOGLE_OAUTH_ALLOWED_DOMAINS.split(",")
            if email_domain not in allowed_domains:
                raise HTTPException(
                    status_code=403,
                    detail=f"Only {', '.join(allowed_domains)} email addresses are allowed",
                )

        statement = select(User).where(User.email == email)
        user = session.exec(statement).first()

        if not user:
            user = User(
                email=email,
                full_name=user_info.get("name", ""),
                hashed_password=get_password_hash(security.generate_random_password()),
                is_active=True,
                is_superuser=False,
            )
            session.add(user)
            session.commit()
            session.refresh(user)

        from app.models import Nurse, NurseManager, RBACUser, Role, UserRole

        rbac_statement = select(RBACUser).where(RBACUser.email == email)
        rbac_user = session.exec(rbac_statement).first()

        if not rbac_user:
            nurse = session.exec(select(Nurse).where(Nurse.email == email)).first()
            manager = session.exec(select(NurseManager).where(NurseManager.email == email)).first()

            if nurse or manager:
                rbac_user = RBACUser(
                    username=email.split("@")[0],
                    email=email,
                    passwordhash=get_password_hash(security.generate_random_password()),
                    nurseid=nurse.nurseid if nurse else None,
                    managerid=manager.managerid if manager else None,
                    isactive=True,
                    createdat=datetime.now(timezone.utc),
                )
                session.add(rbac_user)
                session.commit()
                session.refresh(rbac_user)

                if nurse:
                    role = session.exec(select(Role).where(Role.rolename == "Nurse")).first()
                    if role:
                        session.add(UserRole(userid=rbac_user.userid, roleid=role.roleid, isactive=True))

                if manager:
                    role = session.exec(select(Role).where(Role.rolename == "NurseManager")).first()
                    if role:
                        existing_role = session.exec(
                            select(UserRole)
                            .join(RBACUser, UserRole.userid == RBACUser.userid)
                            .where(RBACUser.managerid == manager.managerid, UserRole.wardid.is_not(None))
                        ).first()
                        session.add(UserRole(
                            userid=rbac_user.userid,
                            roleid=role.roleid,
                            wardid=existing_role.wardid if existing_role else None,
                            isactive=True,
                        ))

                session.commit()

        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = security.create_access_token(user.id, expires_delta=access_token_expires)
        redirect_url = f"{settings.FRONTEND_HOST}/auth/callback?token={access_token}"
        return RedirectResponse(url=redirect_url)

    except Exception as e:
        error_url = f"{settings.FRONTEND_HOST}/login?error={str(e)}"
        return RedirectResponse(url=error_url)


@router.post("/login/access-token")
def login_access_token(
    session: SessionDep, form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
) -> dict[str, str]:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    user = crud.authenticate(session=session, email=form_data.username, password=form_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    elif not user.isactive:
        raise HTTPException(status_code=400, detail="Inactive user")
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(user.userid, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}