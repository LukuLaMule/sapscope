"""SAPscope backend — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .database import engine
from .models import Base
from .routers import admin, analysis, auth, snapshots
from .settings import settings

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


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
    allow_methods=["GET", "POST"],
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
app.include_router(admin.router)


@app.get("/healthz", tags=["ops"])
async def healthz():
    return {"status": "ok"}
