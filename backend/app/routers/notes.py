"""Notes libres par système SAP."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import Client, SystemNote, User, UserClient

router = APIRouter(prefix="/api/v1/clients/{client_id}", tags=["notes"])


async def _check_access(client_id: str, user: User, db: AsyncSession) -> None:
    """Admin ou consultant assigné au client."""
    if user.is_admin:
        return
    row = await db.execute(
        select(UserClient).where(
            UserClient.user_id == user.id,
            UserClient.client_id == client_id,
        )
    )
    if not row.scalar_one_or_none():
        raise HTTPException(403, "Access denied")
    # Vérifier que le client existe
    c = await db.execute(select(Client).where(Client.id == client_id))
    if not c.scalar_one_or_none():
        raise HTTPException(404, "Client not found")


class NoteIn(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class NoteOut(BaseModel):
    id: str
    system_sid: str
    content: str
    author_email: str
    created_at: str
    updated_at: str | None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_obj(cls, n: SystemNote) -> "NoteOut":
        return cls(
            id=n.id,
            system_sid=n.system_sid,
            content=n.content,
            author_email=n.author_email,
            created_at=n.created_at.isoformat(),
            updated_at=n.updated_at.isoformat() if n.updated_at else None,
        )


@router.get("/systems/{sid}/notes", response_model=list[NoteOut])
async def list_notes(
    client_id: str,
    sid: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_access(client_id, user, db)
    rows = await db.execute(
        select(SystemNote)
        .where(SystemNote.client_id == client_id, SystemNote.system_sid == sid)
        .order_by(SystemNote.created_at.desc())
    )
    return [NoteOut.from_orm_obj(n) for n in rows.scalars()]


@router.post("/systems/{sid}/notes", response_model=NoteOut, status_code=201)
async def create_note(
    client_id: str,
    sid: str,
    body: NoteIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_access(client_id, user, db)
    note = SystemNote(
        client_id=client_id,
        system_sid=sid,
        content=body.content,
        author_email=user.email,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return NoteOut.from_orm_obj(note)


@router.patch("/systems/{sid}/notes/{note_id}", response_model=NoteOut)
async def update_note(
    client_id: str,
    sid: str,
    note_id: str,
    body: NoteIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_access(client_id, user, db)
    row = await db.execute(
        select(SystemNote).where(
            SystemNote.id == note_id,
            SystemNote.client_id == client_id,
            SystemNote.system_sid == sid,
        )
    )
    note = row.scalar_one_or_none()
    if not note:
        raise HTTPException(404, "Note not found")
    # Only author or admin can edit
    if note.author_email != user.email and not user.is_admin:
        raise HTTPException(403, "Not your note")
    note.content = body.content
    await db.commit()
    await db.refresh(note)
    return NoteOut.from_orm_obj(note)


@router.delete("/systems/{sid}/notes/{note_id}", status_code=204)
async def delete_note(
    client_id: str,
    sid: str,
    note_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_access(client_id, user, db)
    row = await db.execute(
        select(SystemNote).where(
            SystemNote.id == note_id,
            SystemNote.client_id == client_id,
            SystemNote.system_sid == sid,
        )
    )
    note = row.scalar_one_or_none()
    if not note:
        raise HTTPException(404, "Note not found")
    if note.author_email != user.email and not user.is_admin:
        raise HTTPException(403, "Not your note")
    await db.delete(note)
    await db.commit()
