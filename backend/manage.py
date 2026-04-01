#!/usr/bin/env python3
"""
SAPscope management CLI — use when locked out or for maintenance.

Commands:
    list-users                              List all users
    reset-password --email X --password Y  Reset any user's password
    set-admin      --email X --admin true  Promote or demote admin
    delete-user    --email X               Delete a user (irreversible)

Usage (from backend/ directory, with DATABASE_URL set):
    docker compose exec backend python manage.py list-users
    docker compose exec backend python manage.py reset-password --email admin@example.com --password newpassword123
    docker compose exec backend python manage.py set-admin --email user@example.com --admin true
    docker compose exec backend python manage.py delete-user --email olduser@example.com
"""

import argparse
import asyncio
import sys
from getpass import getpass
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass

from sqlalchemy import func, select
from app.auth import hash_password
from app.database import SessionLocal, engine
from app.models import Base, User


async def cmd_list_users() -> None:
    async with SessionLocal() as db:
        rows = await db.execute(select(User).order_by(User.email))
        users = rows.scalars().all()
        if not users:
            print("No users found.")
            return
        print(f"{'EMAIL':<40} {'ADMIN':<6} {'ID'}")
        print("-" * 80)
        for u in users:
            print(f"{u.email:<40} {'yes' if u.is_admin else 'no':<6} {u.id}")


async def cmd_reset_password(email: str, password: str) -> None:
    if len(password) < 12:
        print("ERROR: password must be at least 12 characters.", file=sys.stderr)
        sys.exit(1)
    async with SessionLocal() as db:
        row = await db.execute(select(User).where(User.email == email))
        user = row.scalar_one_or_none()
        if user is None:
            print(f"ERROR: user '{email}' not found.", file=sys.stderr)
            sys.exit(1)
        user.password_hash = hash_password(password)
        await db.commit()
        print(f"Password updated for {email}.")


async def cmd_set_admin(email: str, is_admin: bool) -> None:
    async with SessionLocal() as db:
        row = await db.execute(select(User).where(User.email == email))
        user = row.scalar_one_or_none()
        if user is None:
            print(f"ERROR: user '{email}' not found.", file=sys.stderr)
            sys.exit(1)
        if not is_admin:
            # Prevent removing the last admin
            count = await db.execute(
                select(func.count()).select_from(User).where(User.is_admin == True, User.id != user.id)
            )
            if count.scalar() == 0:
                print("ERROR: cannot demote the last admin.", file=sys.stderr)
                sys.exit(1)
        user.is_admin = is_admin
        await db.commit()
        action = "promoted to admin" if is_admin else "demoted to consultant"
        print(f"{email} {action}.")


async def cmd_delete_user(email: str) -> None:
    async with SessionLocal() as db:
        row = await db.execute(select(User).where(User.email == email))
        user = row.scalar_one_or_none()
        if user is None:
            print(f"ERROR: user '{email}' not found.", file=sys.stderr)
            sys.exit(1)
        if user.is_admin:
            count = await db.execute(
                select(func.count()).select_from(User).where(User.is_admin == True, User.id != user.id)
            )
            if count.scalar() == 0:
                print("ERROR: cannot delete the last admin.", file=sys.stderr)
                sys.exit(1)
        await db.delete(user)
        await db.commit()
        print(f"User {email} deleted.")


def main() -> None:
    parser = argparse.ArgumentParser(description="SAPscope management CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list-users", help="List all users")

    p_reset = sub.add_parser("reset-password", help="Reset a user's password")
    p_reset.add_argument("--email",    required=True)
    p_reset.add_argument("--password", default=None)

    p_admin = sub.add_parser("set-admin", help="Promote or demote admin")
    p_admin.add_argument("--email",  required=True)
    p_admin.add_argument("--admin",  required=True, choices=["true", "false"])

    p_del = sub.add_parser("delete-user", help="Delete a user")
    p_del.add_argument("--email", required=True)

    args = parser.parse_args()

    if args.command == "list-users":
        asyncio.run(cmd_list_users())

    elif args.command == "reset-password":
        password = args.password or getpass("New password (min 12 chars): ")
        asyncio.run(cmd_reset_password(args.email, password))

    elif args.command == "set-admin":
        asyncio.run(cmd_set_admin(args.email, args.admin == "true"))

    elif args.command == "delete-user":
        confirm = input(f"Delete {args.email}? This is irreversible. Type 'yes' to confirm: ")
        if confirm.strip().lower() != "yes":
            print("Aborted.")
            sys.exit(0)
        asyncio.run(cmd_delete_user(args.email))


if __name__ == "__main__":
    main()
