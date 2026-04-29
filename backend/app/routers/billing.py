"""
/api/v1/billing — Stripe checkout and webhook handling (SaaS only).

Flow:
  1. POST /checkout?tier=solo  →  returns { url: "https://checkout.stripe.com/..." }
  2. User pays on Stripe
  3. Stripe sends checkout.session.completed to POST /webhook
  4. Webhook creates Client + AgentToken + OnboardingToken, assigns client to user
  5. Frontend (redirected to /app?activated=1) calls GET /onboarding
  6. GET /onboarding returns { token, client_name } and deletes the OnboardingToken row
"""

import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone

import jwt
import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..mailer import send_license_email, send_welcome_email
from ..models import AgentToken, Client, License, OnboardingToken, Subscription, User, UserClient
from ..settings import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/billing", tags=["billing"])

TIERS = {
    "solo":       {"label": "Solo",       "max_clients": 3,   "max_users": 1},
    "team":       {"label": "Team",       "max_clients": 20,  "max_users": 5},
    "enterprise": {"label": "Enterprise", "max_clients": 999, "max_users": 999},
}


def _stripe_client() -> stripe.StripeClient:
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Billing not configured on this instance")
    return stripe.StripeClient(settings.stripe_secret_key)


def _price_id(tier: str) -> str:
    mapping = {
        "solo":       settings.stripe_price_solo,
        "team":       settings.stripe_price_team,
        "enterprise": settings.stripe_price_enterprise,
    }
    price = mapping.get(tier)
    if not price:
        raise HTTPException(status_code=400, detail=f"Unknown tier: {tier}")
    return price


# ── POST /checkout ────────────────────────────────────────────────────────────

@router.post("/checkout")
async def create_checkout(
    tier: str = Query(..., pattern="^(solo|team|enterprise)$"),
    current_user: User = Depends(get_current_user),
):
    """Create a Stripe checkout session and return the redirect URL."""
    sc = _stripe_client()
    base_url = "https://app.sapscope.com"

    session = sc.checkout.sessions.create({
        "mode": "subscription",
        "line_items": [{"price": _price_id(tier), "quantity": 1}],
        "client_reference_id": current_user.id,
        "customer_email": current_user.email,
        "metadata": {"tier": tier, "user_id": current_user.id},
        "success_url": f"{base_url}/app?activated=1",
        "cancel_url": f"{base_url}/app?activated=0",
        "allow_promotion_codes": True,
    })
    return {"url": session.url}


# ── POST /webhook ─────────────────────────────────────────────────────────────

@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    stripe_signature: str = Header(None, alias="stripe-signature"),
):
    """Receive and process Stripe events."""
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook secret not configured")

    payload = await request.body()
    try:
        sc = _stripe_client()
        event = sc.construct_event(payload, stripe_signature, settings.stripe_webhook_secret)
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        await _handle_checkout_completed(event["data"]["object"], db)

    elif event["type"] in ("customer.subscription.updated", "customer.subscription.deleted"):
        await _handle_subscription_change(event["data"]["object"], db)

    return {"received": True}


def _attr(obj, *keys, default=None):
    """Safely get nested attribute from a Stripe object or dict."""
    for key in keys:
        try:
            obj = obj[key] if isinstance(obj, dict) else getattr(obj, key)
        except (KeyError, AttributeError):
            return default
    return obj if obj is not None else default


async def _handle_checkout_completed(session, db: AsyncSession) -> None:
    checkout_type = _attr(session, "metadata", "checkout_type", default="saas")
    if checkout_type == "self_hosted_license":
        await _handle_self_hosted_license_checkout(session, db)
        return

    user_id = _attr(session, "client_reference_id") or _attr(session, "metadata", "user_id")
    tier    = _attr(session, "metadata", "tier", default="solo")

    if not user_id:
        logger.error("checkout.session.completed missing user_id: %s", _attr(session, "id"))
        return

    row = await db.execute(select(User).where(User.id == user_id))
    user = row.scalar_one_or_none()
    if not user:
        logger.error("checkout.session.completed: user %s not found", user_id)
        return

    # Idempotency — skip if already activated
    existing_sub = await db.execute(select(Subscription).where(Subscription.user_id == user_id))
    if existing_sub.scalar_one_or_none():
        logger.info("User %s already has a subscription, skipping", user_id)
        return

    # Create SAP client for this user
    client_name = f"{TIERS.get(tier, TIERS['solo'])['label']} — {user.email}"
    client = Client(name=client_name)
    db.add(client)
    await db.flush()

    # Generate agent token
    plaintext = secrets.token_urlsafe(settings.token_min_length)
    token = AgentToken(
        client_id=client.id,
        label="agent-default",
        token_hash=AgentToken.hash(plaintext),
    )
    db.add(token)

    # Assign client to user
    db.add(UserClient(user_id=user_id, client_id=client.id))

    # Store plaintext token for one-time retrieval by frontend
    db.add(OnboardingToken(
        user_id=user_id,
        client_id=client.id,
        token_plaintext=plaintext,
    ))

    # Record subscription
    db.add(Subscription(
        user_id=user_id,
        stripe_customer_id=_attr(session, "customer", default=""),
        stripe_subscription_id=_attr(session, "subscription"),
        tier=tier,
        status="active",
    ))

    await db.commit()
    logger.info("User %s activated on tier %s, client %s", user_id, tier, client.id)

    # Email de bienvenue — en tâche de fond pour ne pas bloquer la réponse au webhook
    asyncio.create_task(
        send_welcome_email(
            to_email=user.email,
            tier=tier,
            client_name=client_name,
            agent_token=plaintext,
        )
    )


async def _handle_self_hosted_license_checkout(session, db: AsyncSession) -> None:
    """Génère et envoie une licence JWT self-hosted après paiement Stripe."""
    email   = _attr(session, "customer_email") or _attr(session, "metadata", "email", default="")
    plan    = _attr(session, "metadata", "plan", default="solo")
    months  = int(_attr(session, "metadata", "months", default=12))
    org     = _attr(session, "metadata", "org", default="")

    if not email:
        logger.error("self_hosted_license checkout: email manquant (session %s)", _attr(session, "id"))
        return

    if not settings.license_private_key:
        logger.error("LICENSE_PRIVATE_KEY_B64 non configuré — impossible de générer la licence pour %s", email)
        return

    plan_limits = {
        "solo":       {"max_users": 1,   "max_clients": 3},
        "team":       {"max_users": 5,   "max_clients": 20},
        "enterprise": {"max_users": -1,  "max_clients": -1},
    }
    limits = plan_limits.get(plan, plan_limits["solo"])

    now        = datetime.now(tz=timezone.utc)
    expires_at = now + timedelta(days=months * 30)

    payload = {
        "sub":         email,
        "org":         org or email,
        "tier":        plan,
        "max_users":   limits["max_users"],
        "max_clients": limits["max_clients"],
        "exp":         int(expires_at.timestamp()),
        "iat":         int(now.timestamp()),
    }

    license_key = jwt.encode(payload, settings.license_private_key, algorithm="RS256")

    # Idempotency — skip if already issued for this email+plan
    existing = await db.execute(select(License).where(License.email == email, License.plan == plan))
    if existing.scalar_one_or_none():
        logger.warning("Licence déjà émise pour %s (plan=%s), ignorée", email, plan)
        return

    db.add(License(
        key=license_key,
        email=email,
        plan=plan,
        expires_at=expires_at,
        active=True,
    ))
    await db.commit()
    logger.info("Licence self-hosted générée pour %s (plan=%s, expires=%s)", email, plan, expires_at.date())

    expires_str = expires_at.strftime("%d/%m/%Y")
    asyncio.create_task(
        send_license_email(
            to_email=email,
            plan=plan,
            license_key=license_key,
            expires_at=expires_str,
            org=org,
        )
    )


async def _handle_subscription_change(sub, db: AsyncSession) -> None:
    stripe_sub_id = _attr(sub, "id")
    new_status    = _attr(sub, "status", default="canceled")

    row = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
    )
    subscription = row.scalar_one_or_none()
    if subscription:
        subscription.status = new_status
        await db.commit()
        logger.info("Subscription %s → %s", stripe_sub_id, new_status)


# ── GET /onboarding ───────────────────────────────────────────────────────────

@router.get("/onboarding")
async def get_onboarding_token(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the pending agent token once, then delete it."""
    row = await db.execute(
        select(OnboardingToken).where(OnboardingToken.user_id == current_user.id)
    )
    pending = row.scalar_one_or_none()
    if not pending:
        return {"token": None, "client_id": None}

    token       = pending.token_plaintext
    client_id   = pending.client_id

    # Retrieve client name
    c_row = await db.execute(select(Client).where(Client.id == client_id))
    client = c_row.scalar_one_or_none()

    await db.delete(pending)
    await db.commit()

    return {"token": token, "client_id": client_id, "client_name": client.name if client else ""}


# ── GET /status ───────────────────────────────────────────────────────────────

@router.get("/status")
async def billing_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current subscription status for the logged-in user."""
    row = await db.execute(
        select(Subscription).where(Subscription.user_id == current_user.id)
    )
    sub = row.scalar_one_or_none()
    if not sub:
        return {"subscribed": False}
    return {
        "subscribed": True,
        "tier": sub.tier,
        "status": sub.status,
    }
