"""
Two separate auth paths:

  AgentToken  →  write-only (POST /snapshots)
  User JWT    →  read-only  (GET dashboard endpoints)

The agent never gets read access.
The consultant never gets write access.
"""

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .database import get_db
from .models import AgentToken, Client, User, UserClient

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=True)

JWT_SECRET = os.environ["SAPSCOPE_JWT_SECRET"]
if len(JWT_SECRET) < 32:
    raise RuntimeError("SAPSCOPE_JWT_SECRET must be at least 32 characters")

JWT_ALGORITHM = "HS256"
JWT_TTL_HOURS = 8


# ── Agent auth (write-only) ───────────────────────────────────────────────────

async def get_client_for_agent(
    credentials: HTTPAuthorizationCredentials = Security(_bearer),
    db: AsyncSession = Depends(get_db),
) -> Client:
    """Validates an agent token. Returns the associated Client."""
    token_hash = AgentToken.hash(credentials.credentials)
    row = await db.execute(
        select(AgentToken)
        .options(selectinload(AgentToken.client))
        .where(AgentToken.token_hash == token_hash)
    )
    agent_token = row.scalar_one_or_none()
    if agent_token is None or agent_token.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked agent token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return agent_token.client


# ── Consultant auth (read-only) ───────────────────────────────────────────────

def create_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "jti": str(uuid.uuid4()),
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validates a consultant JWT. Returns the User."""
    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp", "iat", "jti"]},
        )
        user_id: str = payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
            headers={"WWW-Authenticate": "Bearer"},
        )
    row = await db.execute(select(User).where(User.id == user_id))
    user = row.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def get_client_for_user(
    client_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Client:
    if user.is_admin:
        row = await db.execute(select(Client).where(Client.id == client_id))
    else:
        row = await db.execute(
            select(Client)
            .join(UserClient, UserClient.client_id == Client.id)
            .where(Client.id == client_id, UserClient.user_id == user.id)
        )
    client = row.scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return client


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())
