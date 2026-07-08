import os
import datetime
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv(override=True)

engine = create_engine(os.getenv('LOCAL_DATABASE_URL'))

with engine.begin() as conn:
    print("Inserting dummy CSAT Cycle...")
    try:
        # Insert a dummy cycle
        conn.execute(text("""
            INSERT INTO csat_cycles (cycle_name, description, start_date, end_date, is_active)
            VALUES ('H1 2026', 'First half of 2026 CSAT Cycle', '2026-01-01', '2026-06-30', 1)
        """))
        cycle_id = conn.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]
        
        # Insert dim_projects
        print("Inserting dummy project into dim_projects...")
        conn.execute(text("""
            INSERT INTO dim_projects (project_id, project_name, is_active)
            VALUES ('1001', 'Active Project Alpha', 1)
            ON DUPLICATE KEY UPDATE project_name=project_name
        """))
        
        dim_project_id = conn.execute(text("SELECT id FROM dim_projects WHERE project_id = '1001' LIMIT 1")).fetchone()[0]
        
        # Enroll project in the cycle
        print("Enrolling project into the CSAT Cycle...")
        conn.execute(text("""
            INSERT IGNORE INTO cycle_project_enrollments (cycle_id, project_id, eligibility_status, enrolled_by)
            VALUES (:cycle_id, :dim_project_id, 'eligible', 'PM001')
        """), {"cycle_id": cycle_id, "dim_project_id": dim_project_id})
        
        print("Dummy local data inserted successfully!")
    except Exception as e:
        print(f"Error inserting dummy data: {e}")
