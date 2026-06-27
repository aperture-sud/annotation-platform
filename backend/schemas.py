from pydantic import BaseModel
from typing import Optional


class BoxCreate(BaseModel):
    parent_id:      Optional[int] = None
    coordinates:    str           = "[]"
    tag_category:   Optional[str] = None
    tag_attributes: Optional[str] = None
    content_text:   Optional[str] = None
    reading_order:  Optional[int] = None
    confidence:     Optional[str] = None
    model_config = {"extra": "ignore"}


class BoxUpdate(BaseModel):
    parent_id:      Optional[int] = None
    coordinates:    Optional[str] = None
    tag_category:   Optional[str] = None
    tag_attributes: Optional[str] = None
    content_text:   Optional[str] = None
    reading_order:  Optional[int] = None
    confidence:     Optional[str] = None
    model_config = {"extra": "ignore"}


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    role:     str
    model_config = {"extra": "ignore"}


class DocumentUpdate(BaseModel):
    display_name: Optional[str] = None
    model_config = {"extra": "ignore"}


class PageRename(BaseModel):
    display_name: str
    replace:      bool = False
    model_config = {"extra": "ignore"}


class AnnotationRequestCreate(BaseModel):
    medium:   str
    cls:      str
    subject:  str
    quantity: int
    model_config = {"extra": "ignore"}


class ReviewAction(BaseModel):
    note: Optional[str] = None
    model_config = {"extra": "ignore"}


class UploadApprovalAction(BaseModel):
    note: Optional[str] = None
    model_config = {"extra": "ignore"}


class MaskingRequestCreate(BaseModel):
    quantity: int
    model_config = {"extra": "ignore"}


class MaskPoint(BaseModel):
    x: float
    y: float

class MaskShape(BaseModel):
    points: list[MaskPoint]

class ApplyMasks(BaseModel):
    shapes: list[MaskShape]
    model_config = {"extra": "ignore"}

class SaveMasks(BaseModel):
    shapes: list[MaskShape]
    model_config = {"extra": "ignore"}
