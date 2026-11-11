from fastapi import APIRouter, Depends, Query, UploadFile, status
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import AuthenticatedUser, get_current_user, require_roles
from app.database import get_db
from app.models.enums import ContentStatus
from app.schemas.base import CamelModel
from app.schemas.content import (
    ChapterCreateInput,
    ChapterUpdateInput,
    SeasonCreateInput,
    StoryCreateInput,
    StoryUpdateInput,
)
from app.schemas.responses import (
    ChapterDetailOut,
    ChapterOut,
    SeasonOut,
    StoryDetailOut,
    StoryOut,
    VariableUsageOut,
)
from app.services import (
    analytics_service,
    graph_service,
    import_service,
    localization_service,
    publications_service,
    qa_service,
    stories_service,
    variable_usage_service,
)

# Content-authoring endpoints for the admin panel. Every route here requires a
# WRITER/EDITOR/ADMIN account - players never touch this router.
router = APIRouter(
    prefix="/admin",
    tags=["admin:stories"],
    dependencies=[Depends(require_roles("WRITER", "EDITOR", "ADMIN"))],
)


@router.get("/stories", response_model=list[StoryOut])
async def list_stories(db: AsyncSession = Depends(get_db)):
    return await stories_service.list_all(db)


@router.get("/stories/{story_id}", response_model=StoryDetailOut)
async def get_story(story_id: str, db: AsyncSession = Depends(get_db)):
    return await stories_service.get_by_id(db, story_id)


@router.get("/stories/{story_id}/variable-usages", response_model=list[VariableUsageOut])
async def list_variable_usages(story_id: str, db: AsyncSession = Depends(get_db)):
    return await variable_usage_service.list_usages(db, story_id)


@router.get("/stories/{story_id}/graph")
async def story_graph(story_id: str, db: AsyncSession = Depends(get_db)):
    """Every node of the story, direct transitions between them, and deferred consequences
    (a decision changing a variable that a later event checks)."""
    return await graph_service.story_graph(db, story_id)


@router.get("/stories/{story_id}/analytics")
async def story_analytics(story_id: str, db: AsyncSession = Depends(get_db)):
    """Chapter funnel (started / completed / reach) and how players split on each choice."""
    return await analytics_service.story_analytics(db, story_id)


@router.get("/stories/{story_id}/qa")
async def story_qa(story_id: str, db: AsyncSession = Depends(get_db)):
    """Narrative QA report for every chapter of a story."""
    return await qa_service.analyze_story(db, story_id)


@router.get("/chapters/{chapter_id}/qa")
async def chapter_qa(chapter_id: str, db: AsyncSession = Depends(get_db)):
    """Narrative QA report: what would break for players if this chapter were published."""
    return (await qa_service.analyze_chapter(db, chapter_id)).to_json()


@router.post("/stories", status_code=status.HTTP_201_CREATED, response_model=StoryOut)
async def create_story(body: StoryCreateInput, db: AsyncSession = Depends(get_db)):
    return await stories_service.create(db, body)


@router.patch("/stories/{story_id}", response_model=StoryOut)
async def update_story(story_id: str, body: StoryUpdateInput, db: AsyncSession = Depends(get_db)):
    return await stories_service.update(db, story_id, body)


@router.post("/stories/{story_id}/publish", response_model=StoryOut)
async def publish_story(story_id: str, db: AsyncSession = Depends(get_db)):
    return await stories_service.set_status(db, story_id, ContentStatus.PUBLISHED)


@router.post("/stories/{story_id}/unpublish", response_model=StoryOut)
async def unpublish_story(story_id: str, db: AsyncSession = Depends(get_db)):
    return await stories_service.set_status(db, story_id, ContentStatus.DRAFT)


@router.delete("/stories/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_story(story_id: str, db: AsyncSession = Depends(get_db)):
    await stories_service.remove(db, story_id)


@router.post("/seasons", status_code=status.HTTP_201_CREATED, response_model=SeasonOut)
async def create_season(body: SeasonCreateInput, db: AsyncSession = Depends(get_db)):
    return await stories_service.create_season(db, body)


@router.delete("/seasons/{season_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_season(season_id: str, db: AsyncSession = Depends(get_db)):
    await stories_service.remove_season(db, season_id)


@router.get("/chapters/{chapter_id}", response_model=ChapterDetailOut)
async def get_chapter(chapter_id: str, db: AsyncSession = Depends(get_db)):
    return await stories_service.get_chapter(db, chapter_id)


@router.post("/chapters", status_code=status.HTTP_201_CREATED, response_model=ChapterOut)
async def create_chapter(body: ChapterCreateInput, db: AsyncSession = Depends(get_db)):
    return await stories_service.create_chapter(db, body)


@router.patch("/chapters/{chapter_id}", response_model=ChapterOut)
async def update_chapter(chapter_id: str, body: ChapterUpdateInput, db: AsyncSession = Depends(get_db)):
    return await stories_service.update_chapter(db, chapter_id, body)


@router.post("/chapters/{chapter_id}/publish", response_model=ChapterOut)
async def publish_chapter(
    chapter_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Runs narrative QA and, if it passes, releases the chapter's current state to players
    as a new version. Call it again later to release further edits."""
    return await stories_service.set_chapter_status(db, chapter_id, ContentStatus.PUBLISHED, user.user_id)


@router.get("/chapters/{chapter_id}/publications")
async def chapter_publications(chapter_id: str, db: AsyncSession = Depends(get_db)):
    """Published versions of a chapter and whether the draft has changes players do not see yet."""
    return await publications_service.overview(db, chapter_id)


@router.post(
    "/chapters/{chapter_id}/publications/{version}/activate",
    dependencies=[Depends(require_roles("EDITOR", "ADMIN"))],
)
async def activate_publication(chapter_id: str, version: int, db: AsyncSession = Depends(get_db)):
    """Rollback: makes an earlier published version the one players read."""
    return await publications_service.activate(db, chapter_id, version)


@router.post("/chapters/{chapter_id}/unpublish", response_model=ChapterOut)
async def unpublish_chapter(chapter_id: str, db: AsyncSession = Depends(get_db)):
    return await stories_service.set_chapter_status(db, chapter_id, ContentStatus.DRAFT)


@router.delete("/chapters/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chapter(chapter_id: str, db: AsyncSession = Depends(get_db)):
    await stories_service.remove_chapter(db, chapter_id)


# --- Screenplay import -------------------------------------------------------------------


class ScriptImportInput(CamelModel):
    text: str = Field(min_length=1, max_length=400_000)
    # Speaker name as written in the script -> character id, "__create__" or "__narrator__".
    speakers: dict[str, str] = Field(default_factory=dict)


class ExtractedTextOut(CamelModel):
    text: str


@router.post("/import/extract-text", response_model=ExtractedTextOut)
async def extract_script_text(file: UploadFile):
    """Reads a DOCX/TXT/Markdown file and returns its plain text for the import editor."""
    return ExtractedTextOut(text=await import_service.extract_text(file))


@router.post("/chapters/{chapter_id}/import/preview")
async def preview_script_import(chapter_id: str, body: ScriptImportInput, db: AsyncSession = Depends(get_db)):
    """Parses the screenplay and reports what would be created. Saves nothing."""
    return await import_service.preview(db, chapter_id, body.text)


@router.post("/chapters/{chapter_id}/import", status_code=status.HTTP_201_CREATED)
async def commit_script_import(chapter_id: str, body: ScriptImportInput, db: AsyncSession = Depends(get_db)):
    return await import_service.commit(db, chapter_id, body.text, body.speakers)


# --- Localization ------------------------------------------------------------------------


class TranslationUnitIn(CamelModel):
    key: str
    source_hash: str | None = None
    translation: str | None = None


class TranslationImportInput(CamelModel):
    locale: str
    units: list[TranslationUnitIn] = Field(max_length=50_000)


@router.get("/stories/{story_id}/localization")
async def export_localization(story_id: str, locale: str = Query(), db: AsyncSession = Depends(get_db)):
    """Every player-visible string of the story with its translation state for `locale`."""
    return await localization_service.export(db, story_id, locale)


@router.post("/stories/{story_id}/localization")
async def import_localization(
    story_id: str, body: TranslationImportInput, db: AsyncSession = Depends(get_db)
):
    """Applies translations to the draft. Units whose Russian source changed since the export
    are skipped and reported. Publish the affected chapters to release the result."""
    return await localization_service.apply(
        db, story_id, body.locale, [u.model_dump(by_alias=True) for u in body.units]
    )
