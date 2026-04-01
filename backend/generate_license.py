#!/usr/bin/env python3
"""
Generate a SAPscope self-hosted license key.

Run this on YOUR machine — never ship this script or the private key to clients.

The private key must be in a file called  sapscope_license.pem
in the same directory as this script (or set SAPSCOPE_PRIVATE_KEY_PATH).

Usage:
  python generate_license.py --org "ACME Corp" --tier enterprise --months 12
  python generate_license.py --org "Freelance Jean Dupont" --tier solo --months 1

Tiers:
  solo       : 1 user,  3 clients SAP
  team       : 5 users, 20 clients SAP
  enterprise : unlimited users + clients
"""

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import jwt
except ImportError:
    print("pip install pyjwt cryptography", file=sys.stderr)
    sys.exit(1)

TIER_LIMITS = {
    "solo":       {"max_users": 1,  "max_clients": 3},
    "team":       {"max_users": 5,  "max_clients": 20},
    "enterprise": {"max_users": -1, "max_clients": -1},
}

_DEFAULT_KEY_PATH = Path(__file__).parent / "sapscope_license.pem"


def load_private_key() -> str:
    key_path = Path(os.environ.get("SAPSCOPE_PRIVATE_KEY_PATH", _DEFAULT_KEY_PATH))
    if not key_path.exists():
        print(f"ERROR: Private key not found at {key_path}", file=sys.stderr)
        print("Place your RSA private key there or set SAPSCOPE_PRIVATE_KEY_PATH.", file=sys.stderr)
        sys.exit(1)
    return key_path.read_text()


def generate(org: str, tier: str, months: int) -> str:
    private_key = load_private_key()
    limits = TIER_LIMITS[tier]
    now = datetime.now(timezone.utc)
    exp = now + timedelta(days=30 * months)
    payload = {
        "iss":         "sapscope.fr",
        "iat":         int(now.timestamp()),
        "exp":         int(exp.timestamp()),
        "org":         org,
        "tier":        tier,
        "max_users":   limits["max_users"],
        "max_clients": limits["max_clients"],
    }
    return jwt.encode(payload, private_key, algorithm="RS256")


def main() -> None:
    p = argparse.ArgumentParser(description="Generate a SAPscope self-hosted license")
    p.add_argument("--org",    required=True, help="Organisation name")
    p.add_argument("--tier",   default="enterprise", choices=list(TIER_LIMITS))
    p.add_argument("--months", type=int, default=12, help="License duration in months")
    args = p.parse_args()

    key = generate(args.org, args.tier, args.months)
    exp = datetime.now(timezone.utc) + timedelta(days=30 * args.months)
    limits = TIER_LIMITS[args.tier]

    print()
    print("=" * 60)
    print(f"  SAPscope License")
    print("=" * 60)
    print(f"  Org        : {args.org}")
    print(f"  Tier       : {args.tier}")
    print(f"  Users      : {'unlimited' if limits['max_users'] == -1 else limits['max_users']}")
    print(f"  Clients    : {'unlimited' if limits['max_clients'] == -1 else limits['max_clients']}")
    print(f"  Expires    : {exp.strftime('%Y-%m-%d')}")
    print("=" * 60)
    print()
    print("Add to the client's .env :")
    print()
    print(f"LICENSE_KEY={key}")
    print(f"REGISTRATION_ENABLED=false")
    print()


if __name__ == "__main__":
    main()
