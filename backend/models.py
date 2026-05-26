from sqlalchemy import Column, Integer, String, DateTime, Float, Text, ForeignKey
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func
from database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, unique=True, index=True)
    original_filename = Column(String)
    display_name = Column(String, nullable=True)
    upload_date = Column(DateTime, server_default=func.now())
    status = Column(String, default="pending")
    page_count = Column(Integer, default=1)

    pages = relationship("Page", back_populates="document", cascade="all, delete-orphan")


class Page(Base):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    page_number = Column(Integer)
    image_path = Column(String)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    status = Column(String, default="pending")

    document = relationship("Document", back_populates="pages")
    boxes = relationship("Box", back_populates="page", cascade="all, delete-orphan")


class Box(Base):
    __tablename__ = "boxes"

    id = Column(Integer, primary_key=True, index=True)
    page_id = Column(Integer, ForeignKey("pages.id"))
    parent_box_id = Column(Integer, ForeignKey("boxes.id"), nullable=True)
    x = Column(Float)
    y = Column(Float)
    width = Column(Float)
    height = Column(Float)
    tag_category = Column(String, nullable=True)
    tag_data = Column(Text, nullable=True)
    content_text = Column(Text, nullable=True)
    rotation = Column(Float, nullable=True)
    polygon_points = Column(Text, nullable=True)
    reading_order = Column(Integer, nullable=True)
    confidence = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    page = relationship("Page", back_populates="boxes")
    # Self-referential: remote_side=[id] makes the backref "parent" many-to-one
    children = relationship(
        "Box",
        backref=backref("parent", remote_side="Box.id"),
        foreign_keys="Box.parent_box_id",
        cascade="all, delete",
        passive_deletes=True,
    )
