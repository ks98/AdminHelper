# SPDX-FileCopyrightText: 2026 Kevin Stenzel
#
# SPDX-License-Identifier: GPL-3.0-or-later

"""add fk indexes (audit: Postgres does not auto-index FK columns)

Server deletes cascade into connections/frp_tunnels/provision_tokens — without
these indexes every cascade/SET NULL is a full-table scan per dependent table.

Revision ID: a258973bb7fd
Revises: d5b9f2c84e10
Create Date: 2026-06-10 09:33:32.967874

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a258973bb7fd"
down_revision: Union[str, Sequence[str], None] = "d5b9f2c84e10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(op.f("ix_connections_server_id"), "connections", ["server_id"], unique=False)
    op.create_index(op.f("ix_frp_tunnels_server_id"), "frp_tunnels", ["server_id"], unique=False)
    op.create_index(
        op.f("ix_frp_tunnels_frp_config_id"), "frp_tunnels", ["frp_config_id"], unique=False
    )
    op.create_index(
        op.f("ix_frp_tunnels_connection_id"), "frp_tunnels", ["connection_id"], unique=False
    )
    op.create_index(
        op.f("ix_provision_tokens_server_id"), "provision_tokens", ["server_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_provision_tokens_server_id"), table_name="provision_tokens")
    op.drop_index(op.f("ix_frp_tunnels_connection_id"), table_name="frp_tunnels")
    op.drop_index(op.f("ix_frp_tunnels_frp_config_id"), table_name="frp_tunnels")
    op.drop_index(op.f("ix_frp_tunnels_server_id"), table_name="frp_tunnels")
    op.drop_index(op.f("ix_connections_server_id"), table_name="connections")
