"""
SAPscope payload sender.
POSTs the collected snapshot to the backend over HTTPS.
"""

import json
import logging
import logging.handlers
from datetime import datetime, timezone
from typing import Any

import httpx

from .config import BackendConfig

logger = logging.getLogger(__name__)

ENDPOINT      = "/api/v1/snapshots"
LOGS_ENDPOINT = "/api/v1/agent/logs"


class BatchLogHandler(logging.Handler):
    """Captures log records in memory so they can be shipped to the backend."""

    def __init__(self, level: int = logging.DEBUG):
        super().__init__(level)
        self.records: list[dict] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append({
            "level":   record.levelname,
            "message": self.format(record),
            "ts":      datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
        })

    def flush_records(self, sid: str | None = None) -> list[dict]:
        out = [{"system_sid": sid, **r} for r in self.records]
        self.records = []
        return out


class BackendSender:
    def __init__(self, config: BackendConfig):
        self.config = config
        self._client = httpx.Client(
            base_url=config.url,
            headers={
                "Authorization": f"Bearer {config.token}",
                "Content-Type": "application/json",
                "User-Agent": "sapscope-agent/1",
            },
            timeout=config.timeout,
            verify=config.verify_ssl,
        )

    def send(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        """POST snapshot to backend. Returns parsed response body."""
        logger.info("Sending snapshot to %s%s", self.config.url, ENDPOINT)
        response = self._client.post(ENDPOINT, content=json.dumps(snapshot))
        response.raise_for_status()
        logger.info("Backend accepted snapshot (HTTP %s)", response.status_code)
        return response.json()

    def send_logs(self, logs: list[dict]) -> None:
        """Ship captured log entries to the backend. Failures are silent."""
        if not logs:
            return
        try:
            self._client.post(
                LOGS_ENDPOINT,
                content=json.dumps({"logs": logs}),
            )
        except Exception as exc:
            logger.debug("Log shipping failed (non-fatal): %s", exc)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "BackendSender":
        return self

    def __exit__(self, *_) -> None:
        self.close()
