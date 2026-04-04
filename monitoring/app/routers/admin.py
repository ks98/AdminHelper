"""Agent-Key Management und Server-Cleanup."""

from __future__ import annotations

import secrets
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import require_internal
from app.core.database import get_db
from app.models import MonitorAgentKey
from app.template_sync import cleanup_server

router = APIRouter()


@router.post("/agent-keys/{server_id}", dependencies=[Depends(require_internal)])
def create_agent_key(server_id: str, db: Session = Depends(get_db)):
    """Generiert einen neuen Agent-API-Key fuer einen Server.

    Der Raw-Key wird nur bei Neuerstellung zurueckgegeben. Bei bestehendem
    Key muss dieser neu generiert werden (DELETE + POST).
    """
    # Bei bestehendem Key: alten loeschen und neu generieren
    existing = db.query(MonitorAgentKey).filter(MonitorAgentKey.server_id == server_id).first()
    if existing:
        db.delete(existing)
        db.flush()

    raw_key = secrets.token_urlsafe(48)
    key = MonitorAgentKey(
        id=str(uuid.uuid4()),
        server_id=server_id,
        hashed_key=MonitorAgentKey.hash_key(raw_key),
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    d = key.to_dict()
    d["apiKey"] = raw_key  # Einmalig den Raw-Key zurueckgeben
    return d


@router.delete("/agent-keys/{server_id}", dependencies=[Depends(require_internal)])
def delete_agent_key(server_id: str, db: Session = Depends(get_db)):
    """Loescht den Agent-API-Key eines Servers."""
    db.query(MonitorAgentKey).filter(MonitorAgentKey.server_id == server_id).delete()
    db.commit()
    return {"deleted": True}


@router.delete("/servers/{server_id}/cleanup", dependencies=[Depends(require_internal)])
def server_cleanup(server_id: str, db: Session = Depends(get_db)):
    """Alle Monitoring-Daten eines Servers bereinigen."""
    result = cleanup_server(db, server_id)
    return result
