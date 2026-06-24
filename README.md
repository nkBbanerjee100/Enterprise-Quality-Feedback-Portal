# CSAT Tool

Customer Satisfaction (CSAT) Tool - A comprehensive application for managing and tracking customer satisfaction metrics.

## Project Structure

```
csat-tool/
├── backend/                  # FastAPI application
├── frontend/                 # React application
├── database/                 # SQL scripts & migrations
│   ├── mock_tms/             # Mock TMS schema + seed data
│   └── app/                  # Application schema
├── docs/                     # Reference documents
│   ├── Quality.docx
│   └── CSAT_Tool_Requirements_Document.docx
├── .gitignore
├── README.md
└── docker-compose.yml        # Spin up PG + backend + frontend together
```

## Prerequisites

- Docker & Docker Compose
- Python 3.9+ (for local backend development)
- Node.js 16+ (for local frontend development)
- PostgreSQL 13+

## Quick Start

### Using Docker Compose (Recommended)

```bash
docker-compose up
```

This will start:
- PostgreSQL database on `localhost:5432`
- FastAPI backend on `localhost:8000`
- React frontend on `localhost:3000`

### Local Development

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

#### Frontend
```bash
cd frontend
npm install
npm start
```

#### Database Setup
```bash
cd database
# Apply migrations
psql -U postgres -d csat_db -f app/schema.sql
psql -U postgres -d csat_db -f mock_tms/seed.sql
```

## Documentation

See [docs/](./docs/) for detailed requirements and quality documentation.

## Development

- Backend API: [http://localhost:8000](http://localhost:8000)
- API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Frontend: [http://localhost:3000](http://localhost:3000)

## Contributing

Please follow the project structure and conventions outlined in the documentation.


