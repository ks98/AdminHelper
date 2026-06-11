# SPDX-FileCopyrightText: 2026 Kevin Stenzel
#
# SPDX-License-Identifier: GPL-3.0-or-later

"""Enrollment-token minting for human clients (ADR 0001 §3.3 / A5).

The desktop (and later the browser) authenticates with its JWT and mints a
one-time, access-scoped enrollment token, then redeems it at the ca-issuer to
get its mTLS client cert. This is the human counterpart to provision/activate
(which mints a tunnel-scoped token for agents). Deliberately JWT-gated, NOT
cert-gated: the client has no cert yet — this is its bootstrap door.
"""

from __future__ import annotations

import datetime
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import generate_api_key, get_current_user, hash_api_key
from app.core.config import ENROLL_PORT
from app.core.database import get_db
from app.core.identity import SCOPE_ACCESS
from app.modules.enrollment.models import EnrollmentToken
from app.modules.users.models import User

router = APIRouter(prefix="/api/enrollment", tags=["enrollment"])

# Long enough for the client to enroll right after login, short enough to limit
# exposure of the single-use grant (matches the provision-token window).
_ENROLL_TOKEN_TTL = datetime.timedelta(minutes=10)


@router.post("/token")
def mint_enrollment_token(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mint a one-time access-scoped enrollment token for the logged-in user.

    Identity (the cert CN) is the username, issuer-dictated — never taken from
    the client's CSR. Hashed at rest with the same SHA-256 the ca-issuer consumes
    by."""
    raw_token = generate_api_key()
    db.add(
        EnrollmentToken(
            id=str(uuid.uuid4()),
            hashed_token=hash_api_key(raw_token),
            subject_id=current_user.username,
            scope=SCOPE_ACCESS,
            browser=False,
            expires_at=datetime.datetime.now(datetime.timezone.utc) + _ENROLL_TOKEN_TTL,
        )
    )
    db.commit()
    return {
        "token": raw_token,
        "subjectId": current_user.username,
        "scope": SCOPE_ACCESS,
        # The client derives the enroll host from its own (already-trusted) server
        # URL + this port (the gateway's certless enroll plane).
        "enrollPort": ENROLL_PORT,
    }
