import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine

# Import Base and ALL models so they are registered with Base.metadata
from app.models import Base
import app.models.user
import app.models.project
import app.models.csat_cycle
import app.models.cycle_project_enrollment
import app.models.feedback_request
import app.models.feedback_response
import app.models.feedback_status_history
import app.models.audit_log
import app.models.aggregates

# Load environment variables
load_dotenv()

# Get the database URL
db_url = os.getenv("LOCAL_DATABASE_URL")
if not db_url:
    print("LOCAL_DATABASE_URL not found in .env")
    sys.exit(1)

try:
    engine = create_engine(db_url)
    print("Creating all missing tables...")
    Base.metadata.create_all(bind=engine)
    print("Success! All models are now synced with the database.")
except Exception as e:
    print(f"Error creating tables: {e}")
