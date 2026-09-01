"""add scene node canvas position

Revision ID: c3f18a9d2b41
Revises: a16cac1fed69
Create Date: 2026-09-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3f18a9d2b41'
down_revision: Union[str, None] = 'a16cac1fed69'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('scene_nodes', sa.Column('canvas_x', sa.Integer(), nullable=True))
    op.add_column('scene_nodes', sa.Column('canvas_y', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('scene_nodes', 'canvas_y')
    op.drop_column('scene_nodes', 'canvas_x')
