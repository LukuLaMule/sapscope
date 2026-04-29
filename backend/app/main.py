"""SAPscope backend — FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import delete

from .database import engine
from .license import validate as validate_license
from .limiter import limiter
from .models import Base, OnboardingToken, PasswordResetToken
from .reporter import send_daily_reports
from .routers import admin, analysis, auth, billing, diff, history, license_server, license_status, notes, snapshots
from .settings import settings

logger = logging.getLogger(__name__)

# Validate license at import time so it appears in startup logs
license_info = validate_license(settings.license_key)


async def _purge_expired_tokens() -> None:
    """Supprime les tokens expirés au démarrage pour garder la base propre."""
    from .database import SessionLocal
    async with SessionLocal() as db:
        now = datetime.now(timezone.utc)
        r1 = await db.execute(
            delete(PasswordResetToken).where(PasswordResetToken.expires_at < now)
        )
        # Les onboarding tokens n'ont pas d'expiry explicite — on purge ceux de plus de 24h
        from datetime import timedelta
        cutoff = now - timedelta(hours=24)
        r2 = await db.execute(
            delete(OnboardingToken).where(OnboardingToken.created_at < cutoff)
        )
        await db.commit()
        total = r1.rowcount + r2.rowcount
        if total:
            logger.info("Purged %d expired token(s) at startup", total)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _purge_expired_tokens()
    if license_info.mode == "self-hosted":
        if not license_info.is_valid:
            logger.error("INVALID LICENSE: %s", license_info.warning)
        elif license_info.warning:
            logger.warning("LICENSE WARNING: %s", license_info.warning)
        else:
            logger.info(
                "Self-hosted license OK — org=%s tier=%s", license_info.org, license_info.tier
            )

    # Rapport journalier automatique
    scheduler = AsyncIOScheduler(timezone=settings.report_tz)
    if settings.report_enabled:
        scheduler.add_job(
            send_daily_reports,
            CronTrigger(hour=settings.report_hour, minute=0, timezone=settings.report_tz),
            id="daily_report",
            replace_existing=True,
        )
        logger.info(
            "Rapport journalier activé — envoi chaque jour à %02dh00 (%s)",
            settings.report_hour, settings.report_tz,
        )
    scheduler.start()

    yield

    scheduler.shutdown(wait=False)


app = FastAPI(
    title="SAPscope API",
    version="1.0.0",
    docs_url="/docs" if settings.env == "development" else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


# Enforce HTTPS in production
@app.middleware("http")
async def https_redirect(request: Request, call_next):
    if settings.env != "development":
        if request.headers.get("x-forwarded-proto") == "http":
            return JSONResponse(
                status_code=status.HTTP_301_MOVED_PERMANENTLY,
                headers={"Location": str(request.url).replace("http://", "https://", 1)},
            )
    return await call_next(request)


app.include_router(auth.router)
app.include_router(snapshots.router)
app.include_router(analysis.router)
app.include_router(diff.router)
app.include_router(history.router)
app.include_router(notes.router)
app.include_router(admin.router)
app.include_router(billing.router)
app.include_router(license_status.router)
if settings.is_license_server:
    app.include_router(license_server.router)


@app.get("/healthz", tags=["ops"])
async def healthz():
    info: dict = {"status": "ok", "mode": license_info.mode}
    if license_info.mode == "self-hosted":
        info["license"] = {
            "org":   license_info.org,
            "tier":  license_info.tier,
            "valid": license_info.is_valid,
        }
        if license_info.warning:
            info["license"]["warning"] = license_info.warning
    return info
