"""
Database Configuration
======================
TWO database connections:
  1. csat_tool_db   → your local MySQL (full access — read/write)
  2. tmstestdb1     → TL's server (READ ONLY — SELECT only)
"""

#from mdurl import URL

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.engine import URL
from app.config import settings
#==================================================================
# For NKs Laptop (local MySQL) - csat_tool_db
#==================================================================
'''LOCAL_DATABASE_URL = URL.create(
    "mysql+pymysql",
    username="csat_user",
    password="B@B@n2001",
    host="127.0.0.1",
    port=3306,
    database="csat_tool_db",
)
print("DATABASE URL =", settings.LOCAL_DATABASE_URL)
local_engine = create_engine(
    LOCAL_DATABASE_URL,
    pool_pre_ping=True,       # reconnect if connection dropped
    pool_recycle=3600,        # recycle connections every 1 hour
    echo=False,               # set True to log all SQL (debug only)
)
#============================================================================================
'''
# ============================================================
# 1. LOCAL DB — csat_tool_db
#    Full access — read & write
# ============================================================
local_engine = create_engine(
    settings.LOCAL_DATABASE_URL,
    pool_pre_ping=True,       # reconnect if connection dropped
    pool_recycle=3600,        # recycle connections every 1 hour
    echo=False,               # set True to log all SQL (debug only)
)
LocalSessionFactory = sessionmaker(
    bind=local_engine,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


# ============================================================
# 2. TMS DB — tmstestdb1 (TL's server)
#    READ ONLY — only SELECT queries allowed
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
# FastAPI Dependency — Local DB session
# ============================================================
def get_local_db():
    """Dependency for local csat_tool_db session"""
    db = LocalSessionFactory()
    try:
        yield db
    finally:
        db.close()


# ============================================================
# FastAPI Dependency — TMS DB session (READ ONLY)
# ============================================================
def get_tms_db():
    """
    Dependency for tmstestdb1 session.
    READ ONLY — never call db.commit() or db.add() here.
    Only SELECT queries allowed as per TL's instructions.
    """
    db = TMSSessionFactory()
    try:
        print("Inside TmS DB session closed.")
        yield db
        
    finally:
        db.close()
