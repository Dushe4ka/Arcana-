"""add save slot background

Revision ID: f7b92e04a618
Revises: c3f18a9d2b41
Create Date: 2026-09-01 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7b92e04a618'
down_revision: Union[str, None] = 'c3f18a9d2b41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('save_slots', sa.Column('current_background_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('save_slots', 'current_background_url')
