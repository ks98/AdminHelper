import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Any

from ..auth import ApiKeyOrUser, get_current_admin
from ..storage import load_connections, save_connections
from .. import models

router = APIRouter(prefix="/api/connections", tags=["connections"])

read_dep = ApiKeyOrUser(require_write=False)
write_dep = ApiKeyOrUser(require_write=True)


@router.get("", response_model=list[dict[str, Any]])
def get_connections(auth=Depends(read_dep)):
    return load_connections()


@router.post("", response_model=dict[str, Any], status_code=status.HTTP_201_CREATED)
def create_connection(connection: dict[str, Any], auth=Depends(write_dep)):
    user, api_key = auth
    # Nur Admins dürfen über JWT schreiben; API-Keys mit read_write auch
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin-Rechte erforderlich")
    connection["id"] = str(uuid.uuid4())
    connections = load_connections()
    connections.append(connection)
    save_connections(connections)
    return connection


@router.put("/{conn_id}", response_model=dict[str, Any])
def update_connection(conn_id: str, connection: dict[str, Any], auth=Depends(write_dep)):
    user, api_key = auth
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin-Rechte erforderlich")
    connections = load_connections()
    idx = next((i for i, c in enumerate(connections) if c.get("id") == conn_id), None)
    if idx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verbindung nicht gefunden")
    connections[idx] = connection
    save_connections(connections)
    return connection


@router.delete("/{conn_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(conn_id: str, current_user: models.User = Depends(get_current_admin)):
    connections = load_connections()
    new_connections = [c for c in connections if c.get("id") != conn_id]
    if len(new_connections) == len(connections):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verbindung nicht gefunden")
    save_connections(new_connections)
