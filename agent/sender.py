"""
SAPscope payload sender.
POSTs the collected snapshot to the backend over HTTPS.
"""

import json
import logging
from typing import Any

import httpx

from .config import BackendConfig

logger = logging.getLogger(__name__)

ENDPOINT = "/api/v1/snapshots"


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

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "BackendSender":
        return self

    def __exit__(self, *_) -> None:
        self.close()
