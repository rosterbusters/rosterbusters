from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel
from sqlalchemy import Column, Integer, String, Boolean, DateTime

# MODIFIED: Explicitly set table name to "User" and cleaned up columns
class RBACUser(SQLModel, table=True):
    __tablename__ = "User"
    
    userid: Optional[int] = Field(default=None, sa_column=Column("userid", Integer, primary_key=True))
    username: str = Field(sa_column=Column("username", String))
    email: str = Field(sa_column=Column("email", String))
    passwordhash: str = Field(sa_column=Column("passwordhash", String))
    nurseid: Optional[int] = Field(default=None, sa_column=Column("nurseid", Integer))
    managerid: Optional[int] = Field(default=None, sa_column=Column("managerid", Integer))
    isactive: bool = Field(default=True, sa_column=Column("isactive", Boolean))
    lastlogin: Optional[datetime] = Field(default=None, sa_column=Column("lastlogin", DateTime(timezone=True)))
    createdat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column("createdat", DateTime(timezone=True)))

class Nurse(SQLModel, table=True):
    __tablename__ = "Nurse"
    
    NurseID: Optional[int] = Field(default=None, primary_key=True)
    Name: str = Field(max_length=100)
    Designation: str = Field(max_length=50)
    Email: str = Field(max_length=100)
    ContactNumber: str = Field(max_length=20)
    WardID: int
    EmploymentType: str = Field(max_length=20)
    IsActive: bool = Field(default=True)

class NurseManager(SQLModel, table=True):
    __tablename__ = "NurseManager"
    
    ManagerID: Optional[int] = Field(default=None, primary_key=True)
    Name: str = Field(max_length=100)
    Email: str = Field(max_length=100)
    ContactNumber: str = Field(max_length=20)
    IsActive: bool = Field(default=True)

class Role(SQLModel, table=True):
    __tablename__ = "Role"
    
    RoleID: Optional[int] = Field(default=None, primary_key=True)
    RoleName: str = Field(max_length=50)
    DisplayName: str = Field(max_length=100)
    IsActive: bool = Field(default=True)

class UserRole(SQLModel, table=True):
    __tablename__ = "UserRole"
    
    UserRoleID: Optional[int] = Field(default=None, primary_key=True)
    UserID: int
    RoleID: int
    WardID: Optional[int] = None
    IsActive: bool = Field(default=True)
    AssignedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))