import json
from datetime import datetime, timezone
from pathlib import Path

from database import get_conn

REPO_ROOT = Path(__file__).parent.parent
ANNOTATIONS_DIR = REPO_ROOT / "storage" / "annotations"

_FIELDS = frozenset({"parent_id", "coordinates", "tag_category", "tag_attributes",
                     "content_text", "reading_order", "confidence"})


def _folder_path(page_name: str) -> Path | None:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT f.medium, f.cls, f.subject
        FROM pages p
        JOIN documents d ON d.id = p.doc_id
        JOIN folders f ON f.id = d.folder_id
        WHERE p.page_name = %s
    """, (page_name,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return None
    return ANNOTATIONS_DIR / row["medium"] / row["cls"] / row["subject"]


def _page_file(page_name: str) -> Path | None:
    folder = _folder_path(page_name)
    return folder / f"{page_name}.json" if folder else None


def _read(path: Path | None) -> list:
    if not path or not path.exists():
        return []
    with open(path) as f:
        return json.load(f)


def _write(path: Path, boxes: list):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(boxes, f, indent=2, default=str)


def get_boxes(page_name: str) -> list:
    boxes = _read(_page_file(page_name))
    return sorted(boxes, key=lambda b: (
        1 if b.get("reading_order") is None else 0,
        b.get("reading_order") or 0,
        b.get("id") or 0,
    ))


def insert_box(page_name: str, data: dict) -> dict:
    path = _page_file(page_name)
    boxes = _read(path)
    new_id = max((b["id"] for b in boxes), default=0) + 1
    box = {
        "id": new_id,
        "page_name": page_name,
        "parent_id": data.get("parent_id"),
        "coordinates": data.get("coordinates", "[]"),
        "tag_category": data.get("tag_category"),
        "tag_attributes": data.get("tag_attributes"),
        "content_text": data.get("content_text"),
        "reading_order": data.get("reading_order"),
        "confidence": data.get("confidence"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    boxes.append(box)
    _write(path, boxes)
    return box


def update_box(page_name: str, box_id: int, data: dict) -> dict | None:
    path = _page_file(page_name)
    boxes = _read(path)
    for box in boxes:
        if box["id"] == box_id:
            for k in _FIELDS:
                if k in data:
                    box[k] = data[k]
            _write(path, boxes)
            return box
    return None


def fetch_box(page_name: str, box_id: int) -> dict | None:
    for box in _read(_page_file(page_name)):
        if box["id"] == box_id:
            return box
    return None


def remove_box(page_name: str, box_id: int):
    path = _page_file(page_name)
    boxes = _read(path)
    to_remove = {box_id}
    changed = True
    while changed:
        changed = False
        for b in boxes:
            if b.get("parent_id") in to_remove and b["id"] not in to_remove:
                to_remove.add(b["id"])
                changed = True
    _write(path, [b for b in boxes if b["id"] not in to_remove])


def rename_page(old_name: str, new_name: str):
    path = _page_file(old_name)
    if not path or not path.exists():
        return
    new_path = path.parent / f"{new_name}.json"
    boxes = _read(path)
    for b in boxes:
        b["page_name"] = new_name
    _write(new_path, boxes)
    path.unlink()


def delete_page_file(page_name: str):
    path = _page_file(page_name)
    if path and path.exists():
        path.unlink()
