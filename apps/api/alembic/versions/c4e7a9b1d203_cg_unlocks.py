"""player cg unlocks (gallery)

Revision ID: c4e7a9b1d203
Revises: b2d4e6f8a901
Create Date: 2026-11-10 15:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4e7a9b1d203"
down_revision: Union[str, None] = "b2d4e6f8a901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "player_cg_unlocks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("story_id", sa.UUID(), nullable=False),
        sa.Column("image_url", sa.String(), nullable=False),
        sa.Column("unlocked_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "image_url"),
    )
    op.create_index("ix_player_cg_unlocks_user_id", "player_cg_unlocks", ["user_id"])
    # The wallet history endpoint pages through a player's transactions newest-first.
    op.create_index(
        "ix_currency_transactions_user_created", "currency_transactions", ["user_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_currency_transactions_user_created", table_name="currency_transactions")
    op.drop_index("ix_player_cg_unlocks_user_id", table_name="player_cg_unlocks")
    op.drop_table("player_cg_unlocks")
