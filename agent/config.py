"""
SAPscope agent configuration.
Reads from environment variables, a local .env file, or systems.yaml.
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
    # ashost mode (direct connection to application server)
    ashost: str = "localhost"
    sysnr: str  = "00"
    # mshost mode (connection via message server — leave mshost empty to use ashost mode)
    mshost: str = ""
    msserv: str = ""
    r3name: str = ""
    group:  str = "PUBLIC"
    # saprouter (optional, both modes)
    saprouter: str = ""
    # common
    client: str = "000"
    user:   str = field(default_factory=lambda: os.environ["SAP_USER"])
    passwd: str = field(default_factory=lambda: os.environ["SAP_PASSWD"])
    lang:   str = "EN"

    def __repr__(self) -> str:
        mode = f"mshost={self.mshost!r}" if self.mshost else f"ashost={self.ashost!r}"
        return f"SAPConfig({mode}, client={self.client!r}, user={self.user!r}, passwd=***)"

    def to_pyrfc(self) -> dict:
        base = {
            "client": self.client,
            "user":   self.user,
            "passwd": self.passwd,
            "lang":   self.lang,
        }
        if self.saprouter:
            base["saprouter"] = self.saprouter
        if self.mshost:
            return {**base,
                    "mshost": self.mshost,
                    "msserv": self.msserv,
                    "r3name": self.r3name,
                    "group":  self.group}
        return {**base, "ashost": self.ashost, "sysnr": self.sysnr}


def load_systems_from_yaml(path: Path) -> list[SAPConfig]:
    """Load SAP connection configs from a systems.yaml file.

    Example systems.yaml:
      systems:
        - mode: ashost       # connect directly to application server (default)
          ashost: localhost
          sysnr: "00"
          client: "100"

        - mode: mshost       # connect via message server (load balancing)
          mshost: sapms.company.com
          msserv: "3601"     # port or service name like "sapmsP01"
          r3name: P01
          group: PUBLIC
          client: "100"

        - mode: ashost       # remote system via SAProuter
          ashost: 10.0.0.1
          sysnr: "00"
          saprouter: /H/router.company.com/H/
          client: "000"

    Credentials (user/passwd) default to SAP_USER / SAP_PASSWD env vars.
    Per-entry overrides are supported but not recommended for production.
    """
    try:
        import yaml
    except ImportError:
        raise ImportError("pyyaml is required for systems.yaml support: pip install pyyaml")

    with open(path) as f:
        data = yaml.safe_load(f)

    configs: list[SAPConfig] = []
    for entry in (data or {}).get("systems", []):
        mode   = entry.get("mode", "ashost")
        user   = str(entry.get("user")   or os.environ["SAP_USER"])
        passwd = str(entry.get("passwd") or os.environ["SAP_PASSWD"])

        kwargs: dict = dict(
            client    = str(entry.get("client",    os.getenv("SAP_CLIENT", "000"))),
            user      = user,
            passwd    = passwd,
            lang      = str(entry.get("lang",      os.getenv("SAP_LANG", "EN"))),
            saprouter = str(entry.get("saprouter", "")),
        )
        if mode == "mshost":
            kwargs.update(
                mshost = str(entry["mshost"]),
                msserv = str(entry.get("msserv", "")),
                r3name = str(entry.get("r3name", "")),
                group  = str(entry.get("group", "PUBLIC")),
            )
        else:
            kwargs.update(
                ashost = str(entry.get("ashost", "localhost")),
                sysnr  = str(entry.get("sysnr", "00")).zfill(2),
            )
        configs.append(SAPConfig(**kwargs))

    return configs


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
