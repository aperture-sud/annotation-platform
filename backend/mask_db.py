import json
from pathlib import Path

from database import get_conn

REPO_ROOT  = Path(__file__).parent.parent
MASKS_DIR  = REPO_ROOT / "storage" / "masks"


def _folder_path(page_name: str) -> Path | None:
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT f.medium, f.cls, f.subject
        FROM pages p
        JOIN documents d ON d.id = p.doc_id
        JOIN folders f ON f.id = d.folder_id
        WHERE p.page_name = %s
    """, (page_name,))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        return None
    return MASKS_DIR / row["medium"] / row["cls"] / row["subject"]


def _page_file(page_name: str) -> Path | None:
    folder = _folder_path(page_name)
    return folder / f"{page_name}.json" if folder else None


def get_mask_boxes(page_name: str) -> list:
    path = _page_file(page_name)
    if not path or not path.exists():
        return []
    with open(path) as f:
        return json.load(f)


def set_mask_boxes(page_name: str, boxes: list):
    path = _page_file(page_name)
    if not path:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(boxes, f, indent=2)


def delete_mask_file(page_name: str):
    path = _page_file(page_name)
    if path and path.exists():
        path.unlink()


def rename_page(old_name: str, new_name: str):
    path = _page_file(old_name)
    if not path or not path.exists():
        return
    new_path = path.parent / f"{new_name}.json"
    new_path.write_text(path.read_text())
    path.unlink()
