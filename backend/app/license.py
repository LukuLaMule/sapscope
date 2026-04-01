"""
SAPscope license validation for self-hosted deployments.

SaaS mode   : LICENSE_KEY absent in env  → unlimited, no check
Self-hosted : LICENSE_KEY must be a signed JWT issued by Sapscope

License JWT payload:
  {
    "iss":         "sapscope.fr",
    "org":         "ACME Corp",
    "tier":        "enterprise",   # solo | team | enterprise
    "max_users":   50,             # -1 = unlimited
    "max_clients": -1,             # -1 = unlimited
    "exp":         <unix timestamp>,
    "iat":         <unix timestamp>
  }

Signed with RS256 (asymmetric RSA-2048).
The private key is kept exclusively by Sapscope and is never shipped.
Only the public key is embedded here for verification — possessing
this source code gives zero ability to forge a valid license.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import jwt

logger = logging.getLogger(__name__)

# RSA-2048 public key — verification only.
# The matching private key stays with Sapscope; it is never distributed.
_LICENSE_PUBLIC_KEY = """-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvQfWHmtcobFHywDte22m
JPyy+JR8Q0gJ73FGg1XCZRqNCOOX6UBMnjOMotde2t4nrtUvG3kkVsSkv0KxcJkZ
hXKy0rOR3Y6/cWg8lakBLjSxkNX3hzbEOFBXRn3zPJMoCsyQIK0ssZhk9pYRq3Wj
sjhOAA4TxIu41LeIjF2hg+6hkdODHwHs/GzLM5ZXAGhpoJq61NXGOe86AbnAPF6t
0qlD68VmDahiJBeLW0rXZlrjIMljpzdUlo6qAXuq69wJ/rlrCb8p+ajEPMQPDqKx
QBCvoDR18I01KKSbGeE211FAVYpSTJzjjISA7wMukQFCe+B4Pe4sAVPzZPiQijgA
OQIDAQAB
-----END PUBLIC KEY-----"""

TIER_LIMITS = {
    "solo":       {"max_users": 1,  "max_clients": 3},
    "team":       {"max_users": 5,  "max_clients": 20},
    "enterprise": {"max_users": -1, "max_clients": -1},
}

_WARN_DAYS = 30


@dataclass
class LicenseInfo:
    mode: str             # "saas" | "self-hosted"
    org: str
    tier: str
    max_users: int        # -1 = unlimited
    max_clients: int      # -1 = unlimited
    expires_at: datetime | None
    is_valid: bool
    warning: str | None


_SAAS_LICENSE = LicenseInfo(
    mode="saas", org="SaaS", tier="saas",
    max_users=-1, max_clients=-1,
    expires_at=None, is_valid=True, warning=None,
)


def validate(license_key: str | None) -> LicenseInfo:
    """Validate a license key. Returns LicenseInfo. Never raises."""
    if not license_key:
        return _SAAS_LICENSE

    try:
        payload = jwt.decode(
            license_key,
            _LICENSE_PUBLIC_KEY,
            algorithms=["RS256"],
            options={"require": ["org", "tier", "exp", "iss"]},
            issuer="sapscope.fr",
        )
    except jwt.ExpiredSignatureError:
        logger.error("SAPscope license has expired — renew at sapscope.fr")
        return LicenseInfo(
            mode="self-hosted", org="?", tier="expired",
            max_users=0, max_clients=0,
            expires_at=None, is_valid=False,
            warning="License expired — renew at sapscope.fr",
        )
    except jwt.PyJWTError as exc:
        logger.error("Invalid SAPscope license key: %s", exc)
        return LicenseInfo(
            mode="self-hosted", org="?", tier="invalid",
            max_users=0, max_clients=0,
            expires_at=None, is_valid=False,
            warning=f"Invalid license key — contact support@sapscope.fr",
        )

    tier   = payload.get("tier", "solo")
    limits = TIER_LIMITS.get(tier, TIER_LIMITS["solo"])
    exp_ts = payload.get("exp")
    expires = datetime.fromtimestamp(exp_ts, tz=timezone.utc) if exp_ts else None

    warning = None
    if expires:
        days_left = (expires - datetime.now(timezone.utc)).days
        if days_left <= _WARN_DAYS:
            warning = f"License expires in {days_left} day(s) — renew at sapscope.fr"
            logger.warning(warning)

    info = LicenseInfo(
        mode="self-hosted",
        org=payload.get("org", "unknown"),
        tier=tier,
        max_users=payload.get("max_users", limits["max_users"]),
        max_clients=payload.get("max_clients", limits["max_clients"]),
        expires_at=expires,
        is_valid=True,
        warning=warning,
    )
    logger.info(
        "License OK — org=%s tier=%s expires=%s",
        info.org, info.tier,
        info.expires_at.strftime("%Y-%m-%d") if info.expires_at else "never",
    )
    return info
