"""chapter publications: players read frozen snapshots

Revision ID: d5f8b0c2e314
Revises: c4e7a9b1d203
Create Date: 2026-11-10 17:00:00.000000

Additive. Every chapter that is PUBLISHED right now gets publication version 1 copied from
its current nodes, so nothing changes for players at the moment of migration.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d5f8b0c2e314"
down_revision: Union[str, None] = "c4e7a9b1d203"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chapters", sa.Column("published_version", sa.Integer(), nullable=True))
    op.create_table(
        "chapter_publications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("chapter_id", sa.UUID(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("entry_node_id", sa.UUID(), nullable=False),
        sa.Column("node_count", sa.Integer(), nullable=False),
        sa.Column("published_by", sa.UUID(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["published_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chapter_id", "version"),
    )
    op.create_index("ix_chapter_publications_chapter_id", "chapter_publications", ["chapter_id"])
    op.create_table(
        "published_nodes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("chapter_id", sa.UUID(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("node_id", sa.UUID(), nullable=False),
        sa.Column("type", postgresql.ENUM(name="scenenodetype", create_type=False), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chapter_id", "version", "node_id"),
    )
    op.create_index("ix_published_nodes_node_id", "published_nodes", ["node_id"])

    # Purchases and reached endings must outlive edits to the draft they came from.
    op.drop_constraint("player_choice_unlocks_choice_option_id_fkey", "player_choice_unlocks", type_="foreignkey")
    op.drop_constraint("player_ending_unlocks_node_id_fkey", "player_ending_unlocks", type_="foreignkey")

    # Version 1 for everything players can read today.
    op.execute(
        """
        INSERT INTO chapter_publications (id, chapter_id, version, entry_node_id, node_count, published_at)
        SELECT gen_random_uuid(), c.id, 1, c.entry_node_id,
               (SELECT count(*) FROM scene_nodes n WHERE n.chapter_id = c.id), now()
        FROM chapters c
        WHERE c.status::text = 'PUBLISHED' AND c.entry_node_id IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO published_nodes (id, chapter_id, version, node_id, type, data, options)
        SELECT gen_random_uuid(), n.chapter_id, 1, n.id, n.type, n.data,
               COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                       'id', o.id, 'order', o."order", 'text', o.text,
                       'costCurrency', o.cost_currency, 'costAmount', o.cost_amount,
                       'visibleWhen', o.visible_when, 'effects', o.effects, 'nextNodeId', o.next_node_id
                   ) ORDER BY o."order")
                   FROM choice_options o WHERE o.node_id = n.id
               ), '[]'::jsonb)
        FROM scene_nodes n
        JOIN chapter_publications p ON p.chapter_id = n.chapter_id AND p.version = 1
        """
    )
    op.execute(
        "UPDATE chapters c SET published_version = 1 "
        "WHERE EXISTS (SELECT 1 FROM chapter_publications p WHERE p.chapter_id = c.id)"
    )


def downgrade() -> None:
    op.create_foreign_key(
        "player_ending_unlocks_node_id_fkey", "player_ending_unlocks", "scene_nodes", ["node_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "player_choice_unlocks_choice_option_id_fkey", "player_choice_unlocks", "choice_options",
        ["choice_option_id"], ["id"], ondelete="CASCADE",
    )
    op.drop_index("ix_published_nodes_node_id", table_name="published_nodes")
    op.drop_table("published_nodes")
    op.drop_index("ix_chapter_publications_chapter_id", table_name="chapter_publications")
    op.drop_table("chapter_publications")
    op.drop_column("chapters", "published_version")
