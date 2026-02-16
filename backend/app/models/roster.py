"""
Roster/scheduling domain models.

- Ward: Hospital wards where nurses work
- ShiftCode: Types of shifts (Day, Night, Day Off, etc.)
- RosterPeriod: Time periods for scheduling (typically 2-week blocks)
- Roster: Actual shift assignments for nurses
- ShiftRequest: Nurse shift preferences/requests
"""

from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Optional

from sqlmodel import Field, SQLModel


class Ward(SQLModel, table=True):
    __tablename__ = "ward"

    wardid: Optional[int] = Field(default=None, primary_key=True)
    wardname: str = Field(max_length=100)
    wardtype: Optional[str] = Field(default=None, max_length=50)
    location: Optional[str] = Field(default=None, max_length=100)
    isactive: bool = Field(default=True)
    
    # Staffing requirements - AM shift
    am_total: Optional[int] = Field(default=None)
    am_rn: Optional[int] = Field(default=None)
    am_en_na_min: Optional[int] = Field(default=None)
    am_en_na_max: Optional[int] = Field(default=None)
    am_hca_min: Optional[int] = Field(default=None)
    am_hca_max: Optional[int] = Field(default=None)

    # Staffing requirements - PM shift
    pm_total: Optional[int] = Field(default=None)
    pm_rn: Optional[int] = Field(default=None)
    pm_en_na_min: Optional[int] = Field(default=None)
    pm_en_na_max: Optional[int] = Field(default=None)
    pm_hca_min: Optional[int] = Field(default=None)
    pm_hca_max: Optional[int] = Field(default=None)

    # Staffing requirements - ND (Night) shift
    nd_total: Optional[int] = Field(default=None)
    nd_rn: Optional[int] = Field(default=None)
    nd_en_na_min: Optional[int] = Field(default=None)
    nd_en_na_max: Optional[int] = Field(default=None)
    nd_hca_min: Optional[int] = Field(default=None)
    nd_hca_max: Optional[int] = Field(default=None)


class RosterPeriod(SQLModel, table=True):
    __tablename__ = "rosterperiod"

    periodid: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    startdate: date
    enddate: date
    requestopendate: date
    requestclosedate: date
    status: str = Field(default="RequestOpen", max_length=20)


class Roster(SQLModel, table=True):
    __tablename__ = "roster"

    rosterid: Optional[int] = Field(default=None, primary_key=True)
    nurseid: Optional[int] = None
    wardid: int
    periodid: int
    shiftdate: date
    shiftcode: str = Field(max_length=10)
    starttime: Optional[time] = None  # Shift start time
    endtime: Optional[time] = None    # Shift end time
    status: str = Field(default="Confirmed", max_length=20)
    assignmentmethod: str = Field(default="Manual", max_length=20)  # Manual / Auto
    assignedby: Optional[int] = None  # Manager ID if Manual, None if Auto


class NotificationQueue(SQLModel, table=True):
    __tablename__ = "notificationqueue"

    notificationid: Optional[int] = Field(default=None, primary_key=True)
    recipienttype: str = Field(max_length=20)  # Nurse / Manager
    recipientid: int
    notificationtype: str = Field(max_length=50)  # LeaveApproval / LeaveReminder / ShiftUpdate / SwapRequest
    channel: str = Field(max_length=20)  # WhatsApp / Email / Both
    priority: str = Field(default="Normal", max_length=20)  # Urgent / Normal / Low

    subject: Optional[str] = Field(default=None, max_length=200)
    messagebody: str

    relatedentitytype: Optional[str] = Field(default=None, max_length=50)
    relatedentityid: Optional[int] = None

    status: str = Field(default="Pending", max_length=20)  # Pending / Sent / Failed / Read
    scheduledat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    sentat: Optional[datetime] = None
    readat: Optional[datetime] = None
    failurereason: Optional[str] = None
    retrycount: int = Field(default=0)

    createdat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))



class RosterPeriodPublic(SQLModel):
    periodid: int
    name: str
    startdate: date
    enddate: date
    status: str


class LeaveRequest(SQLModel, table=True):
    __tablename__ = "leaverequest"

    leaveid: Optional[int] = Field(default=None, primary_key=True)
    nurseid: int
    startdate: date
    enddate: date
    leavetype: str = Field(max_length=10)  # AL / MC / URG / UPL / CL
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
