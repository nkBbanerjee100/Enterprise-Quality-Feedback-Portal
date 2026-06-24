# CSAT Tool

Customer Satisfaction (CSAT) Tool - A comprehensive application for managing and tracking customer satisfaction metrics.

## Project Structure

```
csat-tool/
├── backend/                  # FastAPI application
├── frontend/                 # React application
├── docs/                     # Reference documents
│   ├── Quality.docx
├── .gitignore
├── README.md


## Prerequisites

- Python 3.9+ (for local backend development)
- React.js (for local frontend development)
- MySQL

## Quick Start

```bash
frontend :- npm run dev
backend :- uvicorn main:app --reload
```

This will start:
- MySQL database on `localhost:3306`
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
npm run dev
```

## Development

- Backend API: [http://localhost:8000](http://localhost:8000)
- API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Frontend: [http://localhost:3000](http://localhost:3000)

## Contributing

Please follow the project structure and conventions outlined in the documentation.


