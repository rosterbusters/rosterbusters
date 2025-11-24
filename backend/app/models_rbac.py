from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel
from sqlalchemy import Column

class RBACUser(SQLModel, table=True):
    __tablename__ = "User"
    __table_args__ = {'extend_existing': True}
    
    userid: Optional[int] = Field(default=None, primary_key=True, sa_column=Column("userid"))
    username: str = Field(sa_column=Column("username"))
    email: str = Field(sa_column=Column("email"))
    passwordhash: str = Field(sa_column=Column("passwordhash"))
    nurseid: Optional[int] = Field(default=None, sa_column=Column("nurseid"))
    managerid: Optional[int] = Field(default=None, sa_column=Column("managerid"))
    isactive: bool = Field(default=True, sa_column=Column("isactive"))
    lastlogin: Optional[datetime] = Field(default=None, sa_column=Column("lastlogin"))
    createdat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column("createdat"))

class Nurse(SQLModel, table=True):
    __tablename__ = "Nurse"
    __table_args__ = {'extend_existing': True}
    
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
    __table_args__ = {'extend_existing': True}
    
    ManagerID: Optional[int] = Field(default=None, primary_key=True)
    Name: str = Field(max_length=100)
    Email: str = Field(max_length=100)
    ContactNumber: str = Field(max_length=20)
    IsActive: bool = Field(default=True)

class Role(SQLModel, table=True):
    __tablename__ = "Role"
    __table_args__ = {'extend_existing': True}
    
    RoleID: Optional[int] = Field(default=None, primary_key=True)
    RoleName: str = Field(max_length=50)
    DisplayName: str = Field(max_length=100)
    IsActive: bool = Field(default=True)

class UserRole(SQLModel, table=True):
    __tablename__ = "UserRole"
    __table_args__ = {'extend_existing': True}
    
    UserRoleID: Optional[int] = Field(default=None, primary_key=True)
    UserID: int
    RoleID: int
    WardID: Optional[int] = None
    IsActive: bool = Field(default=True)
    AssignedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))