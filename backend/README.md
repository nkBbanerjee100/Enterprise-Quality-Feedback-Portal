

CSAT Tool Backend

FastAPI-based REST API for Customer Satisfaction Management. Uses two MySQL databases — a local csat_tool_db (read/write) and an external tmstestdb1 on the TL's server (read-only).

Tech Stack


Framework: FastAPI 0.104.1
Server: Uvicorn
ORM: SQLAlchemy 2.0 + Alembic migrations
Databases: MySQL (PyMySQL driver) — local + TMS read-only
Auth: JWT (python-jose) + bcrypt password hashing
Background Jobs: Celery + Redis
Validation: Pydantic v2



Project Structure

backend/
├── app/
│   ├── main.py                 # FastAPI application factory
│   ├── config.py               # Environment variables & settings (Pydantic Settings)
│   ├── database.py             # Two DB engines: local (R/W) + TMS (R only)
│   │
│   ├── models/                 # SQLAlchemy ORM models
│   │   ├── user.py             # User & Role models
│   │   ├── csat_cycle.py       # CSAT Cycle master
│   │   ├── project.py          # Projects (from TMS sync)
│   │   ├── feedback_request.py
│   │   ├── feedback_response.py
│   │   ├── feedback_status_history.py
│   │   ├── action_plan.py      # Action plans & RCA
│   │   ├── audit_log.py        # Audit trail
│   │   └── aggregates.py       # Analytics aggregates
│   │
│   ├── schemas/                # Pydantic request/response schemas
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── csat_cycle.py
│   │   ├── project.py
│   │   ├── feedback.py
│   │   ├── dashboard.py
│   │   └── report.py
│   │
│   ├── routers/                # API route handlers
│   │   ├── auth.py             # POST /api/auth/*
│   │   ├── users.py            # /api/users/*
│   │   ├── csat_cycles.py      # /api/csat-cycles/*
│   │   ├── projects.py         # /api/projects/*
│   │   ├── feedback.py         # /api/feedback/*
│   │   ├── dashboard.py        # /api/dashboard/*
│   │   ├── reports.py          # /api/reports/*
│   │   └── tms_sync.py         # /api/tms/*  ← TMS integration (read-only)
│   │
│   ├── services/               # Business logic layer
│   │   ├── registration_service.py
│   │   ├── tms_integration_service.py
│   │   ├── feedback_request_service.py
│   │   ├── feedback_submission_service.py
│   │   ├── feedback_reporting_service.py
│   │   ├── notification_service.py
│   │   ├── action_plan_service.py
│   │   └── audit_log_service.py
│   │
│   ├── core/                   # Authentication & security
│   │   ├── security.py         # JWT, password hashing, security headers
│   │   ├── dependencies.py     # FastAPI dependency injection
│   │   └── rbac.py             # Role-Based Access Control
│   │
│   ├── background/             # Scheduled background jobs (Celery)
│   │   ├── tms_sync_job.py
│   │   ├── reminder_job.py
│   │   └── aggregation_job.py
│   │
│   └── utils/
│       ├── email.py
│       ├── token.py
│       └── pagination.py
│
├── alembic/                    # Database migrations
│   ├── env.py
│   ├── versions/
│   └── alembic.ini
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── conftest.py
│
├── main.py                     # Uvicorn entry point (imports app from app.main)
├── requirements.txt
├── .env                        # Local environment variables (git-ignored)
└── .env.example                # Template for .env


Setup & Running

Prerequisites


Python 3.10+
MySQL 8+ (local instance for csat_tool_db)
Redis (required for Celery background jobs)
Access to TMS server (tmstestdb1) — read-only, credentials from TL



1. Clone and navigate

bashcd backend

2. Create a virtual environment

bashpython -m venv venv

# Linux / macOS
source venv/bin/activate

# Windows
venv\Scripts\activate

3. Install dependencies

bashpip install -r requirements.txt

4. Configure environment

bashcp .env.example .env

Open .env and fill in the required values:

env# Local MySQL (full read/write)
LOCAL_DATABASE_URL=mysql+pymysql://csat_user:<password>@localhost:3306/csat_tool_db

# TMS server (read-only — do NOT write to this)
TMS_DATABASE_URL=mysql+pymysql://<user>:<password>@<tms-host>:3306/tmstestdb1

# JWT
SECRET_KEY=replace-this-with-a-strong-random-secret
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# App
APP_ENV=development
FRONTEND_URL=http://localhost:3000


⚠️ Never commit your .env file. The .env.example is the safe template.



5. Run database migrations (local DB only)

bashalembic upgrade head

6. Start the development server

bashuvicorn main:app --reload

The API will be available at http://localhost:8000


API Documentation

Once the server is running:

URLDescriptionhttp://localhost:8000/docsInteractive Swagger UIhttp://localhost:8000/redocReDoc documentationhttp://localhost:8000/healthHealth check endpoint


Database Architecture

This project connects to two MySQL databases:

DatabaseHostAccessPurposecsat_tool_dblocalhostRead + WriteAll CSAT datatmstestdb1TL's serverRead onlyProject/ticket sync source


Important: Never run INSERT, UPDATE, or DELETE against tmstestdb1. Use get_tms_db() dependency only for SELECT queries.