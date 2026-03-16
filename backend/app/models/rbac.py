"""
RBAC (Role-Based Access Control) models.

- RBACUser: System users with roles (table: User)
- Nurse: Nurse staff records
- NurseManager: Nurse manager records
- Role: System roles (Admin, NurseManager, Nurse)
- UserRole: User-role assignments
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlmodel import Field, SQLModel


class RBACUser(SQLModel, table=True):
    __tablename__ = "User"

    userid: Optional[int] = Field(
        default=None, sa_column=Column("userid", Integer, primary_key=True)
    )
    username: str = Field(sa_column=Column("username", String))
    email: Optional[str] = Field(
        default=None, sa_column=Column("email", String)
    )
    passwordhash: str = Field(sa_column=Column("passwordhash", String))
    nurseid: Optional[int] = Field(
        default=None, sa_column=Column("nurseid", Integer)
    )
    managerid: Optional[int] = Field(
        default=None, sa_column=Column("managerid", Integer)
    )
    isactive: bool = Field(default=True, sa_column=Column("isactive", Boolean))
    must_change_password: bool = Field(
        default=False,
        sa_column=Column("mustchangepassword", Boolean, server_default="false"),
    )
    lastlogin: Optional[datetime] = Field(
        default=None, sa_column=Column("lastlogin", DateTime(timezone=True))
    )
    createdat: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column("createdat", DateTime(timezone=True)),
    )
    password_reset_token: Optional[str] = Field(
        default=None, sa_column=Column("password_reset_token", String(128), nullable=True)
    )
    password_reset_token_expires_at: Optional[datetime] = Field(
        default=None, sa_column=Column("password_reset_token_expires_at", DateTime(timezone=True), nullable=True)
    )


# Public response model for RBACUser (for API responses)
class RBACUserPublic(SQLModel):
    userid: int
    username: str
    email: Optional[str] = None
    nurseid: Optional[int] = None
    managerid: Optional[int] = None
    isactive: bool
    is_superuser: bool = False
    must_change_password: bool = False
    name: Optional[str] = None
    wardid: Optional[int] = None


class Nurse(SQLModel, table=True):
    __tablename__ = "nurse"
    nurseid: int | None = Field(default=None, primary_key=True)
    name: str
    employeeid: str | None = Field(default=None, sa_column=Column("employeeid", String))
    designation: str
    email: str
    contactnumber: str
    wardid: int | None
    employmenttype: str
    isactive: bool


class NurseManager(SQLModel, table=True):
    __tablename__ = "nursemanager"

    managerid: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    employeeid: Optional[str] = Field(
        default=None, sa_column=Column("employeeid", String)
    )
    email: str = Field(max_length=100)
    contactnumber: str = Field(max_length=20)
    isactive: bool = Field(default=True)
    createdat: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column("createdat", DateTime(timezone=True)),
    )


class Role(SQLModel, table=True):
    __tablename__ = "role"

    roleid: Optional[int] = Field(default=None, primary_key=True)
    rolename: str = Field(max_length=50)
    displayname: str = Field(max_length=100)
    isactive: bool = Field(default=True)
    createdat: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column("createdat", DateTime(timezone=True)),
    )


class UserRole(SQLModel, table=True):
    __tablename__ = "userrole"

    userroleid: Optional[int] = Field(default=None, primary_key=True)
    userid: int
    roleid: int
    wardid: Optional[int] = None
    isactive: bool = Field(default=True)
    assignedat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class NursePublic(SQLModel):
      nurseid: int
      name: str
      employeeid: str | None = None
      designation: str
      email: str
      wardid: int | None = None
      employmenttype: str
      isactive: bool
