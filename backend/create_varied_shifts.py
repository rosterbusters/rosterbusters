import sys
from datetime import date, timedelta, time
from sqlmodel import Session, select
from app.core.db import engine

# Import models
from app.models.rbac import Nurse
from app.models.roster import Roster, ShiftCode, Ward, RosterPeriod

def create_varied_roster():
    with Session(engine) as session:
        print("🚀 STARTING: Generating varied shift data for testing...")

        # 1. Find John Doe
        # Adjust email if your user is different
        target_email = "john@example.com" 
        nurse = session.exec(select(Nurse).where(Nurse.email == target_email)).first()
        
        if not nurse:
            print(f"❌ ERROR: Could not find nurse with email '{target_email}'.")
            return

        print(f"👤 Nurse Found: {nurse.name} (ID: {nurse.nurseid})")

        # 2. Get necessary reference data (Ward & Period)
        ward = session.exec(select(Ward)).first()
        period = session.exec(select(RosterPeriod)).first()
        
        if not ward or not period:
            print("❌ ERROR: Missing Ward or RosterPeriod data. Please run init_test_data.py first.")
            return

        # 3. Define the test schedule
        today = date.today()
        
        # Test Pattern: Day -> Afternoon -> Night -> Off
        test_pattern = [
            {"offset": 1, "code": "AM", "name": "Morning Shift", "start": time(7,0), "end": time(15,0)},
            {"offset": 2, "code": "PM", "name": "Afternoon Shift", "start": time(14,0), "end": time(22,0)},
            {"offset": 3, "code": "N", "name": "Night Shift", "start": time(21,0), "end": time(7,0)},
            {"offset": 4, "code": "D/O", "name": "Day Off", "start": None, "end": None},
        ]

        print("🔄 Clearing existing future shifts for John Doe...")
        # Clear future shifts to ensure clean test data
        existing_shifts = session.exec(
            select(Roster).where(
                Roster.nurseid == nurse.nurseid,
                Roster.shiftdate >= today
            )
        ).all()
        
        for shift in existing_shifts:
            session.delete(shift)
        session.commit()

        print("📅 Creating new varied shifts...")
        for plan in test_pattern:
            shift_date = today + timedelta(days=plan["offset"])
            
            # Ensure ShiftCode exists in DB
            sc_check = session.get(ShiftCode, plan["code"])
            if not sc_check:
                # Create if missing (failsafe)
                new_sc = ShiftCode(
                    shiftcode=plan["code"], 
                    description=plan["name"], 
                    defaultstart=plan["start"], 
                    defaultend=plan["end"],
                    isworking=(plan["code"] != "D/O")
                )
                session.add(new_sc)
                session.commit()

            # Create Roster Entry
            roster_entry = Roster(
                nurseid=nurse.nurseid,
                wardid=ward.wardid,
                periodid=period.periodid,
                shiftdate=shift_date,
                shiftcode=plan["code"],
                starttime=plan["start"],
                endtime=plan["end"],
                status="Confirmed",
                assignmentmethod="Manual_Test"
            )
            session.add(roster_entry)
            print(f"   ✅ {shift_date.strftime('%Y-%m-%d')} ({shift_date.strftime('%A')}): {plan['code']} - {plan['name']}")

        session.commit()
        print("\n🎉 SUCCESS! Test data updated.")
        print("👉 Go to http://localhost:5173/home")
        print("   - 'Upcoming Shift' should show: Morning Shift (AM) for TOMORROW.")
        print("   - 'Roster Schedule' calendar should show the sequence: AM -> PM -> N -> D/O.")

if __name__ == "__main__":
    create_varied_roster()