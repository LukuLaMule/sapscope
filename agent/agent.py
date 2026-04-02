#!/usr/bin/env python3
"""
SAPscope collection agent.

Usage:
    python -m agent            # collect all discovered systems, send to backend
    python -m agent --dry-run  # print JSON, don't send

Environment variables (required):
    SAPSCOPE_BACKEND_URL    e.g. https://app.sapscope.com
    SAPSCOPE_TOKEN          Bearer token issued by the backend
    SAP_USER                RFC username
    SAP_PASSWD              RFC password

System discovery (set by install.sh, override if needed):
    SAPSCOPE_SYSTEMS        Space-separated list of SID:SYSNR pairs
                            e.g. "P01:00 D01:01 Q01:00"
                            Default: auto-discover from /usr/sap/

    SAP_CLIENT              Logon client (default: 000)
    SAP_LANG                Logon language (default: EN)

Optional:
    SAPSCOPE_TIMEOUT        HTTP timeout seconds (default: 30)
    SAPSCOPE_VERIFY_SSL     Verify TLS cert (default: true)
    SAPSCOPE_TADIR_LIMIT    Max Z/Y objects from TADIR (default: 10000)
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from .collector import SAPCollector
from .config import AgentConfig, SAPConfig
from .sender import BackendSender

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    stream=sys.stderr,
)
logger = logging.getLogger("sapscope.agent")


# ── System discovery ──────────────────────────────────────────────────────────

def discover_systems() -> list[tuple[str, str]]:
    """
    Return a list of (ashost, sysnr) pairs to collect.

    Priority:
      1. SAPSCOPE_SYSTEMS env var  ("P01:00 D01:01")
      2. /usr/sap/ directory scan
    """
    env = os.getenv("SAPSCOPE_SYSTEMS", "").strip()
    if env:
        systems = []
        for entry in env.split():
            if ":" in entry:
                sid, sysnr = entry.split(":", 1)
                # Connect via localhost — we're on the AS
                systems.append(("localhost", sysnr.zfill(2)))
            else:
                logger.warning("Ignoring malformed entry in SAPSCOPE_SYSTEMS: %s", entry)
        return systems

    return _scan_usr_sap()


def _scan_usr_sap() -> list[tuple[str, str]]:
    sap_root = Path("/usr/sap")
    if not sap_root.exists():
        logger.warning("/usr/sap not found — no systems auto-discovered")
        return []

    systems = []
    for sid_dir in sorted(sap_root.iterdir()):
        sid = sid_dir.name
        if not (sid_dir.is_dir() and len(sid) == 3 and sid.isalnum() and sid[0].isalpha()):
            continue
        sysnr = _find_sysnr(sid_dir)
        if sysnr is not None:
            logger.info("Discovered SAP system: SID=%s SYSNR=%s", sid, sysnr)
            systems.append(("localhost", sysnr))

    return systems


def _find_sysnr(sid_dir: Path) -> str | None:
    """Extract system number from instance directory names (DVEBMGS00, ASCS01, D02…)."""
    preferred = None
    fallback  = None

    for inst_dir in sid_dir.iterdir():
        name = inst_dir.name
        if not inst_dir.is_dir() or not name[-2:].isdigit():
            continue
        nr = name[-2:]
        if name[:-2] in ("DVEBMGS", "ASCS"):
            preferred = nr
            break
        if fallback is None:
            fallback = nr

    return preferred or fallback


# ── Collection loop ───────────────────────────────────────────────────────────

def run(dry_run: bool = False) -> None:
    systems = discover_systems()

    if not systems:
        logger.error("No SAP systems found. Set SAPSCOPE_SYSTEMS or run on an AS.")
        sys.exit(1)

    logger.info("Collecting %d system(s)…", len(systems))

    # BackendSender is shared across all systems
    from .config import BackendConfig
    backend_cfg = BackendConfig()

    errors = 0
    for ashost, sysnr in systems:
        sap_cfg = SAPConfig(
            ashost=ashost,
            sysnr=sysnr,
            client=os.getenv("SAP_CLIENT", "000"),
            user=os.environ["SAP_USER"],
            passwd=os.environ["SAP_PASSWD"],
            lang=os.getenv("SAP_LANG", "EN"),
        )
        cfg = AgentConfig(sap=sap_cfg)

        try:
            _collect_one(cfg, backend_cfg, dry_run)
        except Exception as exc:
            logger.error("Failed for ashost=%s sysnr=%s: %s", ashost, sysnr, exc)
            errors += 1

    if errors:
        logger.warning("%d/%d systems failed.", errors, len(systems))
        sys.exit(1)


def _collect_one(cfg: AgentConfig, backend_cfg, dry_run: bool) -> None:
    with SAPCollector(cfg) as collector:
        snapshot = collector.collect()

    sid = snapshot["system"].get("rfcsysid", "?")
    logger.info(
        "SID=%-3s  components=%d  SPs=%d  custom=%d",
        sid,
        len(snapshot["components"]),
        len(snapshot["support_packages"]),
        snapshot["custom_objects"]["total"],
    )

    if dry_run:
        print(json.dumps(snapshot, indent=2, ensure_ascii=False))
        return

    with BackendSender(backend_cfg) as sender:
        reply = sender.send(snapshot)
    logger.info("SID=%-3s  accepted by backend: %s", sid, reply)


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="SAPscope collection agent")
    parser.add_argument("--dry-run", action="store_true",
                        help="Collect and print JSON, do not send to backend")
    args = parser.parse_args()

    try:
        run(dry_run=args.dry_run)
    except KeyboardInterrupt:
        sys.exit(0)
    except SystemExit:
        raise
    except Exception as exc:
        logger.exception("Agent crashed: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
