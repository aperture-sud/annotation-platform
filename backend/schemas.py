from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class BoxCreate(BaseModel):
    page_id: int
    parent_box_id: Optional[int] = None
    x: float
    y: float
    width: float
    height: float
    rotation: Optional[float] = None
    tag_category: Optional[str] = None
    tag_data: Optional[str] = None
    content_text: Optional[str] = None
    reading_order: Optional[int] = None
    confidence: Optional[str] = None


class BoxUpdate(BaseModel):
    parent_box_id: Optional[int] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    rotation: Optional[float] = None
    tag_category: Optional[str] = None
    tag_data: Optional[str] = None
    content_text: Optional[str] = None
    reading_order: Optional[int] = None
    confidence: Optional[str] = None


class BoxOut(BaseModel):
    id: int
    page_id: int
    parent_box_id: Optional[int] = None
    x: float
    y: float
    width: float
    height: float
    tag_category: Optional[str] = None
    tag_data: Optional[str] = None
    content_text: Optional[str] = None
    reading_order: Optional[int] = None
    confidence: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PageOut(BaseModel):
    id: int
    document_id: int
    page_number: int
    image_path: str
    width: Optional[int] = None
    height: Optional[int] = None
    status: str
    boxes: List[BoxOut] = []

    model_config = {"from_attributes": True}


class DocumentOut(BaseModel):
    id: int
    filename: str
    original_filename: str
    display_name: Optional[str] = None
    upload_date: Optional[datetime] = None
    status: str
    page_count: int
    pages: List[PageOut] = []

    model_config = {"from_attributes": True}


class DocumentUpdate(BaseModel):
    display_name: Optional[str] = None
    status: Optional[str] = None
