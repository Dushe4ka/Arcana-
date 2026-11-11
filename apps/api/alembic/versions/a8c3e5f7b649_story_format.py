"""story format: novel (library) or series (cinema hall)

Revision ID: a8c3e5f7b649
Revises: f7b2d4e6a538
Create Date: 2026-11-11 14:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a8c3e5f7b649"
down_revision: Union[str, None] = "f7b2d4e6a538"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

story_format = sa.Enum("NOVEL", "SERIES", name="storyformat")


def upgrade() -> None:
    story_format.create(op.get_bind(), checkfirst=True)
    op.add_column("stories", sa.Column("format", story_format, server_default="NOVEL", nullable=False))


def downgrade() -> None:
    op.drop_column("stories", "format")
    story_format.drop(op.get_bind(), checkfirst=True)
