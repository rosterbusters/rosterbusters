import sys
from datetime import date, timedelta, datetime, time, timezone
from sqlmodel import Session, select
from app.core.db import engine
from app.core.security import get_password_hash

# Importing models based on your file structure
from app.models.rbac import Nurse
from app.models.web import User
from app.models.roster import Ward, ShiftCode, Roster, RosterPeriod

def init_test_data():
    """
    Initializes test data for the Roster System.
    Creates: ShiftCodes, Wards, RosterPeriod, Nurses, Users, and Shifts.
    """
    with Session(engine) as session:
        print("🚀 Starting data initialization...")

        # ==========================================
        # 1. CREATE SHIFT CODES
        # ==========================================
        print("--- Creating Shift Codes ---")
        # Define standard shifts (AM, PM, Night, Off)
        shifts = [
            ShiftCode(
                shiftcode="AM", 
                description="Morning Shift", 
                defaultstart=time(7, 0), 
                defaultend=time(15, 0), 
                isworking=True,
                shiftdurationhours=8.0
            ),
            ShiftCode(
                shiftcode="PM", 
                description="Afternoon Shift", 
                defaultstart=time(14, 0), 
                defaultend=time(22, 0), 
                isworking=True,
                shiftdurationhours=8.0
            ),
            ShiftCode(
                shiftcode="ND", 
                description="Night Shift", 
                defaultstart=time(21, 0), 
                defaultend=time(7, 0), 
                isworking=True,
                shiftdurationhours=10.0
            ),
            ShiftCode(
                shiftcode="OFF", 
                description="Day Off", 
                defaultstart=None, 
                defaultend=None, 
                isworking=False,
                shiftdurationhours=0.0
            )
        ]
        
        for shift in shifts:
            # Check if exists to prevent duplicates
            existing = session.get(ShiftCode, shift.shiftcode)
            if not existing:
                session.add(shift)
        session.commit()

        # ==========================================
        # 2. CREATE WARDS
        # ==========================================
        print("--- Creating Wards ---")
        ward_names = ["General Ward A", "ICU", "Emergency"]
        created_wards = []
        
        for name in ward_names:
            ward = session.exec(select(Ward).where(Ward.wardname == name)).first()
            if not ward:
                ward = Ward(
                    wardname=name, 
                    wardtype="Inpatient", 
                    location="Block A", 
                    isactive=True
                )
                session.add(ward)
                session.commit()
                session.refresh(ward)
            created_wards.append(ward)

        # ==========================================
        # 3. CREATE ROSTER PERIOD
        # ==========================================
        print("--- Creating Roster Period ---")
        today = date.today()
        # Create a period starting from the 1st of this month
        start_month = today.replace(day=1)
        # End date is roughly 60 days later
        end_month = (start_month + timedelta(days=60)).replace(day=1) - timedelta(days=1)
        
        period = session.exec(select(RosterPeriod).where(RosterPeriod.startdate == start_month)).first()
        if not period:
            period = RosterPeriod(
                name=f"Period {start_month.strftime('%B %Y')}",
                startdate=start_month,
                enddate=end_month,
                requestopendate=start_month - timedelta(days=10),
                requestclosedate=start_month - timedelta(days=5),
                status="Published" # Must be published/confirmed for shifts to show
            )
            session.add(period)
            session.commit()
            session.refresh(period)

        # ==========================================
        # 4. CREATE NURSES AND LINKED USERS
        # ==========================================
        print("--- Creating Nurses and Users ---")
        
        # Test Data: John Doe is the main user for testing
        staff_list = [
            {"name": "Alice Smith", "email": "alice@example.com", "role": "Senior Nurse"},
            {"name": "Bob Jones", "email": "bob@example.com", "role": "Junior Nurse"},
            {"name": "John Doe", "email": "john@example.com", "role": "Senior Nurse"} 
        ]

        created_nurses = []

        for staff in staff_list:
            # A. Create Nurse Record (Table: nurse)
            nurse = session.exec(select(Nurse).where(Nurse.email == staff["email"])).first()
            if not nurse:
                nurse = Nurse(
                    name=staff["name"],
                    email=staff["email"],
                    designation=staff["role"],
                    contactnumber="91234567",
                    wardid=created_wards[0].wardid, # Assign to first ward
                    employmenttype="Full-time",
                    isactive=True
                )
                session.add(nurse)
                session.commit()
                session.refresh(nurse)
            
            created_nurses.append(nurse)

            # B. Create Web User Record (Table: web_user)
            # This allows the nurse to login. We link via nurseid.
            user = session.exec(select(User).where(User.email == staff["email"])).first()
            if not user:
                user = User(
                    email=staff["email"],
                    hashed_password=get_password_hash("password123"), # Default password
                    full_name=staff["name"],
                    is_active=True,
                    is_superuser=False,
                    nurseid=nurse.nurseid # CRITICAL LINK: Connects User to Nurse
                )
                session.add(user)
                session.commit()
                print(f"✅ Created User: {staff['email']} (Password: password123)")

        # ==========================================
        # 5. CREATE ROSTER (SHIFTS)
        # ==========================================
        print("--- Creating Shifts for the next 7 days ---")
        
        shift_cycle = ["AM", "PM", "ND", "OFF"]
        
        for nurse in created_nurses:
            # First, clean up any existing test shifts for the future to avoid duplicates
            existing_rosters = session.exec(
                select(Roster).where(
                    Roster.nurseid == nurse.nurseid,
                    Roster.shiftdate >= today
                )
            ).all()
            for r in existing_rosters:
                session.delete(r)
            session.commit() # Commit deletion first
            
            # Generate shifts for today + next 6 days
            for i in range(7):
                current_date = today + timedelta(days=i)
                
                # Logic: Ensure John Doe has an "AM" shift tomorrow for the dashboard test
                if nurse.name == "John Doe" and i == 1:
                    shift_code_str = "AM"
                else:
                    # Simple rotation for others
                    shift_code_str = shift_cycle[(nurse.nurseid + i) % len(shift_cycle)]
                
                # Get shift details
                sc = session.get(ShiftCode, shift_code_str)
                
                new_roster = Roster(
                    nurseid=nurse.nurseid,
                    wardid=created_wards[0].wardid,
                    periodid=period.periodid,
                    shiftdate=current_date,
                    shiftcode=shift_code_str,
                    starttime=sc.defaultstart,
                    endtime=sc.defaultend,
                    status="Confirmed",
                    assignmentmethod="Auto"
                )
                session.add(new_roster)
            
        session.commit()
        print("✅ Shifts created successfully!")
        print("\n" + "="*50)
        print("🎉 SETUP COMPLETE!")
        print("You can now log in at http://localhost:5173")
        print(f"Email:    john@example.com")
        print(f"Password: password123")
        print("="*50)

if __name__ == "__main__":
    try:
        init_test_data()
    except Exception as e:
        print(f"❌ An error occurred: {e}")
        import traceback
        traceback.print_exc()
