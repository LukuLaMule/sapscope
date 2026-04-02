"""Tests — billing Stripe (checkout, webhook, onboarding, status).

On mock l'API Stripe : pas besoin de vraie clé, les tests tournent en CI comme en local.
Le flow testé : checkout → webhook checkout.session.completed → onboarding token → GET /onboarding.
"""

import json
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Client, OnboardingToken, Subscription, UserClient

from .conftest import login

pytestmark = pytest.mark.asyncio


# ── Helpers ────────────────────────────────────────────────────────────────────

def _stripe_settings():
    """Retourne un context manager qui active tous les settings Stripe."""
    return patch.multiple(
        "app.routers.billing.settings",
        stripe_secret_key="sk_test_fake",
        stripe_webhook_secret="whsec_fake",
        stripe_price_solo="price_solo_fake",
        stripe_price_team="price_team_fake",
        stripe_price_enterprise="price_ent_fake",
    )


def _mock_sc():
    """Retourne un faux StripeClient pré-configuré."""
    sc = MagicMock()
    fake_session = MagicMock()
    fake_session.url = "https://checkout.stripe.com/pay/cs_test_fake"
    sc.checkout.sessions.create.return_value = fake_session
    return sc


def _checkout_event(user_id: str, tier: str = "solo") -> dict:
    """Faux event checkout.session.completed envoyé par Stripe."""
    return {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_fake",
                "client_reference_id": user_id,
                "customer": "cus_test_fake",
                "subscription": "sub_test_fake",
                "metadata": {"tier": tier, "user_id": user_id},
            }
        },
    }


def _subscription_event(stripe_sub_id: str, new_status: str) -> dict:
    """Faux event customer.subscription.updated."""
    return {
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": stripe_sub_id,
                "status": new_status,
            }
        },
    }


# ── Checkout ───────────────────────────────────────────────────────────────────

async def test_checkout_requires_auth(client: AsyncClient):
    resp = await client.post("/api/v1/billing/checkout?tier=solo")
    assert resp.status_code == 401


async def test_checkout_invalid_tier_rejected(client: AsyncClient, admin_user):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.post(
        "/api/v1/billing/checkout?tier=premium",
        headers={"Authorization": f"Bearer {token}"},
    )
    # "premium" n'est pas dans le pattern autorisé → FastAPI retourne 422
    assert resp.status_code == 422


async def test_checkout_without_stripe_config(client: AsyncClient, admin_user):
    # Pas de clé Stripe configurée → 503 (on force la clé à None peu importe le .env de dev)
    token = await login(client, "admin@example.com", "AdminPass123!")
    with patch("app.routers.billing.settings.stripe_secret_key", None):
        resp = await client.post(
            "/api/v1/billing/checkout?tier=solo",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 503


async def test_checkout_returns_stripe_url(client: AsyncClient, admin_user):
    token = await login(client, "admin@example.com", "AdminPass123!")
    sc = _mock_sc()

    with _stripe_settings(), \
         patch("app.routers.billing.stripe.StripeClient", return_value=sc):
        resp = await client.post(
            "/api/v1/billing/checkout?tier=solo",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "url" in data
    assert "checkout.stripe.com" in data["url"]
    # Vérifier que le bon price_id a été utilisé
    sc.checkout.sessions.create.assert_called_once()
    call_args = sc.checkout.sessions.create.call_args[0][0]
    assert call_args["line_items"][0]["price"] == "price_solo_fake"
    assert call_args["metadata"]["tier"] == "solo"


# ── Billing status ─────────────────────────────────────────────────────────────

async def test_billing_status_no_subscription(client: AsyncClient, admin_user):
    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get(
        "/api/v1/billing/status",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"subscribed": False}


async def test_billing_status_after_activation(
    client: AsyncClient,
    admin_user,
    db: AsyncSession,
):
    # Insérer une subscription directement en base
    db.add(Subscription(
        user_id=admin_user.id,
        stripe_customer_id="cus_direct",
        stripe_subscription_id="sub_direct",
        tier="team",
        status="active",
    ))
    await db.commit()

    token = await login(client, "admin@example.com", "AdminPass123!")
    resp = await client.get(
        "/api/v1/billing/status",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["subscribed"] is True
    assert data["tier"] == "team"
    assert data["status"] == "active"


# ── Webhook ────────────────────────────────────────────────────────────────────

async def test_webhook_without_secret_returns_503(client: AsyncClient):
    # Forcer le secret à None peu importe le .env de dev
    with patch("app.routers.billing.settings.stripe_webhook_secret", None):
        resp = await client.post(
            "/api/v1/billing/webhook",
            content=b"{}",
            headers={"stripe-signature": "v1=fake"},
        )
    assert resp.status_code == 503


async def test_webhook_invalid_signature_returns_400(client: AsyncClient):
    import stripe as stripe_lib

    sc = MagicMock()
    sc.construct_event.side_effect = stripe_lib.SignatureVerificationError("bad", "hdr")

    with patch("app.routers.billing.settings.stripe_webhook_secret", "whsec_fake"), \
         patch("app.routers.billing._stripe_client", return_value=sc):
        resp = await client.post(
            "/api/v1/billing/webhook",
            content=b"{}",
            headers={"stripe-signature": "v1=tampered"},
        )
    assert resp.status_code == 400


async def test_webhook_checkout_activates_user(
    client: AsyncClient,
    regular_user,
    db: AsyncSession,
):
    event = _checkout_event(regular_user.id, tier="solo")
    sc = MagicMock()
    sc.construct_event.return_value = event

    with patch("app.routers.billing.settings.stripe_webhook_secret", "whsec_fake"), \
         patch("app.routers.billing._stripe_client", return_value=sc):
        resp = await client.post(
            "/api/v1/billing/webhook",
            content=json.dumps(event).encode(),
            headers={
                "stripe-signature": "v1=bypassed",
                "content-type": "application/json",
            },
        )
    assert resp.status_code == 200

    # Subscription créée
    row = await db.execute(select(Subscription).where(Subscription.user_id == regular_user.id))
    sub = row.scalar_one_or_none()
    assert sub is not None
    assert sub.tier == "solo"
    assert sub.status == "active"
    assert sub.stripe_customer_id == "cus_test_fake"

    # Client SAP créé et assigné à l'utilisateur
    uc_row = await db.execute(select(UserClient).where(UserClient.user_id == regular_user.id))
    uc = uc_row.scalar_one_or_none()
    assert uc is not None

    # Onboarding token en attente
    ot_row = await db.execute(select(OnboardingToken).where(OnboardingToken.user_id == regular_user.id))
    ot = ot_row.scalar_one_or_none()
    assert ot is not None
    assert len(ot.token_plaintext) >= 32


async def test_webhook_checkout_idempotent(
    client: AsyncClient,
    regular_user,
    db: AsyncSession,
):
    # Envoyer le même event deux fois → pas de doublon
    event = _checkout_event(regular_user.id, tier="team")
    sc = MagicMock()
    sc.construct_event.return_value = event

    ctx = {
        "app.routers.billing.settings.stripe_webhook_secret": "whsec_fake",
    }

    async def _send():
        with patch("app.routers.billing.settings.stripe_webhook_secret", "whsec_fake"), \
             patch("app.routers.billing._stripe_client", return_value=sc):
            return await client.post(
                "/api/v1/billing/webhook",
                content=json.dumps(event).encode(),
                headers={"stripe-signature": "v1=x", "content-type": "application/json"},
            )

    r1 = await _send()
    r2 = await _send()
    assert r1.status_code == 200
    assert r2.status_code == 200

    # Une seule subscription même après deux appels
    rows = await db.execute(select(Subscription).where(Subscription.user_id == regular_user.id))
    subs = rows.scalars().all()
    assert len(subs) == 1


async def test_webhook_subscription_status_update(
    client: AsyncClient,
    regular_user,
    db: AsyncSession,
):
    # Mettre une subscription active en base, puis simuler une mise à jour vers "past_due"
    db.add(Subscription(
        user_id=regular_user.id,
        stripe_customer_id="cus_x",
        stripe_subscription_id="sub_to_update",
        tier="solo",
        status="active",
    ))
    await db.commit()

    event = _subscription_event("sub_to_update", "past_due")
    sc = MagicMock()
    sc.construct_event.return_value = event

    with patch("app.routers.billing.settings.stripe_webhook_secret", "whsec_fake"), \
         patch("app.routers.billing._stripe_client", return_value=sc):
        resp = await client.post(
            "/api/v1/billing/webhook",
            content=json.dumps(event).encode(),
            headers={"stripe-signature": "v1=x", "content-type": "application/json"},
        )
    assert resp.status_code == 200

    row = await db.execute(select(Subscription).where(Subscription.user_id == regular_user.id))
    sub = row.scalar_one_or_none()
    assert sub.status == "past_due"


async def test_webhook_unknown_user_ignored(client: AsyncClient):
    # Si le user_id dans l'event n'existe pas en base, on ignore silencieusement
    event = _checkout_event("00000000-0000-0000-0000-000000000000", tier="solo")
    sc = MagicMock()
    sc.construct_event.return_value = event

    with patch("app.routers.billing.settings.stripe_webhook_secret", "whsec_fake"), \
         patch("app.routers.billing._stripe_client", return_value=sc):
        resp = await client.post(
            "/api/v1/billing/webhook",
            content=json.dumps(event).encode(),
            headers={"stripe-signature": "v1=x", "content-type": "application/json"},
        )
    # Pas d'erreur 500 — on log et on passe
    assert resp.status_code == 200


# ── Onboarding token ───────────────────────────────────────────────────────────

async def test_onboarding_no_pending_token(client: AsyncClient, regular_user):
    token = await login(client, "consultant@example.com", "ConsultPass123!")
    resp = await client.get(
        "/api/v1/billing/onboarding",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["token"] is None


async def test_onboarding_returns_token_then_deletes(
    client: AsyncClient,
    regular_user,
    db: AsyncSession,
):
    # Créer un client SAP et un onboarding token directement en base
    sap_client = Client(name="Solo — consultant@example.com")
    db.add(sap_client)
    await db.flush()

    db.add(OnboardingToken(
        user_id=regular_user.id,
        client_id=sap_client.id,
        token_plaintext="plaintext-agent-token-for-test",
    ))
    await db.commit()

    jwt = await login(client, "consultant@example.com", "ConsultPass123!")

    # Premier appel → reçoit le token
    resp1 = await client.get(
        "/api/v1/billing/onboarding",
        headers={"Authorization": f"Bearer {jwt}"},
    )
    assert resp1.status_code == 200
    data = resp1.json()
    assert data["token"] == "plaintext-agent-token-for-test"
    assert data["client_name"] == "Solo — consultant@example.com"

    # Deuxième appel → plus rien (token consommé)
    resp2 = await client.get(
        "/api/v1/billing/onboarding",
        headers={"Authorization": f"Bearer {jwt}"},
    )
    assert resp2.status_code == 200
    assert resp2.json()["token"] is None
