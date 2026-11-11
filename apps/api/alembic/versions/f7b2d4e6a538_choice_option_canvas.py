"""choice option canvas position

Revision ID: f7b2d4e6a538
Revises: e6a1c3d5f427
Create Date: 2026-11-11 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f7b2d4e6a538"
down_revision: Union[str, None] = "e6a1c3d5f427"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("choice_options", sa.Column("canvas_x", sa.Integer(), nullable=True))
    op.add_column("choice_options", sa.Column("canvas_y", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("choice_options", "canvas_y")
    op.drop_column("choice_options", "canvas_x")
