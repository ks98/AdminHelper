# SPDX-FileCopyrightText: 2026 Kevin Stenzel
#
# SPDX-License-Identifier: GPL-3.0-or-later

"""IDOR-Schutz an den frp/provision-Endpoints.

Befund: GET /api/frp/provision/{server_id}/config (+/config-hash) gab mit JEDEM
gueltigen read-API-Key die frpc.toml (globaler frps auth.token + STCP-Secrets)
fuer eine BELIEBIGE server_id zurueck. Fix: API-Keys an server_id binden und am
Endpoint strikt pruefen. Diese Tests schlagen ohne den Endpoint-Check fehl.
"""

import secrets

from app.core.auth import hash_api_key
from app.modules.api_keys.models import ApiKey
from app.modules.servers.models import Server


def _server(db, sid: str, name: str) -> Server:
    srv = Server(id=sid, name=name, hostname=f"{name}.example.test")
    db.add(srv)
    db.commit()
    return srv


def _api_key(db, *, server_id, name: str | None = None) -> str:
    raw = f"ah_{secrets.token_urlsafe(16)}"
    db.add(
        ApiKey(
            name=name or f"agent-{server_id or 'global'}",
            hashed_key=hash_api_key(raw),
            permission="read",
            server_id=server_id,
        )
    )
    db.commit()
    return raw


class TestFrpProvisionConfigIDOR:
    def test_bound_key_denied_for_other_server(self, test_client, db_session):
        _server(db_session, "srv-a", "server-a")
        _server(db_session, "srv-b", "server-b")
        key_a = _api_key(db_session, server_id="srv-a")
        # Fremder Server -> 403, BEVOR Existenz/Config geprueft wird.
        for path in ("config", "config-hash"):
            res = test_client.get(
                f"/api/frp/provision/srv-b/{path}", headers={"X-API-Key": key_a}
            )
            assert res.status_code == 403, (path, res.status_code, res.text)

    def test_bound_key_passes_scope_for_own_server(self, test_client, db_session):
        _server(db_session, "srv-a", "server-a")
        key_a = _api_key(db_session, server_id="srv-a")
        # Scope ok -> NICHT 403 (404 'keine FRP-Config vorhanden' ist hier erwartbar).
        res = test_client.get(
            "/api/frp/provision/srv-a/config", headers={"X-API-Key": key_a}
        )
        assert res.status_code != 403, res.text

    def test_unbound_key_denied(self, test_client, db_session):
        _server(db_session, "srv-a", "server-a")
        key = _api_key(db_session, server_id=None)
        # Strenge Posture (Option B): ungebundener Key -> 403 am provision-Endpoint.
        res = test_client.get(
            "/api/frp/provision/srv-a/config", headers={"X-API-Key": key}
        )
        assert res.status_code == 403, res.text

    def test_admin_jwt_not_server_scoped(self, test_client, db_session, admin_user):
        _server(db_session, "srv-a", "server-a")
        login = test_client.post(
            "/api/auth/login", json={"username": "admin", "password": "adminpass"}
        )
        token = login.json()["access_token"]
        # JWT-User (Admin) sind nicht server-gebunden -> kein 403.
        res = test_client.get(
            "/api/frp/provision/srv-a/config",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code != 403, res.text
