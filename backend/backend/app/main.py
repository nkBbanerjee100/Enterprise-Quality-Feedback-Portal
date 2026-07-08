"""FastAPI application entry point"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.security import get_security_headers
from app.routers import auth, users, csat_cycles, projects, feedback, dashboard, reports, tms_sync, notifications, project_staging, reviews


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager"""
    # Startup
    print("🚀 CSAT Tool API starting...")
    yield
    # Shutdown
    print("🛑 CSAT Tool API shutting down...")


def create_app() -> FastAPI:
    """Create and configure FastAPI application"""
    app = FastAPI(
        title="CSAT Tool API",
        description="Customer Satisfaction Tool - REST API",
        version="1.0.0",
        lifespan=lifespan,
    )

    # Middleware - CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Middleware - Security Headers
    @app.middleware("http")
    async def add_security_headers(request, call_next):
        response = await call_next(request)
        response.headers.update(get_security_headers())
        return response

    # Health check
    @app.get("/health")
    def health_check():
        """Health check endpoint"""
        return {"status": "healthy"}

    # Root endpoint
    @app.get("/")
    def read_root():
        """Root endpoint"""
        return {"message": "CSAT Tool API", "docs": "/docs"}

    # Include routers
    app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
    app.include_router(users.router, prefix="/api/users", tags=["Users"])
    app.include_router(csat_cycles.router, prefix="/api/csat-cycles", tags=["CSAT Cycles"])
    app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
    app.include_router(feedback.router, prefix="/api/feedback", tags=["Feedback"])
    app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
    app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
    app.include_router(tms_sync.router, prefix="/api/tms", tags=["TMS Integration"])
    app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
    app.include_router(project_staging.router, prefix="/api/project-staging", tags=["Project Staging"])
    app.include_router(reviews.router, prefix="/api/reviews", tags=["Reviews"])

    return app


# Create application instance
app = create_app()

