"""
Test fixtures.

Requires a PostgreSQL database reachable at TEST_DATABASE_URL
(defaults to the same host as production, separate DB "sapscope_test").

  export TEST_DATABASE_URL=postgresql+asyncpg://sapscope:<pw>@db:5432/sapscope_test

Run from the backend/ directory:
  pytest tests/
"""

import os
import secrets

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# ── env vars must be set before importing app modules ─────────────────────────

os.environ["SAPSCOPE_JWT_SECRET"] = "test-secret-key-minimum-32-characters!!"
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-test-placeholder")
os.environ["RATELIMIT_ENABLED"] = "false"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://sapscope:sapscope@db:5432/sapscope_test",
)

from app.auth import hash_password  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import AgentToken, Client, User  # noqa: E402

# ── engine scoped to the whole test session ───────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def engine():
    eng = create_async_engine(os.environ["DATABASE_URL"], poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


# ── per-test DB session wrapped in a rolled-back transaction ──────────────────

@pytest_asyncio.fixture
async def db(engine) -> AsyncSession:
    async with engine.connect() as conn:
        await conn.begin_nested()
        factory = async_sessionmaker(bind=conn, expire_on_commit=False)
        async with factory() as session:
            yield session
        await conn.rollback()


# ── HTTP client wired to the test DB ─────────────────────────────────────────

@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncClient:
    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


# ── Shared data fixtures ──────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def admin_user(db: AsyncSession) -> User:
    user = User(
        email="admin@example.com",
        password_hash=hash_password("AdminPass123!"),
        is_admin=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def regular_user(db: AsyncSession) -> User:
    user = User(
        email="consultant@example.com",
        password_hash=hash_password("ConsultPass123!"),
        is_admin=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_client_obj(db: AsyncSession) -> Client:
    c = Client(name="Test Client SA")
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


@pytest_asyncio.fixture
async def agent_token(db: AsyncSession, test_client_obj: Client) -> tuple[AgentToken, str]:
    plaintext = secrets.token_urlsafe(32)
    token = AgentToken(
        client_id=test_client_obj.id,
        label="test-agent",
        token_hash=AgentToken.hash(plaintext),
        is_revoked=False,
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)
    return token, plaintext


async def login(client: AsyncClient, email: str, password: str) -> str:
    """Helper — returns JWT."""
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]
