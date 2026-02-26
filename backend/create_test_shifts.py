from datetime import date, timedelta
from app.core.db import engine
from app.models import Roster, Nurse, ShiftCode, RosterPeriod
from sqlmodel import Session, select

with Session(engine) as session:
    # Get Jason Porter (nurse ID 1)
    nurse = session.exec(select(Nurse).where(Nurse.nurseid == 1)).first()
    
    # Get current period
    period = session.exec(select(RosterPeriod).where(RosterPeriod.periodid == 1)).first()
    
    # Get shift codes
    shift_a = session.exec(select(ShiftCode).where(ShiftCode.shiftcode == 'A')).first()
    shift_p = session.exec(select(ShiftCode).where(ShiftCode.shiftcode == 'P')).first()
    shift_n = session.exec(select(ShiftCode).where(ShiftCode.shiftcode == 'N')).first()
    
    # Delete existing entries for these dates
    today = date(2026, 2, 11)
    for i in range(7):
        shift_date = today + timedelta(days=i)
        existing = session.exec(
            select(Roster).where(
                Roster.nurseid == nurse.nurseid,
                Roster.shiftdate == shift_date
            )
        ).first()
        if existing:
            session.delete(existing)
    
    # Create roster entries
    shifts = [
        (today, shift_a.shiftcodeid, 'Confirmed'),
        (today + timedelta(days=1), shift_p.shiftcodeid, 'Confirmed'),
        (today + timedelta(days=2), shift_n.shiftcodeid, 'Confirmed'),
        (today + timedelta(days=3), shift_a.shiftcodeid, 'Confirmed'),
        (today + timedelta(days=4), shift_p.shiftcodeid, 'Pending'),
        (today + timedelta(days=5), shift_a.shiftcodeid, 'Confirmed'),
        (today + timedelta(days=6), shift_n.shiftcodeid, 'Confirmed'),
    ]
    
    for shift_date, shift_code_id, status in shifts:
        roster = Roster(
            nurseid=nurse.nurseid,
            periodid=period.periodid,
            shiftdate=shift_date,
            shiftcodeid=shift_code_id,
            status=status
        )
        session.add(roster)
    
    session.commit()
    print(f'Created 7 roster entries for {nurse.name}')
    print(f'Today ({today}): AM Shift (0700-1530)')
    print('Login as jason.porter@sach.org.sg to test!')
