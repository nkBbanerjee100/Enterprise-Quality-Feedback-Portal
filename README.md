# CSAT Tool

Enterprise Quality Feedback Portal — A comprehensive application for managing and tracking customer satisfaction metrics for Mindteck.

## Key Features

- **Dual Database Architecture**: Integrates with a local `csat_tool_db` (Read/Write) for feedback management and an external `tmstestdb1` (TMS - Read-Only) for project master data.
- **CSAT Cycles Management**: Create, track, and manage periodic feedback cycles and enroll specific active projects for feedback.
- **Role-Based Access Control**: Tailored dashboards and access for Quality, Delivery, Sales, and Manager roles.
- **Public Customer Survey**: A secure, public-facing, responsive survey form that automatically pre-fills project and performance data directly from TMS.
- **Dashboard Analytics**: Real-time KPI tracking for average CSAT, response rates, and feedback requests.

## Project Structure

```
csat-tool/
├── backend/                  # FastAPI REST API (Python)
├── frontend/                 # React + Vite application (TypeScript)
├── docs/                     # Reference documents
├── README.md
```

## Prerequisites

- Python 3.9+ 
- Node.js 18+ 
- MySQL (Local instance for `csat_tool_db`)

## Quick Start

### 1. Database Setup
Create your local MySQL database and ensure you have access to the TMS database (read-only). Configure these in `backend/.env`. You can use `backend/create_missing_tables.py` and `backend/insert_dummy_csat_data.py` to seed initial data.

### 2. Backend
```bash
cd backend
python -m venv venv
# On Windows: venv\Scripts\activate
# On Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

## Access

- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **Backend API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Public Survey Example**: `http://localhost:3000/survey/<base64-token>`

## Contributing

Please follow the project structure and conventions outlined in the respective `backend/README.md` and `frontend/README.md` documentation.
