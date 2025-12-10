"""
Initialize database with sample data for testing RBAC system
Run: python -m backend.database.init_db
"""
from sqlmodel import SQLModel
from backend.database.deps_rbac_db import engine
from sqlmodel import Session, create_engine, select
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import os
import sys

SQLModel.metadata.create_all(engine)
print(f"Connecting to: {engine.url}")
load_dotenv()
# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database.models_rbac_db import (
    Ward, Nurse, NurseManager, RosterPeriod,
    RBACUser, Role, UserRole
)

# Import password hashing - adjust based on your security module
try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    def get_password_hash(password: str) -> str:
        return pwd_context.hash(password)
except ImportError:
    import hashlib
    def get_password_hash(password: str) -> str:
        return hashlib.sha256(password.encode()).hexdigest()

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL") or f"postgresql://{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}@localhost:{os.getenv('POSTGRES_PORT', '5432')}/nurse_rostering"
engine = create_engine(DATABASE_URL, echo=True)


def init_sample_data():
    """Initialize sample data for testing"""
    with Session(engine) as session:
        
        print("\n" + "="*60)
        print("Initializing SACH Nurse Rostering System")
        print("="*60 + "\n")
        
        # 1. Create Ward 04
        ward04 = Ward(
            WardName="Ward 04",
            WardType="Dementia",
            Campus="Bedok",
            Morning_RN_Required=2,
            Morning_StaffNurse_Required=3,
            Morning_HCA_Required=2,
            Night_RN_Required=1,
            Night_StaffNurse_Required=2,
            Night_HCA_Required=1,
            IsActive=True
        )
        session.add(ward04)
        session.commit()
        session.refresh(ward04)
        print(f"✓ Ward: {ward04.WardName} (ID: {ward04.WardID})")
        
        # 2. Create Nurses
        nurses_data = [
            {"Name": "Alice Tan", "Designation": "RN", "Email": "alice.tan@sach.com.sg", "Phone": "91234567"},
            {"Name": "Bob Lee", "Designation": "RN", "Email": "bob.lee@sach.com.sg", "Phone": "91234568"},
            {"Name": "Carol Ng", "Designation": "StaffNurse", "Email": "carol.ng@sach.com.sg", "Phone": "91234569"},
            {"Name": "David Lim", "Designation": "StaffNurse", "Email": "david.lim@sach.com.sg", "Phone": "91234570"},
            {"Name": "Emily Goh", "Designation": "StaffNurse", "Email": "emily.goh@sach.com.sg", "Phone": "91234571"},
            {"Name": "Frank Chen", "Designation": "HCA", "Email": "frank.chen@sach.com.sg", "Phone": "91234572"},
            {"Name": "Grace Wong", "Designation": "HCA", "Email": "grace.wong@sach.com.sg", "Phone": "91234573"},
        ]
        
        created_nurses = []
        for n in nurses_data:
            nurse = Nurse(
                Name=n["Name"],
                Designation=n["Designation"],
                Email=n["Email"],
                ContactNumber=n["Phone"],
                WardID=ward04.WardID,
                EmploymentType="FullTime",
                IsActive=True
            )
            session.add(nurse)
            created_nurses.append(nurse)
        
        session.commit()
        print(f"✓ Nurses: {len(created_nurses)} staff members")
        
        # 3. Create Manager
        manager = NurseManager(
            Name="Manager Sarah Lim",
            Email="sarah.lim@sach.com.sg",
            ContactNumber="98765432",
            IsActive=True
        )
        session.add(manager)
        session.commit()
        session.refresh(manager)
        print(f"✓ Manager: {manager.Name}")
        
        # 4. Create Roster Period
        today = datetime.now().date()
        period_start = today - timedelta(days=today.weekday())
        period_end = period_start + timedelta(days=13)
        
        period = RosterPeriod(
            StartDate=period_start,
            EndDate=period_end,
            Status="Open",
            CreatedAt=datetime.now(timezone.utc)
        )
        session.add(period)
        session.commit()
        session.refresh(period)
        print(f"✓ Period: {period_start} to {period_end}")
        
        # 5. Get Roles
        nurse_role = session.exec(select(Role).where(Role.RoleName == "Nurse")).first()
        manager_role = session.exec(select(Role).where(Role.RoleName == "NurseManager")).first()
        admin_role = session.exec(select(Role).where(Role.RoleName == "Admin")).first()
        
        # 6. Create Admin User
        admin_user = RBACUser(
            Username="admin",
            Email="admin@sach.com.sg",
            PasswordHash=get_password_hash("admin123"),
            IsActive=True,
            IsEmailVerified=True,
            CreatedAt=datetime.now(timezone.utc)
        )
        session.add(admin_user)
        session.commit()
        session.refresh(admin_user)
        
        admin_user_role = UserRole(
            UserID=admin_user.UserID,
            RoleID=admin_role.RoleID,
            IsActive=True,
            AssignedAt=datetime.now(timezone.utc)
        )
        session.add(admin_user_role)
        print("✓ Admin: admin@sach.com.sg / admin123")
        
        # 7. Create Manager User
        manager_user = RBACUser(
            Username="sarah.lim",
            Email=manager.Email,
            PasswordHash=get_password_hash("manager123"),
            ManagerID=manager.ManagerID,
            IsActive=True,
            IsEmailVerified=True,
            CreatedAt=datetime.now(timezone.utc)
        )
        session.add(manager_user)
        session.commit()
        session.refresh(manager_user)
        
        manager_user_role = UserRole(
            UserID=manager_user.UserID,
            RoleID=manager_role.RoleID,
            WardID=ward04.WardID,
            IsActive=True,
            AssignedAt=datetime.now(timezone.utc)
        )
        session.add(manager_user_role)
        print("✓ Manager: sarah.lim@sach.org.sg / manager123")
        
        # 8. Create Nurse Users (first 2)
        for i, nurse in enumerate(created_nurses[:2]):
            nurse_user = RBACUser(
                Username=nurse.Email.split('@')[0],
                Email=nurse.Email,
                PasswordHash=get_password_hash(f"nurse{i+1}23"),
                NurseID=nurse.NurseID,
                IsActive=True,
                IsEmailVerified=True,
                CreatedAt=datetime.now(timezone.utc)
            )
            session.add(nurse_user)
            session.commit()
            session.refresh(nurse_user)
            
            nurse_user_role = UserRole(
                UserID=nurse_user.UserID,
                RoleID=nurse_role.RoleID,
                IsActive=True,
                AssignedAt=datetime.now(timezone.utc)
            )
            session.add(nurse_user_role)
            print(f"✓ Nurse: {nurse.Email} / nurse{i+1}23")
        
        session.commit()
        
        print("\n" + "="*60)
        print("Database Initialized Successfully!")
        print("="*60)


if __name__ == "__main__":
    init_sample_data()