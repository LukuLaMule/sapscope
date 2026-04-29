"""
GET /api/license/status — public endpoint (no authentication required).

Returns the current license status so the UI can display the plan badge
and detect missing or expired licences.
"""

from fastapi import APIRouter

from ..license_validator import get_license_status

router = APIRouter(tags=["license"])


@router.get("/api/license/status")
def license_status() -> dict:
    """
    Return the current licence status.

    No authentication is required — the UI calls this endpoint on startup
    to decide which features to enable and whether to show a licence warning.
    """
    return get_license_status()
