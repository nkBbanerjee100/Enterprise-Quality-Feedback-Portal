import os
import datetime
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv(override=True)

# Connect to TMS DB
engine = create_engine(os.getenv('TMS_DATABASE_URL'))

with engine.begin() as conn:
    # 1. Insert Dummy Users
    users = [
        {
            "EmpId": "PM001",
            "EmpFirstName": "Alice",
            "EmpLastName": "Manager",
            "Email": "alice.pm@example.com",
            "IsActive": 1,
            "level": "L3",
            "grade": "G3",
        },
        {
            "EmpId": "DM001",
            "EmpFirstName": "Bob",
            "EmpLastName": "Delivery",
            "Email": "bob.dm@example.com",
            "IsActive": 1,
            "level": "L4",
            "grade": "G4",
        }
    ]
    
    print("Inserting users...")
    for u in users:
        conn.execute(text("""
            INSERT IGNORE INTO tsms_user 
            (EmpId, EmpFirstName, EmpLastName, Email, IsActive, level, grade, currencyCode)
            VALUES (:EmpId, :EmpFirstName, :EmpLastName, :Email, :IsActive, :level, :grade, 6)
        """), u)

    # 2. Insert Dummy Projects
    # Note: For /projects/completed to return data, we need at least one project
    # where IsProjectActive = 0 and EndDate < today
    projects = [
        {
            "Id": 1001,
            "Name": "Active Project Alpha",
            "StartDate": datetime.datetime(2026, 1, 1),
            "EndDate": datetime.datetime(2026, 12, 31),
            "PmId": "PM001",
            "DMId": "DM001",
            "IsProjectActive": 1
        },
        {
            "Id": 1002,
            "Name": "Completed Project Beta",
            "StartDate": datetime.datetime(2025, 1, 1),
            "EndDate": datetime.datetime(2025, 12, 31),
            "PmId": "PM001",
            "DMId": "DM001",
            "IsProjectActive": 0
        }
    ]
    
    print("Inserting projects...")
    for p in projects:
        conn.execute(text("""
            INSERT IGNORE INTO tsms_projects 
            (Id, Name, StartDate, EndDate, PmId, DMId, IsProjectActive)
            VALUES (:Id, :Name, :StartDate, :EndDate, :PmId, :DMId, :IsProjectActive)
        """), p)
        
print("Successfully inserted dummy data into TMS database!")
