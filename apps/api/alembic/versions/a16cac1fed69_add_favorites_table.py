"""add favorites table

Revision ID: a16cac1fed69
Revises: 87e550c78e9a
Create Date: 2026-08-31 17:12:21.414355

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a16cac1fed69'
down_revision: Union[str, None] = '87e550c78e9a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Autogenerate also picked up an unrelated pending FK on
    # chapters.entry_node_id (pre-existing model/DB drift, not part of this
    # change) - left out here on purpose; only the favorites table is this
    # migration's concern.
    op.create_table('favorites',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('story_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['story_id'], ['stories.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'story_id')
    )


def downgrade() -> None:
    op.drop_table('favorites')
