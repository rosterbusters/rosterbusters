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
    __tablename__ = "nurse"
    nurseid: int | None = Field(default=None, primary_key=True) 
    name: str
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
    email: str = Field(max_length=100)
    contactnumber: str = Field(max_length=20)
    isactive: bool = Field(default=True)
    createdat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column("createdat", DateTime(timezone=True)))

class Role(SQLModel, table=True):
    __tablename__ = "role"
    
    roleid: Optional[int] = Field(default=None, primary_key=True)
    rolename: str = Field(max_length=50)
    displayname: str = Field(max_length=100)
    isactive: bool = Field(default=True)
    createdat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column("createdat", DateTime(timezone=True)))

class UserRole(SQLModel, table=True):
    __tablename__ = "userrole"
    
    userroleid: Optional[int] = Field(default=None, primary_key=True)
    userid: int
    roleid: int
    wardid: Optional[int] = None
    isactive: bool = Field(default=True)
    assignedat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))