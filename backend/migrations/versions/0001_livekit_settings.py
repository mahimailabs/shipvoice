"""livekit settings

The first migration. It replaces an earlier one that created a users table for
the auth slice this repo no longer has; there is no upgrade path from it because
nothing had shipped, so a dev database from before this needs recreating with
'docker compose down -v'.

Revision ID: 0001_livekit_settings
Revises:
Create Date: 2026-08-08
"""

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision = "0001_livekit_settings"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.drop_index(op.f("ix_livekit_settings_uuid"), table_name="livekit_settings")
    op.drop_table("livekit_settings")
