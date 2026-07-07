"""Pagination utilities"""
from typing import Optional


class PaginationParams:
    """Pagination parameters"""

    def __init__(self, skip: int = 0, limit: int = 10):
        self.skip = max(0, skip)
        self.limit = min(limit, 100)  # Max 100 per page

    def get_offset_limit(self) -> tuple:
        """Get offset and limit"""
        return (self.skip, self.limit)


class PaginatedResponse:
    """Paginated response wrapper"""

    def __init__(self, data: list, total: int, skip: int, limit: int):
        self.data = data
        self.total = total
        self.skip = skip
        self.limit = limit
        self.pages = (total + limit - 1) // limit if limit > 0 else 0
