# SPDX-FileCopyrightText: 2026 Kevin Stenzel
#
# SPDX-License-Identifier: GPL-3.0-or-later

"""Enrollment-token cleanup (F6): the table must not grow without bound. A token
is single-use and short-lived, so once it is consumed (used_at set) or past its
expiry it is dead weight and gets pruned by a periodic system job — mirroring the
JWT blacklist cleanup."""

from __future__ import annotations

import datetime
import uuid

from app.modules.enrollment.models import (
    EnrollmentToken,
    cleanup_finished_enrollment_tokens,
)


def _token(*, used: bool = False, expired: bool = False) -> EnrollmentToken:
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    return EnrollmentToken(
        id=str(uuid.uuid4()),
        hashed_token=str(uuid.uuid4()),
        subject_id="subject",
        scope="access",
        browser=False,
        expires_at=(now - datetime.timedelta(minutes=5))
        if expired
        else (now + datetime.timedelta(minutes=5)),
        used_at=now if used else None,
    )


def test_cleanup_removes_used_and_expired_keeps_valid(db_session):
    valid = _token()
    used = _token(used=True)
    expired = _token(expired=True)
    db_session.add_all([valid, used, expired])
    db_session.commit()

    removed = cleanup_finished_enrollment_tokens(db_session)
    assert removed == 2

    remaining = db_session.query(EnrollmentToken).all()
    assert [r.id for r in remaining] == [valid.id]


def test_cleanup_noop_when_all_tokens_live(db_session):
    db_session.add_all([_token(), _token()])
    db_session.commit()

    assert cleanup_finished_enrollment_tokens(db_session) == 0
    assert db_session.query(EnrollmentToken).count() == 2
