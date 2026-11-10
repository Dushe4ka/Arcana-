"""Chapter publications: freezing the editable scene graph into the version players read."""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.content import Chapter, ChapterPublication, ChoiceOption, PublishedNode, SceneNode


def _option_json(option: ChoiceOption) -> dict:
    return {
        "id": str(option.id),
        "order": option.order,
        "text": option.text,
        "costCurrency": getattr(option.cost_currency, "value", option.cost_currency) or None,
        "costAmount": option.cost_amount or 0,
        "visibleWhen": option.visible_when or [],
        "effects": option.effects or [],
        "nextNodeId": str(option.next_node_id) if option.next_node_id else None,
    }


async def snapshot(db: AsyncSession, chapter: Chapter, published_by: str | None = None) -> ChapterPublication:
    """Copies the chapter's current nodes into a new publication and makes it the live one.
    Does not commit - the caller decides the transaction."""
    if not chapter.entry_node_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "У главы нет начальной сцены — нечего публиковать")
    latest = await db.scalar(
        select(func.max(ChapterPublication.version)).where(ChapterPublication.chapter_id == chapter.id)
    )
    version = (latest or 0) + 1
    nodes = list(
        await db.scalars(
            select(SceneNode)
            .where(SceneNode.chapter_id == chapter.id)
            .options(selectinload(SceneNode.choice_options))
        )
    )
    for node in nodes:
        db.add(
            PublishedNode(
                chapter_id=chapter.id,
                version=version,
                node_id=node.id,
                type=node.type,
                data=dict(node.data or {}),
                options=[_option_json(o) for o in sorted(node.choice_options, key=lambda o: o.order)],
            )
        )
    publication = ChapterPublication(
        chapter_id=chapter.id,
        version=version,
        entry_node_id=chapter.entry_node_id,
        node_count=len(nodes),
        published_by=uuid.UUID(str(published_by)) if published_by else None,
    )
    db.add(publication)
    chapter.published_version = version
    await db.flush()
    return publication


async def current(db: AsyncSession, chapter: Chapter) -> ChapterPublication | None:
    if chapter.published_version is None:
        return None
    return await db.scalar(
        select(ChapterPublication).where(
            ChapterPublication.chapter_id == chapter.id,
            ChapterPublication.version == chapter.published_version,
        )
    )


async def _has_unpublished_changes(
    db: AsyncSession, chapter: Chapter, live: ChapterPublication | None
) -> bool:
    if live is None:
        return bool(
            await db.scalar(
                select(func.count()).select_from(SceneNode).where(SceneNode.chapter_id == chapter.id)
            )
        )
    node_count = await db.scalar(
        select(func.count()).select_from(SceneNode).where(SceneNode.chapter_id == chapter.id)
    )
    if node_count != live.node_count or chapter.entry_node_id != live.entry_node_id:
        return True
    last_node_edit = await db.scalar(
        select(func.max(SceneNode.updated_at)).where(SceneNode.chapter_id == chapter.id)
    )
    last_option_edit = await db.scalar(
        select(func.max(ChoiceOption.updated_at))
        .join(SceneNode, ChoiceOption.node_id == SceneNode.id)
        .where(SceneNode.chapter_id == chapter.id)
    )
    return any(edit is not None and edit > live.published_at for edit in (last_node_edit, last_option_edit))


async def overview(db: AsyncSession, chapter_id: str) -> dict:
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Глава не найдена")
    publications = list(
        await db.scalars(
            select(ChapterPublication)
            .where(ChapterPublication.chapter_id == chapter.id)
            .order_by(ChapterPublication.version.desc())
        )
    )
    live = next((p for p in publications if p.version == chapter.published_version), None)
    return {
        "status": chapter.status.value,
        "liveVersion": chapter.published_version,
        "hasUnpublishedChanges": await _has_unpublished_changes(db, chapter, live),
        "versions": [
            {
                "version": p.version,
                "publishedAt": p.published_at.isoformat(),
                "nodeCount": p.node_count,
                "isLive": p.version == chapter.published_version,
            }
            for p in publications
        ],
    }


async def activate(db: AsyncSession, chapter_id: str, version: int) -> dict:
    """Makes an earlier publication the live one again - the rollback for a bad release.
    The editable draft is not touched."""
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Глава не найдена")
    exists = await db.scalar(
        select(ChapterPublication.id).where(
            ChapterPublication.chapter_id == chapter.id, ChapterPublication.version == version
        )
    )
    if not exists:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Такой версии публикации нет")
    chapter.published_version = version
    await db.commit()
    return await overview(db, chapter_id)
