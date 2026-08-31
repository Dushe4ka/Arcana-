"""add story genre and wallet xp

Revision ID: 87e550c78e9a
Revises: 1b057564e022
Create Date: 2026-08-30 17:04:32.283752

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '87e550c78e9a'
down_revision: Union[str, None] = '1b057564e022'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


story_genre = postgresql.ENUM(
    'FANTASY', 'ROMANCE', 'DRAMA', 'MYSTERY', 'ADVENTURE', name='storygenre'
)


def upgrade() -> None:
    # Existing rows need a value for these NOT NULL columns - server_default backfills
    # them, then stays in place as a defensive default at the DB level too.
    story_genre.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'stories',
        sa.Column(
            'genre',
            postgresql.ENUM(
                'FANTASY', 'ROMANCE', 'DRAMA', 'MYSTERY', 'ADVENTURE',
                name='storygenre', create_type=False,
            ),
            nullable=False,
            server_default='ROMANCE',
        ),
    )
    op.add_column(
        'wallets', sa.Column('xp', sa.Integer(), nullable=False, server_default='0')
    )


def downgrade() -> None:
    op.drop_column('wallets', 'xp')
    op.drop_column('stories', 'genre')
    op.execute('DROP TYPE IF EXISTS storygenre')
