# CSAT Tool Backend

FastAPI-based REST API for Customer Satisfaction Management.

## Project Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI application factory
│   ├── config.py               # Environment variables & settings
│   ├── database.py             # Database engine & session factory
│   │
│   ├── models/                 # SQLAlchemy ORM models
│   │   ├── user.py             # User & Role models
│   │   ├── csat_cycle.py       # CSAT Cycle master
│   │   ├── project.py          # Projects (from TMS sync)
│   │   ├── feedback_request.py # Feedback requests
│   │   ├── feedback_response.py# Feedback responses
│   │   ├── feedback_status_history.py # Status tracking
│   │   ├── action_plan.py      # Action plans & RCA
│   │   ├── audit_log.py        # Audit trail
│   │   └── aggregates.py       # Analytics aggregates
│   │
│   ├── schemas/                # Pydantic request/response schemas
│   │   ├── auth.py             # Login/token schemas
│   │   ├── user.py             # User schemas
│   │   ├── csat_cycle.py       # Cycle schemas
│   │   ├── project.py          # Project schemas
│   │   ├── feedback.py         # Feedback schemas
│   │   ├── dashboard.py        # Dashboard schemas
│   │   └── report.py           # Report schemas
│   │
│   ├── routers/                # API route handlers
│   │   ├── auth.py             # /api/auth/* endpoints
│   │   ├── users.py            # /api/users/* endpoints
│   │   ├── csat_cycles.py      # /api/csat-cycles/* endpoints
│   │   ├── projects.py         # /api/projects/* endpoints
│   │   ├── feedback.py         # /api/feedback/* endpoints
│   │   ├── dashboard.py        # /api/dashboard/* endpoints
│   │   ├── reports.py          # /api/reports/* endpoints
│   │   └── tms_sync.py         # /api/tms/* endpoints
│   │
│   ├── services/               # Business logic layer
│   │   ├── tms_integration_service.py
│   │   ├── feedback_request_service.py
│   │   ├── feedback_submission_service.py
│   │   ├── feedback_reporting_service.py
│   │   ├── notification_service.py
│   │   ├── action_plan_service.py
│   │   └── audit_log_service.py
│   │
│   ├── core/                   # Authentication & security
│   │   ├── security.py         # JWT, password hashing
│   │   ├── dependencies.py     # Dependency injection
│   │   └── rbac.py             # Role-based access control
│   │
│   ├── background/             # Scheduled background jobs
│   │   ├── tms_sync_job.py     # Sync projects/tickets
│   │   ├── reminder_job.py     # Send reminders
│   │   └── aggregation_job.py  # Refresh analytics tables
│   │
│   └── utils/                  # Utility functions
│       ├── email.py            # Email sending
│       ├── token.py            # Token generation
│       └── pagination.py       # Pagination helpers
│
├── alembic/                    # Database migrations
│   ├── env.py                  # Alembic environment config
│   ├── versions/               # Migration files
│   └── alembic.ini             # Alembic configuration
│
├── tests/                      # Test suite
│   ├── unit/                   # Unit tests
│   ├── integration/            # Integration tests
│   └── conftest.py             # Test fixtures
│
├── main.py                     # Entry point for uvicorn
├── requirements.txt            # Python dependencies
├── .env                        # Local environment variables
├── .env.example                # Template for .env
└── Dockerfile                  # Docker configuration
```

## Setup

### Prerequisites
- Python 3.9+
- PostgreSQL 13+
- pip or conda

### Local Development

1. **Clone and navigate:**
   ```bash
   cd backend
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database URL and other settings
   ```

5. **Run database migrations:**
   ```bash
   alembic upgrade head
   ```

6. **Start development server:**
   ```bash
   uvicorn main:app --reload
   ```

API will be available at `http://localhost:8000`

### Docker

```bash
# Build image
docker build -t csat-backend .

# Run container
docker run -p 8000:8000 \
  -e DATABASE_URL="postgresql://user:pass@db:5432/csat_db" \
  csat-backend
```

## API Documentation

**Interactive Swagger UI:** `http://localhost:8000/docs`
**ReDoc:** `http://localhost:8000/redoc`

## Architecture

### Layered Architecture
1. **Routes** (`routers/`) - HTTP endpoints, request validation
2. **Services** (`services/`) - Business logic, orchestration
3. **Models** (`models/`) - Database schema (ORM)
4. **Schemas** (`schemas/`) - Request/response data structures
5. **Core** (`core/`) - Cross-cutting concerns (auth, RBAC)

### Database
- **Models:** Dimension (dim_*) and Fact (fact_*) tables for analytics
- **Aggregates:** Pre-computed metrics (agg_* tables)
- **Audit:** All changes tracked in audit_logs table

## Key Features

✅ **Authentication** - JWT-based with refresh tokens
✅ **Authorization** - Role-Based Access Control (RBAC)
✅ **CSAT Cycles** - Manage feedback collection periods
✅ **Feedback Collection** - Create requests, collect responses
✅ **Analytics** - Aggregated metrics and reporting
✅ **TMS Integration** - Sync with external systems
✅ **Action Plans** - Track RCA and improvements
✅ **Audit Logs** - Compliance tracking
✅ **Background Jobs** - Scheduled reminders, aggregation, sync

## Development

### Running Tests
```bash
pytest tests/
pytest tests/unit/
pytest tests/integration/
```

### Code Quality
```bash
# Format code
black app/

# Check imports
isort app/

# Lint
flake8 app/
```

### Database Migrations
```bash
# Create new migration
alembic revision --autogenerate -m "Description"

# Apply migration
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Configuration

See `.env.example` for all configuration options:
- Database URL
- JWT secrets
- SMTP settings
- TMS integration settings

## Deployment

For production:
1. Set `DEBUG=False` in .env
2. Use strong `SECRET_KEY`
3. Configure CORS origins
4. Set up proper email configuration
5. Use environment-specific database
6. Enable HTTPS

## Support

For issues or questions, refer to the main project README or documentation.
