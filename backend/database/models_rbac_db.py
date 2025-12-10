from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel

class RBACUser(SQLModel, table=True):
    __tablename__ = "User"
    __table_args__ = {'extend_existing': True}
    
    UserID: Optional[int] = Field(default=None, primary_key=True)
    Username: str = Field(max_length=100)
    Email: str = Field(max_length=100)
    PasswordHash: str = Field(max_length=255)
    NurseID: Optional[int] = None
    ManagerID: Optional[int] = None
    IsActive: bool = Field(default=True)
    LastLogin: Optional[datetime] = None
    CreatedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

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

class Permission(SQLModel, table=True):
    __tablename__ = "Permission"
    __table_args__ = {'extend_existing': True}
    
    PermissionID: Optional[int] = Field(default=None, primary_key=True)
    PermissionName: str = Field(max_length=100)
    Resource: str = Field(max_length=50)
    Action: str = Field(max_length=50)

class RolePermission(SQLModel, table=True):
    __tablename__ = "RolePermission"
    __table_args__ = {'extend_existing': True}
    
    RolePermissionID: Optional[int] = Field(default=None, primary_key=True)
    RoleID: int
    PermissionID: int

class Ward(SQLModel, table=True):
    __tablename__ = "Ward"
    __table_args__ = {'extend_existing': True}
    
    WardID: Optional[int] = Field(default=None, primary_key=True)
    WardName: str = Field(max_length=100)
    WardType: str = Field(max_length=50)
    Campus: str = Field(max_length=50)
    IsActive: bool = Field(default=True)

class RosterPeriod(SQLModel, table=True):
    __tablename__ = "RosterPeriod"
    __table_args__ = {'extend_existing': True}
    
    PeriodID: Optional[int] = Field(default=None, primary_key=True)
    StartDate: datetime
    EndDate: datetime
    Status: str = Field(max_length=20)
    CreatedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))