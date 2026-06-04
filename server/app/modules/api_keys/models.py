# SPDX-FileCopyrightText: 2026 Kevin Stenzel
#
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    hashed_key = Column(String, unique=True, nullable=False)
    permission = Column(String, nullable=False)  # "read" or "read_write"
    # Optionale Bindung an genau einen Server (IDOR-Schutz fuer Agent-Keys an den
    # frp/provision-Endpoints). NULL = globaler Key (Browser-Extension/Sync-URLs).
    server_id = Column(
        String, ForeignKey("servers.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at = Column(DateTime, server_default=func.now())
