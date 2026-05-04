"""
Roster/scheduling domain models.

- Ward: Hospital wards where nurses work
- RosterPeriod: Time periods for scheduling (typically 2-week blocks)
- Roster: Actual shift assignments for nurses
- NotificationQueue: Queued notifications for nurses/managers
"""

from datetime import date, datetime, time, timezone
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.enums import NotificationType


class Ward(SQLModel, table=True):
    __tablename__ = "ward"

    wardid: Optional[int] = Field(default=None, primary_key=True)
    wardname: str = Field(max_length=100)
    wardtype: Optional[str] = Field(default=None, max_length=50)
    wardhourtype: str = Field(default="8_HOURS", max_length=20)
    location: Optional[str] = Field(default=None, max_length=100)
    managerid: Optional[int] = Field(default=None)
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
    nd_rn_max: Optional[int] = Field(default=None)
    nd_en_na_min: Optional[int] = Field(default=None)
    nd_en_na_max: Optional[int] = Field(default=None)
    nd_hca_min: Optional[int] = Field(default=None)
    nd_hca_max: Optional[int] = Field(default=None)

    # Full staffing guidelines stored as JSON (set by nurse managers via the roster UI)
    staffing_json: Optional[str] = Field(default=None)


class RosterPeriod(SQLModel, table=True):
    __tablename__ = "rosterperiod"

    periodid: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    startdate: date
    enddate: date
    requestopendate: date
    requestclosedate: date
    status: str = Field(default="RequestOpen", max_length=20)


class NursePeriodConstraint(SQLModel, table=True):
    __tablename__ = "nurseperiodconstraint"

    constraintid: Optional[int] = Field(default=None, primary_key=True)
    nurseid: int = Field(foreign_key="nurse.nurseid")
    periodid: int = Field(foreign_key="rosterperiod.periodid")
    constrainttype: str = Field(max_length=30)
    value: str = Field(default="true", max_length=50)
    reason: Optional[str] = Field(default=None)
    createdat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Roster(SQLModel, table=True):
    __tablename__ = "roster"

    rosterid: Optional[int] = Field(default=None, primary_key=True)
    nurseid: Optional[int] = None
    wardid: int
    periodid: int
    shiftdate: date
    shiftcode: str = Field(max_length=10)
    starttime: Optional[time] = None
    endtime: Optional[time] = None
    status: str = Field(default="Confirmed", max_length=20)
    assignmentmethod: str = Field(default="Manual", max_length=20)  # Manual / Auto
    assignedby: Optional[int] = None  # Manager ID if Manual, None if Auto
    comment: Optional[str] = Field(default=None)


class NotificationQueue(SQLModel, table=True):
    __tablename__ = "notificationqueue"

    notificationid: Optional[int] = Field(default=None, primary_key=True)
    recipienttype: str = Field(max_length=20)  # Nurse / Manager
    recipientid: int
    notificationtype: str = Field(max_length=50)  # stores NotificationType.value
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


class NotificationPreference(SQLModel, table=True):
    """
    Per-user email notification opt-out preferences.

    A row represents a user's explicit preference for a notification type.
    If no row exists for a (recipienttype, recipientid, notificationtype) triple,
    the default is email_enabled=True (always-on).

    Only a specific subset of notification types are toggleable (see Settings page);
    all other types are implicitly always-on and will never have rows here.
    """
    __tablename__ = "notificationpreference"

    preferenceid: Optional[int] = Field(default=None, primary_key=True)
    recipienttype: str = Field(max_length=20)   # "Nurse" | "NurseManager"
    recipientid: int
    notificationtype: str = Field(max_length=50)  # NotificationType.value
    email_enabled: bool = Field(default=True)
    updatedat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RosterPeriodPublic(SQLModel):
    periodid: int
    name: str
    startdate: date
    enddate: date
    requestopendate: date
    requestclosedate: date
    planninglockdate: Optional[date] = None
    status: str


class RosterPeriodWindowPublic(SQLModel):
    current_period: Optional[RosterPeriodPublic] = None
    upcoming_period: Optional[RosterPeriodPublic] = None
    request_open_period: Optional[RosterPeriodPublic] = None


class NursePeriodConstraintPublic(SQLModel):
    constraintid: int
    nurseid: int
    periodid: int
    constrainttype: str
    value: str
    reason: Optional[str] = None


class RosterChangeLog(SQLModel, table=True):
    __tablename__ = "rosterchangelog"

    changeid: Optional[int] = Field(default=None, primary_key=True)
    rosterid: Optional[int] = Field(default=None)
    changedbymanagerid: Optional[int] = Field(default=None)
    changedat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    changetype: str = Field(max_length=20)

    # Before values
    oldnurseid: Optional[int] = Field(default=None)
    oldshiftcode: Optional[str] = Field(default=None, max_length=10)
    oldstarttime: Optional[time] = Field(default=None)
    oldendtime: Optional[time] = Field(default=None)
    oldstatus: Optional[str] = Field(default=None, max_length=20)

    # After values
    newnurseid: Optional[int] = Field(default=None)
    newshiftcode: Optional[str] = Field(default=None, max_length=10)
    newstarttime: Optional[time] = Field(default=None)
    newendtime: Optional[time] = Field(default=None)
    newstatus: Optional[str] = Field(default=None, max_length=20)

    reason: Optional[str] = Field(default=None)
    changesource: str = Field(default="Manual", max_length=20)
    notificationtriggered: bool = Field(default=False)
    isreplacementchange: bool = Field(default=False)
    replacementreason: Optional[str] = Field(default=None, max_length=20)
    replacednurseid: Optional[int] = Field(default=None)
    replacementnurseid: Optional[int] = Field(default=None)
    isexternalreplacement: bool = Field(default=False)


class RosterChangeLogPublic(SQLModel):
    """API response shape – includes denormalized display fields."""
    changeid: int
    rosterid: Optional[int]
    changedat: datetime
    changetype: str
    oldshiftcode: Optional[str]
    newshiftcode: Optional[str]
    reason: Optional[str]
    changesource: str
    shiftdate: Optional[date]
    nursename: str
    modifiedby: str
