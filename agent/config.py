"""
SAPscope agent configuration.
Reads from environment variables or a local .env file.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass


@dataclass
class SAPConfig:
    ashost: str = "localhost"
    sysnr: str  = "00"
    client: str = "000"
    user: str   = field(default_factory=lambda: os.environ["SAP_USER"])
    passwd: str = field(default_factory=lambda: os.environ["SAP_PASSWD"])
    lang: str   = "EN"

    def __repr__(self) -> str:
        return (f"SAPConfig(ashost={self.ashost!r}, sysnr={self.sysnr!r}, "
                f"client={self.client!r}, user={self.user!r}, passwd=***)")

    def to_pyrfc(self) -> dict:
        return {
            "ashost": self.ashost,
            "sysnr": self.sysnr,
            "client": self.client,
            "user": self.user,
            "passwd": self.passwd,
            "lang": self.lang,
        }


@dataclass
class BackendConfig:
    url: str = field(default_factory=lambda: os.environ["SAPSCOPE_BACKEND_URL"])
    token: str = field(default_factory=lambda: os.environ["SAPSCOPE_TOKEN"])
    timeout: int = field(default_factory=lambda: int(os.getenv("SAPSCOPE_TIMEOUT", "30")))
    verify_ssl: bool = field(default_factory=lambda: os.getenv("SAPSCOPE_VERIFY_SSL", "true").lower() == "true")


@dataclass
class AgentConfig:
    sap: SAPConfig = field(default_factory=SAPConfig)
    backend: BackendConfig = field(default_factory=BackendConfig)
    tadir_limit: int = field(default_factory=lambda: int(os.getenv("SAPSCOPE_TADIR_LIMIT", "10000")))
