"""drop livekit settings

Configuration does not live in the database. The LiveKit project comes from
LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in the environment, and the
worker reads its own. The table this drops held a plaintext api_secret that
nothing reads any more, so leaving it in place would leave a live credential
sitting in a database for no reason.

0001 is left as it was rather than rewritten: a deployment that already ran it
has the table, and a migration is only honest if it describes what actually
happened.

Revision ID: 0003_drop_livekit_settings
Revises: 0002_calls
Create Date: 2026-08-19
"""

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision = "0003_drop_livekit_settings"
down_revision = "0002_calls"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(op.f("ix_livekit_settings_uuid"), table_name="livekit_settings")
    op.drop_table("livekit_settings")


def downgrade() -> None:
    # The table comes back empty. The secret it used to hold is gone, and this
    # migration is not the place to put one back.
    op.create_table(
        "livekit_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("uuid", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("url", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("api_key", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("api_secret", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_livekit_settings_uuid"), "livekit_settings", ["uuid"], unique=True
    )
