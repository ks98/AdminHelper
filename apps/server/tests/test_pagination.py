# SPDX-FileCopyrightText: 2026 Kevin Stenzel
#
# SPDX-License-Identifier: GPL-3.0-or-later

"""Backwards-compatible pagination (audit P4) for the list endpoints
/api/servers, /api/connections and /api/hooks.

Pinned per endpoint: (a) no params = full list (legacy behaviour),
(b) limit/offset slice in SQL + X-Total-Count carries the total,
(c) limit=0 / negative values are rejected with 422. For /api/connections
additionally: pagination and total apply AFTER the per-user scoping."""

import secrets

from app.core.auth import hash_api_key
from app.modules.api_keys.models import ApiKey
from app.modules.connections.models import Connection
from app.modules.hooks.models import Hook
from app.modules.servers.models import Server

INVALID_QUERIES = ("limit=0", "limit=-1", "limit=1001", "offset=-1")


def _login(client, username: str, password: str) -> dict:
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _read_api_key(db) -> dict:
    raw = f"ah_{secrets.token_urlsafe(16)}"
    db.add(ApiKey(name="k-read", hashed_key=hash_api_key(raw), permission="read"))
    db.commit()
    return {"X-API-Key": raw}


def _make_servers(db, n: int = 5) -> None:
    for i in range(n):
        db.add(Server(id=f"srv-{i}", name=f"server-{i}", hostname=f"host-{i}"))
    db.commit()


class TestServersPagination:
    def test_no_params_returns_full_list(self, test_client, db_session, admin_user):
        _make_servers(db_session)
        headers = _login(test_client, "admin", "adminpass")
        r = test_client.get("/api/servers", headers=headers)
        assert r.status_code == 200, r.text
        assert [s["name"] for s in r.json()] == [f"server-{i}" for i in range(5)]
        assert r.headers["X-Total-Count"] == "5"

    def test_limit_offset_slice(self, test_client, db_session, admin_user):
        _make_servers(db_session)
        headers = _login(test_client, "admin", "adminpass")
        r = test_client.get("/api/servers?limit=2&offset=1", headers=headers)
        assert r.status_code == 200, r.text
        assert [s["name"] for s in r.json()] == ["server-1", "server-2"]
        assert r.headers["X-Total-Count"] == "5"

    def test_offset_without_limit(self, test_client, db_session, admin_user):
        _make_servers(db_session)
        headers = _login(test_client, "admin", "adminpass")
        r = test_client.get("/api/servers?offset=3", headers=headers)
        assert r.status_code == 200, r.text
        assert [s["name"] for s in r.json()] == ["server-3", "server-4"]
        assert r.headers["X-Total-Count"] == "5"

    def test_invalid_params_rejected(self, test_client, db_session, admin_user):
        headers = _login(test_client, "admin", "adminpass")
        for q in INVALID_QUERIES:
            r = test_client.get(f"/api/servers?{q}", headers=headers)
            assert r.status_code == 422, f"{q}: {r.status_code} {r.text}"


class TestConnectionsPagination:
    def _make_connections(
        self, db, n: int = 5, server_id: str | None = None, prefix: str = "conn"
    ) -> None:
        for i in range(n):
            db.add(
                Connection(
                    id=f"{prefix}-{i}", name=f"{prefix}-{i}", kind="ssh", server_id=server_id
                )
            )
        db.commit()

    def test_no_params_returns_full_list(self, test_client, db_session):
        self._make_connections(db_session)
        headers = _read_api_key(db_session)
        r = test_client.get("/api/connections", headers=headers)
        assert r.status_code == 200, r.text
        assert [c["name"] for c in r.json()] == [f"conn-{i}" for i in range(5)]
        assert r.headers["X-Total-Count"] == "5"

    def test_limit_offset_slice(self, test_client, db_session):
        self._make_connections(db_session)
        headers = _read_api_key(db_session)
        r = test_client.get("/api/connections?limit=2&offset=2", headers=headers)
        assert r.status_code == 200, r.text
        assert [c["name"] for c in r.json()] == ["conn-2", "conn-3"]
        assert r.headers["X-Total-Count"] == "5"

    def test_invalid_params_rejected(self, test_client, db_session):
        headers = _read_api_key(db_session)
        for q in INVALID_QUERIES:
            r = test_client.get(f"/api/connections?{q}", headers=headers)
            assert r.status_code == 422, f"{q}: {r.status_code} {r.text}"

    def test_pagination_applies_after_user_scoping(self, test_client, db_session, normal_user):
        # 3 connections on the user's server, 3 on a foreign one. The page and
        # X-Total-Count must only ever see the scoped 3 — not the full table.
        own = Server(id="srv-own", name="own", hostname="own.example")
        foreign = Server(id="srv-foreign", name="foreign", hostname="foreign.example")
        db_session.add_all([own, foreign])
        normal_user.servers.append(own)
        db_session.commit()
        self._make_connections(db_session, n=3, server_id="srv-own", prefix="own")
        self._make_connections(db_session, n=3, server_id="srv-foreign", prefix="foreign")

        headers = _login(test_client, "viewer", "viewerpass")
        r = test_client.get("/api/connections?limit=2&offset=1", headers=headers)
        assert r.status_code == 200, r.text
        assert [c["name"] for c in r.json()] == ["own-1", "own-2"]
        assert r.headers["X-Total-Count"] == "3"


class TestHooksPagination:
    def _make_hooks(self, db, n: int = 5) -> None:
        # created_at (server_default now()) is identical inside one transaction,
        # so the id tiebreaker determines the order.
        for i in range(n):
            db.add(
                Hook(
                    id=f"hook-{i}",
                    name=f"hook-{i}",
                    hook_type="event",
                    script="result = {}",
                    enabled=True,
                    event_triggers='["connection.created"]',
                )
            )
        db.commit()

    def test_no_params_returns_full_list(self, test_client, db_session, admin_user):
        self._make_hooks(db_session)
        headers = _login(test_client, "admin", "adminpass")
        r = test_client.get("/api/hooks", headers=headers)
        assert r.status_code == 200, r.text
        assert [h["name"] for h in r.json()] == [f"hook-{i}" for i in range(5)]
        assert r.headers["X-Total-Count"] == "5"

    def test_limit_offset_slice(self, test_client, db_session, admin_user):
        self._make_hooks(db_session)
        headers = _login(test_client, "admin", "adminpass")
        r = test_client.get("/api/hooks?limit=3&offset=1", headers=headers)
        assert r.status_code == 200, r.text
        assert [h["name"] for h in r.json()] == ["hook-1", "hook-2", "hook-3"]
        assert r.headers["X-Total-Count"] == "5"

    def test_invalid_params_rejected(self, test_client, db_session, admin_user):
        headers = _login(test_client, "admin", "adminpass")
        for q in INVALID_QUERIES:
            r = test_client.get(f"/api/hooks?{q}", headers=headers)
            assert r.status_code == 422, f"{q}: {r.status_code} {r.text}"
