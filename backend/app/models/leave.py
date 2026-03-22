"""
Leave request models.

- LeaveRequest: Nurse leave requests (annual leave, medical, etc.)
- LeaveRequestPublic: API response schema
- LeaveRequestUpdate: API update schema
"""

from datetime import date, datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class LeaveRequest(SQLModel, table=True):
    __tablename__ = "leaverequest"

    leaveid: Optional[int] = Field(default=None, primary_key=True)
    nurseid: int
    startdate: date
    enddate: date
    leavetype: str = Field(max_length=10)  # AL / MC / CCL / ML / EML / Mar / FCL / SPL / CL / BDL / HOL / SD / FD
    leavecategory: str = Field(default="PreApproved", max_length=20)  # PreApproved / Urgent / MedicalCertificate
    submittedduringperiod: str = Field(default="BeforeRoster", max_length=20)  # BeforeRoster / AfterFinalization
    requiresreplacement: bool = Field(default=False)
    reason: Optional[str] = None
    requestedat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Approval workflow
    status: str = Field(default="Pending", max_length=20)  # Pending/Approved/Rejected/Cancelled
    approvedby: Optional[int] = None
    approvedat: Optional[datetime] = None
    rejectionreason: Optional[str] = None
    notificationsent: bool = Field(default=False)
    impactsroster: bool = Field(default=False)
    attachmenturl: Optional[str] = Field(default=None, max_length=500)


class LeaveRequestPublic(SQLModel):
    leaveid: int
    nurseid: int
    startdate: date
    enddate: date
    leavetype: str
    leavecategory: str
    status: str
    reason: Optional[str] = None
    requestedat: datetime


class LeaveRequestCreate(SQLModel):
    nurseid: Optional[int] = None
    startdate: date
    enddate: date
    leavetype: str
    leavecategory: str = "PreApproved"
    submittedduringperiod: str = "BeforeRoster"
    requiresreplacement: bool = False
    reason: Optional[str] = None
    attachmenturl: Optional[str] = None


class LeaveRequestUpdate(SQLModel):
    leavetype: Optional[str] = None
    startdate: Optional[date] = None
    enddate: Optional[date] = None
