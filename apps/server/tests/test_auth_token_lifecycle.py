# SPDX-FileCopyrightText: 2026 Kevin Stenzel
#
# SPDX-License-Identifier: GPL-3.0-or-later

"""Auth lifecycle hardening (audit #3 refresh-reuse containment, #4 fail-closed)."""

from app.core.rate_limit import RedisBackend


def _login(client, username="admin", password="adminpass"):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def test_refresh_reuse_kills_whole_token_family(test_client, db_session, admin_user):
    r0 = _login(test_client)["refresh_token"]

    # Attacker refreshes first with the stolen R0 -> gets a fresh, valid pair.
    rot = test_client.post("/api/auth/refresh", json={"refresh_token": r0})
    assert rot.status_code == 200, rot.text
    a1, r1 = rot.json()["access_token"], rot.json()["refresh_token"]
    assert (
        test_client.get("/api/auth/me", headers={"Authorization": f"Bearer {a1}"}).status_code
        == 200
    )

    # Victim later replays R0 -> reuse detected -> 401 AND the whole family dies.
    replay = test_client.post("/api/auth/refresh", json={"refresh_token": r0})
    assert replay.status_code == 401, replay.text

    # The attacker's rotated access token is now rejected...
    assert (
        test_client.get("/api/auth/me", headers={"Authorization": f"Bearer {a1}"}).status_code
        == 401
    )
    # ...and their rotated refresh token can no longer mint new tokens.
    assert test_client.post("/api/auth/refresh", json={"refresh_token": r1}).status_code == 401


class _RedisDown:
    """A Redis client whose every op raises (simulates an outage)."""

    def get(self, key):
        raise RuntimeError("redis down")

    def pipeline(self):
        raise RuntimeError("redis down")

    def delete(self, key):
        raise RuntimeError("redis down")


def test_redis_backend_degrades_to_inmemory_not_fail_open():
    # Before the fix, get_count/increment returned 0 on any Redis error — silently
    # disabling the limit (fail-open). Now they degrade to a local counter so the
    # limit stays enforced during an outage.
    b = RedisBackend(_RedisDown())
    counts = [b.increment("brute:1.2.3.4", 60) for _ in range(5)]
    assert counts == [1, 2, 3, 4, 5], counts  # real counting, NOT stuck at 0
    assert b.get_count("brute:1.2.3.4") == 5
