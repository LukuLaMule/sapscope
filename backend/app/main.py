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
from .limiter import limiter
from .models import Base, OnboardingToken, PasswordResetToken, User
from .reporter import send_daily_reports
from .routers import admin, analysis, auth, billing, diff, history, notes, snapshots
from .routers.benchmarks import router as benchmarks_router
from .routers.compliance import router as compliance_router
from .routers.agent_logs import router as agent_logs_router
from .routers.heartbeat import router as heartbeat_router
from .routers.notifications import router as notifications_router
from .routers.reports import router as reports_router
from .routers.trends import router as trends_router
from .scheduled_reports import send_scheduled_reports
from .settings import settings

logger = logging.getLogger(__name__)


async def _create_admin_if_needed() -> None:
    """Au premier démarrage, crée le compte admin si ADMIN_EMAIL est défini et qu'aucun user n'existe."""
    if not settings.admin_email or not settings.admin_password:
        return
    import bcrypt
    from sqlalchemy import select
    from .database import SessionLocal
    async with SessionLocal() as db:
        count = (await db.execute(select(User))).scalars().first()
        if count is not None:
            return
        hashed = bcrypt.hashpw(settings.admin_password.encode(), bcrypt.gensalt()).decode()
        admin = User(email=settings.admin_email, password_hash=hashed, is_admin=True)
        db.add(admin)
        await db.commit()
        logger.info("Compte admin créé automatiquement : %s", settings.admin_email)


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
    await _create_admin_if_needed()

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
    scheduler.add_job(
        send_scheduled_reports,
        CronTrigger(minute=0),
        id="scheduled_reports",
        replace_existing=True,
    )
    logger.info("Job 'scheduled_reports' enregistré (toutes les heures)")
    from .decommission_detector import run_decommission_detection
    scheduler.add_job(
        run_decommission_detection,
        CronTrigger(minute=30),  # toutes les heures à H:30
        id="decommission_detection",
        replace_existing=True,
    )
    logger.info("Job 'decommission_detection' enregistré (toutes les heures à H:30)")
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
app.include_router(benchmarks_router)
app.include_router(trends_router)
app.include_router(compliance_router)
app.include_router(diff.router)
app.include_router(history.router)
app.include_router(notes.router)
app.include_router(admin.router)
app.include_router(billing.router)
app.include_router(notifications_router)
app.include_router(reports_router)
app.include_router(agent_logs_router)
app.include_router(heartbeat_router)


@app.get("/healthz", tags=["ops"])
async def healthz():
    return {"status": "ok"}
