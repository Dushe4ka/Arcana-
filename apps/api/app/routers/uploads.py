"""apps/api/app/routers/uploads.py"""

from fastapi import APIRouter, Depends, Form, UploadFile, status
from pydantic import BaseModel

from app.core.deps import require_roles
from app.services import uploads_service

router = APIRouter(
    prefix="/admin",
    tags=["admin:uploads"],
    dependencies=[Depends(require_roles("WRITER", "EDITOR", "ADMIN"))],
)


class UploadOut(BaseModel):
    url: str


@router.post("/uploads", status_code=status.HTTP_201_CREATED, response_model=UploadOut)
async def upload_file(
    file: UploadFile,
    focal_x: float | None = Form(default=None, alias="focalX"),
    focal_y: float | None = Form(default=None, alias="focalY"),
) -> UploadOut:
    url = await uploads_service.save_upload(file, focal_x, focal_y)
    return UploadOut(url=url)
