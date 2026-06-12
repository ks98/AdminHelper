# SPDX-FileCopyrightText: 2026 Kevin Stenzel
#
# SPDX-License-Identifier: GPL-3.0-or-later

"""Management CLI (`app.cli`): the install-time bootstrap of the first admin +
its enrollment token, so a fresh deployment can come up with mTLS enforced."""

from __future__ import annotations

from app.cli import create_admin, mint_enroll_token
from app.core.auth import hash_api_key, verify_password
from app.core.identity import SCOPE_ACCESS
from app.modules.enrollment.models import EnrollmentToken
from app.modules.users.models import User


def test_create_admin_creates_hashed_admin(db_session):
    assert create_admin(db_session, "kevin", "supersecret") == 0
    user = db_session.query(User).filter_by(username="kevin").one()
    assert user.is_admin is True
    assert user.hashed_password != "supersecret"
    assert verify_password("supersecret", user.hashed_password)


def test_create_admin_rejects_duplicate_username(db_session, admin_user):
    # admin_user already created "admin"
    assert create_admin(db_session, "admin", "password1") == 1


def test_create_admin_rejects_short_password(db_session):
    assert create_admin(db_session, "kev", "short") == 1
    assert db_session.query(User).filter_by(username="kev").first() is None


def test_mint_enroll_token_for_existing_user(db_session, admin_user):
    token = mint_enroll_token(db_session, "admin", ttl_minutes=60)
    assert token
    row = (
        db_session.query(EnrollmentToken)
        .filter(EnrollmentToken.hashed_token == hash_api_key(token))
        .one()
    )
    assert row.subject_id == "admin"
    assert row.scope == SCOPE_ACCESS
    assert row.browser is False
    assert row.is_valid()


def test_mint_enroll_token_unknown_user_returns_none(db_session):
    assert mint_enroll_token(db_session, "ghost", ttl_minutes=60) is None
