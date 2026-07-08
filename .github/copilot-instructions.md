# CSAT Tool - Development Guidelines

## Project Overview
CSAT Tool is a full-stack application for customer satisfaction management built with:
- **Backend**: FastAPI (Python)
- **Frontend**: React (JavaScript/TypeScript)
- **Database**: PostgreSQL

## Development Setup

### Local Development
1. **Backend**: Requires Python 3.9+, FastAPI, SQLAlchemy
2. **Frontend**: Requires Node.js 16+, React
3. **Database**: PostgreSQL 13+

### Docker Development
All services can be started with:
```bash
docker-compose up
```

## Key Directories
- `backend/` - FastAPI application with API endpoints
- `frontend/` - React application with UI components
- `database/` - SQL schemas and migration scripts
  - `app/` - Application-specific database schema
  - `mock_tms/` - Mock TMS (Ticket Management System) schema for testing
- `docs/` - Reference documents and requirements

## API Endpoints
- Base URL: `http://localhost:8000`
- API Documentation: `http://localhost:8000/docs` (Swagger UI)

## Database Setup
- Mock TMS schema in `database/mock_tms/`
- Application schema in `database/app/`
- Migrations applied on PostgreSQL startup via docker-compose

## Common Commands

### Start Development Environment
```bash
docker-compose up
```

### Stop Development Environment
```bash
docker-compose down
```

### Reset Database
```bash
docker-compose down -v
docker-compose up
```

## Contributing Guidelines
- Follow PEP 8 for Python code
- Follow ESLint/Prettier for JavaScript/React
- Update documentation for API changes
- Test changes before committing
