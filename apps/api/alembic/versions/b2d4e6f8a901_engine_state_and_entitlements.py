"""per-slot engine state, choice entitlements, chapter completions, test stories

Revision ID: b2d4e6f8a901
Revises: a1a3e2ccafad
Create Date: 2026-11-10 12:00:00.000000

Additive only: nothing is dropped. `player_variable_values` stays in place as a historical
record - its rows are copied into each save slot's new `state`, which the engine reads from
now on (variables used to be shared by every slot of a story, so a second playthrough could
not start clean and rollback was impossible).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b2d4e6f8a901"
down_revision: Union[str, None] = "a1a3e2ccafad"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("stories", sa.Column("is_test", sa.Boolean(), server_default="false", nullable=False))
    op.add_column(
        "save_slots",
        sa.Column("state", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
    )

    op.create_table(
        "player_choice_unlocks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("choice_option_id", sa.UUID(), nullable=False),
        sa.Column("unlocked_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["choice_option_id"], ["choice_options.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "choice_option_id"),
    )
    op.create_index("ix_player_choice_unlocks_user_id", "player_choice_unlocks", ["user_id"])

    op.create_table(
        "player_chapter_completions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("chapter_id", sa.UUID(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("times_completed", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "chapter_id"),
    )
    op.create_index("ix_player_chapter_completions_user_id", "player_chapter_completions", ["user_id"])

    op.create_table(
        "player_ending_unlocks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("story_id", sa.UUID(), nullable=False),
        sa.Column("chapter_id", sa.UUID(), nullable=False),
        sa.Column("node_id", sa.UUID(), nullable=False),
        sa.Column("ending_key", sa.String(), nullable=True),
        sa.Column("unlocked_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["node_id"], ["scene_nodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "node_id"),
    )
    op.create_index("ix_player_ending_unlocks_user_id", "player_ending_unlocks", ["user_id"])

    # Every existing save keeps the variables its owner had: copy them into the slot.
    op.execute(
        """
        UPDATE save_slots s SET state = jsonb_build_object(
            'v', 1,
            'values', COALESCE((
                SELECT jsonb_object_agg(d.key || '::' || COALESCE(d.character_id::text, ''), v.value)
                FROM player_variable_values v
                JOIN variable_definitions d ON d.id = v.variable_definition_id
                WHERE v.user_id = s.user_id AND d.story_id = s.story_id
            ), '{}'::jsonb),
            'stage', jsonb_build_object(
                'backgroundUrl', s.current_background_url, 'music', NULL,
                'atmosphere', NULL, 'camera', NULL, 'cgUrl', NULL
            ),
            'history', '[]'::jsonb, 'path', '[]'::jsonb, 'chapterStarts', '{}'::jsonb
        )
        """
    )
    # Paid choices bought before entitlements existed stay bought.
    op.execute(
        """
        INSERT INTO player_choice_unlocks (id, user_id, choice_option_id, unlocked_at)
        SELECT gen_random_uuid(), t.user_id, o.id, MIN(t.created_at)
        FROM currency_transactions t
        JOIN choice_options o ON o.id::text = substring(t.reason FROM 8)
        WHERE t.type::text = 'SPEND' AND t.reason LIKE 'choice:%'
        GROUP BY t.user_id, o.id
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_player_ending_unlocks_user_id", table_name="player_ending_unlocks")
    op.drop_table("player_ending_unlocks")
    op.drop_index("ix_player_chapter_completions_user_id", table_name="player_chapter_completions")
    op.drop_table("player_chapter_completions")
    op.drop_index("ix_player_choice_unlocks_user_id", table_name="player_choice_unlocks")
    op.drop_table("player_choice_unlocks")
    op.drop_column("save_slots", "state")
    op.drop_column("stories", "is_test")
