# SPDX-FileCopyrightText: 2026 Kevin Stenzel
#
# SPDX-License-Identifier: GPL-3.0-or-later

"""partial unique index on frp_tunnels.visitor_port (STCP)

Closes a TOCTOU race in the tunnel create/update endpoints: the read-then-
assign of an STCP visitor_port could let two concurrent requests bind the same
port, generating a conflicting visitor.toml. The partial unique index is the
only race-free guard. HTTPS tunnels (visitor_port NULL) are excluded.

NOTE: this migration fails if duplicate STCP visitor_port rows already exist —
deduplicate them first.

Revision ID: f1a2b3c4d5e6
Revises: e7b3c1a9d2f4
Create Date: 2026-06-15 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e7b3c1a9d2f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(
        "uq_frp_tunnel_visitor_port",
        "frp_tunnels",
        ["visitor_port"],
        unique=True,
        postgresql_where=sa.text("tunnel_type = 'stcp' AND visitor_port IS NOT NULL"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_frp_tunnel_visitor_port", table_name="frp_tunnels")
