import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load environment variables
load_dotenv()

# Get the database URL
db_url = os.getenv("LOCAL_DATABASE_URL")
if not db_url:
    print("LOCAL_DATABASE_URL not found in .env")
    sys.exit(1)

# Ensure the password is URL-encoded if it contains special characters
if "@" in db_url.split("://")[1].split("@")[0]:
    # It might be unencoded if the user hasn't fixed it yet
    print("Warning: Ensure your database password in LOCAL_DATABASE_URL is URL-encoded.")

try:
    engine = create_engine(db_url)
    with engine.connect() as conn:
        print("Creating csat_allowed_users table...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS csat_allowed_users (
                Email VARCHAR(255) PRIMARY KEY,
                role VARCHAR(50) NOT NULL,
                allowed_by VARCHAR(255),
                is_used TINYINT(1) DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                used_at DATETIME NULL
            )
        """))
        conn.commit()
        print("Table 'csat_allowed_users' created successfully!")
except Exception as e:
    print(f"Error creating table: {e}")
