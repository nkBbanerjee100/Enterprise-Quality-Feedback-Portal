# Database Directory

## Structure

### `app/`
Application-specific database schemas and migrations.

**Files to create:**
- `schema.sql` - Main application schema (tables, indexes, constraints)
- `seed.sql` - Initial seed data (optional)

### `mock_tms/`
Mock TMS (Ticket Management System) schema for testing and integration purposes.

**Files to create:**
- `schema.sql` - TMS schema definition
- `seed.sql` - Sample TMS data

## Database Setup

### Using Docker Compose
```bash
docker-compose up
```
PostgreSQL will automatically initialize with schemas from `/docker-entrypoint-initdb.d/`.

### Manual Setup
```bash
# Connect to database
psql -U postgres -d csat_db

# Run migrations
\i app/schema.sql
\i mock_tms/schema.sql
\i mock_tms/seed.sql
```

## Environment Variables
- `POSTGRES_USER`: postgres
- `POSTGRES_PASSWORD`: postgres
- `POSTGRES_DB`: csat_db

## Credentials
- **User**: postgres
- **Password**: postgres
- **Database**: csat_db
- **Host**: localhost (or postgres if using Docker)
- **Port**: 5432
