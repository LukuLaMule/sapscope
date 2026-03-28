#!/usr/bin/env python3
"""
Create the first admin user.

Usage:
    python bootstrap_admin.py --email admin@example.com --password s3cr3t
    python bootstrap_admin.py  # prompts interactively

Requires DATABASE_URL and SAPSCOPE_JWT_SECRET in environment (or .env).
"""

import argparse
import asyncio
import sys
from getpass import getpass
from pathlib import Path

# Load .env if present
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass

from sqlalchemy import select
from app.auth import hash_password
from app.database import SessionLocal, engine
from app.models import Base, User


async def create_admin(email: str, password: str) -> None:
    if len(password) < 12:
        print("ERROR: password must be at least 12 characters.", file=sys.stderr)
        sys.exit(1)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        existing = await db.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none():
            print(f"User {email} already exists.")
            sys.exit(0)

        user = User(
            email=email,
            password_hash=hash_password(password),
            is_admin=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        print(f"Admin user created: {email} (id={user.id})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap SAPscope admin user")
    parser.add_argument("--email",    help="Admin email address")
    parser.add_argument("--password", help="Admin password (min 12 chars)")
    args = parser.parse_args()

    email    = args.email    or input("Admin email: ").strip()
    password = args.password or getpass("Admin password (min 12 chars): ")

    asyncio.run(create_admin(email, password))


if __name__ == "__main__":
    main()
