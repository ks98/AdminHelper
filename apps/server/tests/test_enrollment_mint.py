# SPDX-FileCopyrightText: 2026 Kevin Stenzel
#
# SPDX-License-Identifier: GPL-3.0-or-later

"""Human enrollment-token minting (A5): a logged-in user mints a one-time,
access-scoped token to redeem at the ca-issuer for its mTLS client cert."""

from __future__ import annotations

from app.core.auth import hash_api_key
from app.modules.enrollment.models import EnrollmentToken


def _login(test_client, username: str, password: str) -> str:
    resp = test_client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def test_mint_returns_access_scoped_token(test_client, admin_user, db_session):
    token = _login(test_client, "admin", "adminpass")
    res = test_client.post("/api/enrollment/token", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["subjectId"] == "admin"  # the cert CN = username, issuer-dictated
    assert body["scope"] == "access"
    assert body["enrollPort"] == 8444
    assert body["token"]

    # The minted row is consumable: hashed with the same SHA-256 the ca-issuer
    # uses, access scope, the username as identity, still valid.
    row = (
        db_session.query(EnrollmentToken)
        .filter(EnrollmentToken.hashed_token == hash_api_key(body["token"]))
        .one()
    )
    assert row.subject_id == "admin"
    assert row.scope == "access"
    assert row.browser is False
    assert row.used_at is None
    assert row.is_valid()


def test_mint_requires_authentication(test_client):
    # No JWT -> the bootstrap door is still auth-gated.
    res = test_client.post("/api/enrollment/token")
    assert res.status_code == 401


def test_mint_uses_the_callers_identity(test_client, normal_user, db_session):
    # A non-admin user mints a token for THEIR username, not someone else's.
    token = _login(test_client, "viewer", "viewerpass")
    res = test_client.post("/api/enrollment/token", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    assert res.json()["subjectId"] == "viewer"
