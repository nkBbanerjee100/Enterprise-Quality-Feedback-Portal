"""Aggregate tables for analytics and reporting"""
from sqlalchemy import Column, Integer, Float, DateTime, String, ForeignKey
from sqlalchemy.sql import func
from app.models import Base


class AggDailyMetrics(Base):
    """Daily aggregated CSAT metrics"""
    __tablename__ = "agg_daily_metrics"

    id = Column(Integer, primary_key=True)
    metric_date = Column(DateTime, nullable=False, index=True)
    csat_cycle_id = Column(Integer, ForeignKey("csat_cycles.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("dim_projects.id"))
    total_responses = Column(Integer, default=0)
    average_csat_score = Column(Float)
    average_nps_score = Column(Float)
    satisfaction_rate = Column(Float)  # Percentage of positive responses
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<AggDailyMetrics {self.metric_date}>"


class AggMonthlyMetrics(Base):
    """Monthly aggregated CSAT metrics"""
    __tablename__ = "agg_monthly_metrics"

    id = Column(Integer, primary_key=True)
    year_month = Column(String(7), nullable=False, index=True)  # YYYY-MM
    csat_cycle_id = Column(Integer, ForeignKey("csat_cycles.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("dim_projects.id"))
    total_responses = Column(Integer, default=0)
    average_csat_score = Column(Float)
    average_nps_score = Column(Float)
    satisfaction_rate = Column(Float)
    trend_vs_previous_month = Column(Float)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<AggMonthlyMetrics {self.year_month}>"
