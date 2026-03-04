
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Optional

from sqlmodel import Field, SQLModel

class ShiftCode(SQLModel, table=True):
    __tablename__ = "shiftcode"

    shiftcode: str = Field(primary_key=True, max_length=10)
    description: str = Field(max_length=100)
    isworking: bool = Field(default=True)
    defaultstart: Optional[time] = None
    defaultend: Optional[time] = None
    shiftdurationhours: Optional[Decimal] = None

class ShiftCodePublic(SQLModel):
    shiftcode: str
    description: str
    isworking: bool
    shiftdurationhours: Optional[float] = None
    defaultstart: Optional[time] = None
    defaultend: Optional[time] = None

class WardShiftCode(SQLModel, table=True):
    __tablename__ = "ward_shiftcode"

    wardid: int = Field(foreign_key="ward.wardid", primary_key=True)
    shiftcode: str = Field(foreign_key="shiftcode.shiftcode", primary_key=True, max_length=10)

class ShiftRequest(SQLModel, table=True):
    __tablename__ = "shiftrequest"

    requestid: Optional[int] = Field(default=None, primary_key=True)
    nurseid: int
    periodid: int
    preferreddate: date
    preferredshifttype: str = Field(max_length=10)  # References ShiftCode
    requestnumber: int = Field(default=1)  # 1, 2, or 3
    reason: Optional[str] = None
    priority: int = Field(default=1)  # 1-5, higher = more important
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Approval workflow
    status: str = Field(default="Pending", max_length=20)  # Pending/Approved/Rejected/Cancelled
    reviewedby: Optional[int] = None
    reviewedat: Optional[datetime] = None
    rejectionreason: Optional[str] = None
    notificationsent: bool = Field(default=False)

class ShiftRequestCreate(SQLModel):
    periodid: int
    preferreddate: date
    preferredshifttype: str
    reason: str | None = None
    priority: int = 1

class ShiftRequestPublic(SQLModel):
    requestid: int
    nurseid: int
    periodid: int
    preferreddate: date
    preferredshifttype: str
    requestnumber: int
    reason: str | None
    priority: int
    status: str

class ShiftRequestUpdate(SQLModel):
    preferredshifttype: Optional[str] = None
    preferreddate: Optional[date] = None

class ShiftRequestReview(SQLModel):
    status: str  # "Approved" or "Rejected"
    rejectionreason: Optional[str] = None

