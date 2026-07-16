"""
Database Configuration
======================

TWO database connections:

1. csat_tool_db
   → Local MySQL database
   → Full access (read/write)

2. tmstestdb1
   → TL's server database
   → READ ONLY (SELECT only)
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings


# ============================================================
# 1. LOCAL DB — csat_tool_db
#    Full access — READ / WRITE
# ============================================================

print("DATABASE URL =", settings.LOCAL_DATABASE_URL)

local_engine = create_engine(
    settings.LOCAL_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=False,
)


LocalSessionFactory = sessionmaker(
    bind=local_engine,
    autocommit=False,
    autoflush=False,
)


# ============================================================
# Base Model
# ============================================================

Base = declarative_base()



# ============================================================
# 2. TMS DB — tmstestdb1
#    READ ONLY — SELECT queries only
# ============================================================

tms_engine = create_engine(
    settings.TMS_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=False,
)


TMSSessionFactory = sessionmaker(
    bind=tms_engine,
    autocommit=False,
    autoflush=False,
)



# ============================================================
# FastAPI Dependency
# Local Database Session
# ============================================================

def get_local_db():
    """
    Dependency for local csat_tool_db.

    Used for:
    - Authentication
    - User management
    - Feedback
    - CSAT operations

    Read and write allowed.
    """

    db = LocalSessionFactory()

    try:
        yield db

    finally:
        db.close()



# ============================================================
# FastAPI Dependency
# TMS Database Session
# ============================================================

def get_tms_db():
    """
    Dependency for tmstestdb1.

    IMPORTANT:
    - SELECT only
    - Do not use db.add()
    - Do not use db.commit()
    """

    db = TMSSessionFactory()

    try:
        yield db

    finally:
        db.close()