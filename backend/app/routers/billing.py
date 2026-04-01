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

import logging
import secrets

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import AgentToken, Client, OnboardingToken, Subscription, User, UserClient
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
    base_url = "https://sapscope.luku.fr"

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


async def _handle_checkout_completed(session: dict, db: AsyncSession) -> None:
    user_id = session.get("client_reference_id") or session.get("metadata", {}).get("user_id")
    tier    = session.get("metadata", {}).get("tier", "solo")

    if not user_id:
        logger.error("checkout.session.completed missing user_id: %s", session.get("id"))
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
    client_name = f"{TIERS[tier]['label']} — {user.email}"
    client = Client(name=client_name)
    db.add(client)
    await db.flush()  # get client.id

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
        stripe_customer_id=session.get("customer", ""),
        stripe_subscription_id=session.get("subscription"),
        tier=tier,
        status="active",
    ))

    await db.commit()
    logger.info("User %s activated on tier %s, client %s", user_id, tier, client.id)


async def _handle_subscription_change(sub: dict, db: AsyncSession) -> None:
    stripe_sub_id = sub.get("id")
    new_status    = sub.get("status", "canceled")

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
