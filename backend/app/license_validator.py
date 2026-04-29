"""
SAPscope License Validator — self-hosted deployments.

Reads the license key from the environment, validates it against the
Sapscope license server, and caches the result locally so the app can
continue operating for up to GRACE_DAYS days if the server is unreachable.

Environment variables:
    SAPSCOPE_LICENSE_KEY        — UUID licence key (required in self-hosted mode)
    SAPSCOPE_LICENSE_SERVER_URL — defaults to https://sapscope.com
    SAPSCOPE_INSTANCE_ID        — unique instance UUID (auto-generated if absent)
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CACHE_FILE = "/app/data/license_cache.json"
INSTANCE_ID_FILE = "/app/data/instance_id.txt"
GRACE_DAYS = 7
_REQUEST_TIMEOUT = 10  # seconds


def _ensure_data_dir() -> None:
    os.makedirs("/app/data", exist_ok=True)


# ---------------------------------------------------------------------------
# Instance ID
# ---------------------------------------------------------------------------

def get_instance_id() -> str:
    """Return the unique instance ID, generating and persisting one if needed."""
    # 1. Prefer explicit env var
    env_id = os.environ.get("SAPSCOPE_INSTANCE_ID", "").strip()
    if env_id:
        return env_id

    _ensure_data_dir()

    # 2. Try to read from file
    if os.path.exists(INSTANCE_ID_FILE):
        try:
            stored = open(INSTANCE_ID_FILE).read().strip()
            if stored:
                return stored
        except OSError:
            pass

    # 3. Generate and persist
    new_id = str(uuid.uuid4())
    try:
        with open(INSTANCE_ID_FILE, "w") as fh:
            fh.write(new_id)
    except OSError as exc:
        logger.warning("Could not persist instance_id: %s", exc)

    return new_id


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _load_cache() -> dict | None:
    """Return the parsed cache dict, or None if missing / unreadable."""
    if not os.path.exists(CACHE_FILE):
        return None
    try:
        with open(CACHE_FILE) as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Could not read license cache: %s", exc)
        return None


def _save_cache(data: dict) -> None:
    """Persist *data* to CACHE_FILE, adding cached_at timestamp."""
    _ensure_data_dir()
    data["cached_at"] = datetime.now(timezone.utc).isoformat()
    try:
        with open(CACHE_FILE, "w") as fh:
            json.dump(data, fh, indent=2)
    except OSError as exc:
        logger.warning("Could not write license cache: %s", exc)


def _cache_age_days(cache: dict) -> float | None:
    """Return how many days ago the cache was written, or None if unparseable."""
    cached_at_str = cache.get("cached_at")
    if not cached_at_str:
        return None
    try:
        cached_at = datetime.fromisoformat(cached_at_str)
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - cached_at
        return delta.total_seconds() / 86400
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Core validation
# ---------------------------------------------------------------------------

def validate_license() -> dict:
    """
    Contact the license server and return a validation result dict.

    1. No SAPSCOPE_LICENSE_KEY → {"configured": False, "valid": False}
    2. Call POST {server_url}/api/license/validate — timeout 10 s
    3. Success → save to cache, return result
    4. Network error → use cache (grace period) or hard-fail
    """
    license_key = os.environ.get("SAPSCOPE_LICENSE_KEY", "").strip()
    if not license_key:
        return {
            "configured": False,
            "valid": False,
            "plan": None,
            "expires_at": None,
            "days_remaining": None,
            "grace_mode": False,
            "reason": None,
        }

    server_url = os.environ.get(
        "SAPSCOPE_LICENSE_SERVER_URL", "https://sapscope.com"
    ).rstrip("/")
    instance_id = get_instance_id()

    try:
        response = httpx.post(
            f"{server_url}/api/license/validate",
            json={"key": license_key, "instance_id": instance_id},
            timeout=_REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        result = response.json()
        # Persist successful response
        _save_cache(result)
        result.setdefault("configured", True)
        result.setdefault("grace_mode", False)
        return result

    except Exception as exc:  # network errors, timeouts, non-2xx, parse errors
        logger.warning("License server unreachable: %s — checking cache", exc)

        cache = _load_cache()
        if cache is not None:
            age = _cache_age_days(cache)
            if age is not None and age <= GRACE_DAYS:
                logger.info("Grace period active — cache age %.1f days", age)
                cache["configured"] = True
                cache["grace_mode"] = True
                return cache

        # No usable cache → hard fail
        return {
            "configured": True,
            "valid": False,
            "plan": None,
            "expires_at": None,
            "days_remaining": None,
            "grace_mode": False,
            "reason": "server_unreachable",
        }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_license_status() -> dict:
    """
    Return the current license status, using cache when available.

    Format:
    {
        "configured":     bool,
        "valid":          bool,
        "plan":           str | None,
        "expires_at":     str | None,
        "days_remaining": int | None,
        "grace_mode":     bool,
        "reason":         str | None,
    }
    """
    license_key = os.environ.get("SAPSCOPE_LICENSE_KEY", "").strip()
    configured = bool(license_key)

    # Try cache first to avoid hitting the server on every request
    cache = _load_cache()
    if cache is not None:
        result = dict(cache)
    else:
        result = validate_license()

    # Normalise required fields
    result.setdefault("configured", configured)
    result.setdefault("valid", False)
    result.setdefault("plan", None)
    result.setdefault("expires_at", None)
    result.setdefault("grace_mode", False)
    result.setdefault("reason", None)

    # Compute days_remaining from expires_at
    expires_at_str = result.get("expires_at")
    days_remaining: int | None = None
    if expires_at_str:
        try:
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            delta = expires_at - datetime.now(timezone.utc)
            days_remaining = max(0, int(delta.total_seconds() // 86400))
        except (ValueError, TypeError):
            days_remaining = None

    result["days_remaining"] = days_remaining
    result["configured"] = configured

    return {
        "configured": result["configured"],
        "valid": result.get("valid", False),
        "plan": result.get("plan"),
        "expires_at": result.get("expires_at"),
        "days_remaining": days_remaining,
        "grace_mode": bool(result.get("grace_mode", False)),
        "reason": result.get("reason"),
    }
