import json
import os
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from typing import List, Optional

import cv2
import numpy as np

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageEnhance, ImageOps
import io

import box_db
import schemas
from auth import (create_token, get_current_user, hash_password,
                  require_admin, require_manager, verify_password)
from database import get_conn, init_db

REPO_ROOT   = Path(__file__).parent.parent
UPLOADS_DIR = REPO_ROOT / "storage" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

VALID_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def _seed_admin():
    username = os.getenv("ADMIN_USERNAME")
    password = os.getenv("ADMIN_PASSWORD")
    if not username or not password:
        return
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT 1 FROM users WHERE username = %s", (username,))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, 'admin')",
            (username, hash_password(password)),
        )
        conn.commit()
    cur.close()
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _seed_admin()
    yield


app = FastAPI(title="Annotation Platform API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _validate_name(name: str) -> str:
    name = name.strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty")
    if any(c in name for c in ('/', '\\', '\x00')):
        raise HTTPException(400, "Name contains invalid characters")
    if name.startswith('.'):
        raise HTTPException(400, "Name cannot start with '.'")
    if len(name) > 200:
        raise HTTPException(400, "Name too long (max 200 characters)")
    return name


def _require_page(page_name: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM pages WHERE page_name = %s", (page_name,))
    exists = cur.fetchone() is not None
    cur.close()
    conn.close()
    if not exists:
        raise HTTPException(404, "Page not found")


def _require_editable_page(page_name: str, current: dict):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT area FROM pages WHERE page_name = %s", (page_name,))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        raise HTTPException(404, "Page not found")
    if dict(row)["area"] == "approved" and current["role"] != "admin":
        raise HTTPException(403, "Page is approved and locked")


# ── Auth ─────────────────────────────────────────────────────────────────────

@app.post("/login")
def login(data: schemas.LoginRequest):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT password_hash, role FROM users WHERE username = %s", (data.username,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row or not verify_password(data.password, row["password_hash"]):
        raise HTTPException(401, "Invalid username or password")
    token = create_token(data.username, row["role"])
    return {"access_token": token, "token_type": "bearer", "role": row["role"], "username": data.username}


# ── Users (admin only) ────────────────────────────────────────────────────────

@app.get("/users")
def list_users(_: dict = Depends(require_admin)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT id, username, role, created_at FROM users ORDER BY created_at")
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


@app.post("/users", status_code=201)
def create_user(data: schemas.UserCreate, _: dict = Depends(require_admin)):
    if data.role not in ("pictaker", "annotator", "manager", "admin"):
        raise HTTPException(400, "Invalid role")
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s) RETURNING id, username, role, created_at",
            (data.username, hash_password(data.password), data.role),
        )
        row = dict(cur.fetchone())
        conn.commit()
    except Exception:
        conn.rollback()
        raise HTTPException(409, f"Username '{data.username}' already exists")
    finally:
        cur.close()
        conn.close()
    return row


@app.delete("/users/{username}")
def delete_user(username: str, current: dict = Depends(require_admin)):
    if username == current["username"]:
        raise HTTPException(400, "Cannot delete your own account")
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("DELETE FROM users WHERE username = %s RETURNING username", (username,))
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not row:
        raise HTTPException(404, "User not found")
    return {"deleted": username}


# ── Corner detection ──────────────────────────────────────────────────────────

def _detect_corners(image_bytes: bytes) -> list:
    margin = 0.05
    fallback = [[margin, margin], [1-margin, margin], [1-margin, 1-margin], [margin, 1-margin]]

    nparr = np.frombuffer(image_bytes, np.uint8)
    img   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return fallback

    h, w  = img.shape[:2]
    scale = min(1.0, 1024 / max(h, w))
    small = cv2.resize(img, None, fx=scale, fy=scale)
    sh, sw = small.shape[:2]

    gray     = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    # Bilateral filter preserves paper edges while smoothing texture
    filtered = cv2.bilateralFilter(gray, 9, 75, 75)

    # Auto Canny thresholds derived from image median
    v     = np.median(filtered)
    lo    = int(max(0,   0.67 * v))
    hi    = int(min(255, 1.33 * v))
    edges = cv2.Canny(filtered, lo, hi)

    kernel  = np.ones((5, 5), np.uint8)
    dilated = cv2.dilate(edges, kernel, iterations=3)

    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours     = sorted(contours, key=cv2.contourArea, reverse=True)

    doc      = None
    min_area = sw * sh * 0.15

    for cnt in contours:
        if cv2.contourArea(cnt) < min_area:
            break
        peri = cv2.arcLength(cnt, True)
        for eps in [0.02, 0.03, 0.04, 0.05, 0.06]:
            approx = cv2.approxPolyDP(cnt, eps * peri, True)
            if len(approx) == 4 and cv2.isContourConvex(approx):
                doc = approx.reshape(4, 2).astype(np.float32)
                break
        if doc is not None:
            break

    if doc is None:
        return fallback

    pts  = doc / np.array([sw, sh], dtype=np.float32)
    s    = pts[:, 0] + pts[:, 1]
    diff = pts[:, 0] - pts[:, 1]
    tl   = pts[np.argmin(s)].tolist()
    br   = pts[np.argmax(s)].tolist()
    tr   = pts[np.argmax(diff)].tolist()
    bl   = pts[np.argmin(diff)].tolist()
    return [tl, tr, br, bl]


@app.post("/detect-corners")
async def detect_corners(file: UploadFile = File(...), _: dict = Depends(get_current_user)):
    contents = await file.read()
    return {"corners": _detect_corners(contents)}


# ── Upload helpers ────────────────────────────────────────────────────────────

_MEDIUM_ABBR  = {"english_medium": "en", "kannada_medium": "kn"}
_CLASS_ABBR   = {"class_8": "8", "class_9": "9", "class_10": "10"}
_SUBJECT_ABBR = {"english": "eng", "kannada": "kan", "science": "sci",
                 "social_science": "ssc", "maths": "mat"}


def _next_seq(cur, medium: str, cls: str, subject: str, m: str, c: str, s: str) -> int:
    prefix = f"{m}_{c}_{s}_"
    cur.execute(
        "SELECT page_name FROM pages WHERE medium = %s AND cls = %s AND subject = %s",
        (medium, cls, subject),
    )
    max_seq = 0
    for row in cur.fetchall():
        name = row["page_name"]
        if name.startswith(prefix):
            try:
                max_seq = max(max_seq, int(name[len(prefix):]))
            except ValueError:
                pass
    return max_seq + 1


# ── Image preprocessing ───────────────────────────────────────────────────────

def _preprocess(contents: bytes) -> bytes:
    with Image.open(io.BytesIO(contents)) as img:
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        # Stretch tonal range so paper is white and ink is dark
        img = ImageOps.autocontrast(img, cutoff=1)
        # Fixed contrast boost for consistent ink visibility
        img = ImageEnhance.Contrast(img).enhance(1.4)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=92, optimize=True)
        return buf.getvalue()


# ── Upload ────────────────────────────────────────────────────────────────────

@app.post("/upload")
async def upload_files(
    files: List[UploadFile] = File(...),
    medium:  str = Form("english_medium"),
    cls:     str = Form("class_8"),
    subject: str = Form("english"),
    current: dict = Depends(get_current_user),
):
    if not files:
        raise HTTPException(400, "No files provided")

    dest_dir = UPLOADS_DIR / medium / cls / subject
    dest_dir.mkdir(parents=True, exist_ok=True)

    m = _MEDIUM_ABBR.get(medium, medium)
    c = _CLASS_ABBR.get(cls, cls)
    s = _SUBJECT_ABBR.get(subject, subject)

    page_names = []

    conn = get_conn()
    cur  = conn.cursor()
    base_seq = _next_seq(cur, medium, cls, subject, m, c, s)
    doc_name = f"{m}_{c}_{s}_{base_seq}"

    for page_num, upload in enumerate(files, start=1):
        ext = Path(upload.filename or "").suffix.lower()
        if ext not in VALID_EXTS:
            ext = ".jpg"
        seq       = base_seq + page_num - 1
        page_name = f"{m}_{c}_{s}_{seq}"
        fname     = f"{page_name}{ext}"
        file_path = dest_dir / fname
        contents  = await upload.read()
        try:
            contents = _preprocess(contents)
        except Exception:
            pass  # keep original if preprocessing fails

        width = height = None
        try:
            with Image.open(io.BytesIO(contents)) as img:
                width, height = img.size
        except Exception:
            pass

        file_path.write_bytes(contents)

        image_path = f"{medium}/{cls}/{subject}/{fname}"

        cur.execute(
            """
            INSERT INTO pages (page_name, doc_name, page_number, medium, cls, subject, image_path, width, height, uploaded_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (page_name, doc_name, page_num, medium, cls, subject, image_path, width, height, current["username"]),
        )
        page_names.append({"display_name": page_name, "page_number": page_num})

    conn.commit()
    cur.close()
    conn.close()

    return {"doc_name": doc_name, "page_names": page_names, "page_count": len(files)}


# ── Documents ─────────────────────────────────────────────────────────────────

@app.get("/documents")
def list_documents(_: dict = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT p.*, d.first_upload
        FROM pages p
        JOIN (
            SELECT doc_name, MIN(uploaded_at) AS first_upload
            FROM pages GROUP BY doc_name
        ) d ON p.doc_name = d.doc_name
        ORDER BY d.first_upload DESC, p.page_number
    """)
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()

    docs = {}
    for row in rows:
        dname = row["doc_name"]
        if dname not in docs:
            docs[dname] = {
                "display_name": dname,
                "upload_date": row["first_upload"].isoformat() if row["first_upload"] else None,
                "page_count": 0,
                "pages": [],
            }
        docs[dname]["pages"].append({
            "display_name": row["page_name"],
            "page_number":  row["page_number"],
            "status":       row["area"],
        })
        docs[dname]["page_count"] = len(docs[dname]["pages"])

    return list(docs.values())


@app.patch("/documents/{doc_name}")
def update_document(doc_name: str, data: schemas.DocumentUpdate, _: dict = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM pages WHERE doc_name = %s LIMIT 1", (doc_name,))
    if not cur.fetchone():
        cur.close(); conn.close()
        raise HTTPException(404, "Document not found")

    new_name = _validate_name(data.display_name) if data.display_name else doc_name
    if new_name != doc_name:
        cur.execute("SELECT 1 FROM pages WHERE doc_name = %s LIMIT 1", (new_name,))
        if cur.fetchone():
            cur.close(); conn.close()
            raise HTTPException(409, f"A document named '{new_name}' already exists.")
        cur.execute("UPDATE pages SET doc_name = %s WHERE doc_name = %s", (new_name, doc_name))
        conn.commit()

    cur.close(); conn.close()
    return {"display_name": new_name}


@app.delete("/documents/{doc_name}")
def delete_document(doc_name: str, _: dict = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT page_name, image_path FROM pages WHERE doc_name = %s", (doc_name,))
    pages = [dict(r) for r in cur.fetchall()]
    if not pages:
        cur.close(); conn.close()
        raise HTTPException(404, "Document not found")

    for page in pages:
        try:
            (UPLOADS_DIR / page["image_path"]).unlink(missing_ok=True)
        except Exception:
            pass
    cur.execute("DELETE FROM pages WHERE doc_name = %s", (doc_name,))
    conn.commit()
    cur.close(); conn.close()
    return {"deleted": doc_name}


# ── My uploads ───────────────────────────────────────────────────────────────

@app.get("/my-uploads")
def my_uploads(current: dict = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute(
        "SELECT * FROM pages WHERE uploaded_by = %s ORDER BY uploaded_at DESC",
        (current["username"],),
    )
    rows = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return rows


# ── Annotator: assigned pages ─────────────────────────────────────────────────

@app.get("/my-pages")
def my_pages(current: dict = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT p.*, COUNT(b.id) AS box_count
        FROM pages p
        LEFT JOIN boxes b ON b.page_name = p.page_name
        WHERE p.assigned_to = %s
        GROUP BY p.page_name
        ORDER BY p.uploaded_at DESC
    """, (current["username"],))
    rows = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return rows


# ── Annotation requests ───────────────────────────────────────────────────────

@app.post("/annotation-requests", status_code=201)
def create_annotation_request(body: schemas.AnnotationRequestCreate, current: dict = Depends(get_current_user)):
    if current["role"] != "annotator":
        raise HTTPException(403, "Annotators only")
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO annotation_requests (requested_by, medium, cls, subject, quantity)
        VALUES (%s, %s, %s, %s, %s) RETURNING *
    """, (current["username"], body.medium, body.cls, body.subject, body.quantity))
    row = dict(cur.fetchone())
    conn.commit(); cur.close(); conn.close()
    return row


@app.get("/annotation-requests")
def list_annotation_requests(current: dict = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    if current["role"] == "admin":
        cur.execute("SELECT * FROM annotation_requests ORDER BY created_at DESC")
    else:
        cur.execute(
            "SELECT * FROM annotation_requests WHERE requested_by = %s ORDER BY created_at DESC",
            (current["username"],),
        )
    rows = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return rows


@app.patch("/annotation-requests/{req_id}/approve")
def approve_annotation_request(req_id: int, current: dict = Depends(get_current_user)):
    if current["role"] != "admin":
        raise HTTPException(403, "Admin only")
    conn = get_conn()
    cur  = conn.cursor()

    cur.execute("SELECT * FROM annotation_requests WHERE id = %s", (req_id,))
    req = cur.fetchone()
    if not req:
        cur.close(); conn.close(); raise HTTPException(404, "Request not found")
    req = dict(req)
    if req["status"] != "pending":
        cur.close(); conn.close(); raise HTTPException(400, "Already reviewed")

    cur.execute("""
        SELECT page_name FROM pages
        WHERE medium = %s AND cls = %s AND subject = %s AND assigned_to IS NULL
        ORDER BY uploaded_at ASC
        LIMIT %s
    """, (req["medium"], req["cls"], req["subject"], req["quantity"]))
    pages = [r["page_name"] for r in cur.fetchall()]

    if pages:
        cur.execute(
            "UPDATE pages SET assigned_to = %s, area = 'assigned' WHERE page_name = ANY(%s)",
            (req["requested_by"], pages),
        )

    cur.execute("""
        UPDATE annotation_requests
        SET status = 'approved', reviewed_by = %s, reviewed_at = NOW(), fulfilled = %s
        WHERE id = %s RETURNING *
    """, (current["username"], len(pages), req_id))
    updated = dict(cur.fetchone())
    conn.commit(); cur.close(); conn.close()
    return updated


@app.patch("/annotation-requests/{req_id}/reject")
def reject_annotation_request(req_id: int, current: dict = Depends(get_current_user)):
    if current["role"] != "admin":
        raise HTTPException(403, "Admin only")
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT status FROM annotation_requests WHERE id = %s", (req_id,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close(); raise HTTPException(404, "Request not found")
    if dict(row)["status"] != "pending":
        cur.close(); conn.close(); raise HTTPException(400, "Already reviewed")
    cur.execute("""
        UPDATE annotation_requests
        SET status = 'rejected', reviewed_by = %s, reviewed_at = NOW()
        WHERE id = %s RETURNING *
    """, (current["username"], req_id))
    updated = dict(cur.fetchone())
    conn.commit(); cur.close(); conn.close()
    return updated


# ── Pages ─────────────────────────────────────────────────────────────────────

@app.get("/pages/{page_name}")
def get_page(page_name: str, _: dict = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM pages WHERE page_name = %s", (page_name,))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        raise HTTPException(404, "Page not found")
    row = dict(row)
    return {
        "display_name":          row["page_name"],
        "document_display_name": row["doc_name"],
        "page_number":           row["page_number"],
        "image_path":            row["image_path"],
        "width":                 row["width"],
        "height":                row["height"],
        "status":                row["area"],
    }


@app.patch("/pages/{page_name}")
def rename_page(page_name: str, payload: schemas.PageRename, _: dict = Depends(get_current_user)):
    new_name = _validate_name(payload.display_name)

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM pages WHERE page_name = %s", (page_name,))
    if not cur.fetchone():
        cur.close(); conn.close()
        raise HTTPException(404, "Page not found")

    if new_name == page_name:
        cur.close(); conn.close()
        return {"display_name": page_name}

    cur.execute("SELECT image_path FROM pages WHERE page_name = %s", (new_name,))
    conflict = cur.fetchone()
    if conflict:
        if not payload.replace:
            cur.close(); conn.close()
            raise HTTPException(409, f"A page named '{new_name}' already exists.")
        try:
            (UPLOADS_DIR / conflict["image_path"]).unlink(missing_ok=True)
        except Exception:
            pass
        cur.execute("DELETE FROM pages WHERE page_name = %s", (new_name,))

    # ON UPDATE CASCADE propagates new page_name to boxes.page_name
    cur.execute("UPDATE pages SET page_name = %s WHERE page_name = %s", (new_name, page_name))
    conn.commit()
    cur.close(); conn.close()
    return {"display_name": new_name}


@app.delete("/pages/{page_name}")
def delete_page(page_name: str, current: dict = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT image_path, uploaded_by FROM pages WHERE page_name = %s", (page_name,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        raise HTTPException(404, "Page not found")
    if current["role"] != "admin" and row["uploaded_by"] != current["username"]:
        cur.close(); conn.close()
        raise HTTPException(403, "You can only delete your own uploads")
    try:
        (UPLOADS_DIR / row["image_path"]).unlink(missing_ok=True)
    except Exception:
        pass
    cur.execute("DELETE FROM pages WHERE page_name = %s", (page_name,))
    conn.commit()
    cur.close(); conn.close()
    return {"deleted": page_name}


# ── Boxes ─────────────────────────────────────────────────────────────────────

@app.get("/pages/{page_name}/boxes")
def get_page_boxes(page_name: str, _: dict = Depends(get_current_user)):
    _require_page(page_name)
    return box_db.get_boxes(page_name)


@app.post("/pages/{page_name}/boxes")
def create_box(page_name: str, box: schemas.BoxCreate, current: dict = Depends(get_current_user)):
    _require_editable_page(page_name, current)
    return box_db.insert_box(page_name, box.model_dump())


@app.put("/pages/{page_name}/boxes/{box_id}")
def update_box(page_name: str, box_id: int, data: schemas.BoxUpdate, current: dict = Depends(get_current_user)):
    _require_editable_page(page_name, current)
    result = box_db.update_box(page_name, box_id, data.model_dump(exclude_unset=True))
    if result is None:
        raise HTTPException(404, "Box not found")
    return result


@app.delete("/pages/{page_name}/boxes/{box_id}")
def delete_box(page_name: str, box_id: int, current: dict = Depends(get_current_user)):
    _require_editable_page(page_name, current)
    box_db.remove_box(page_name, box_id)
    return {"deleted": box_id}


# ── Annotator: submit page for review ────────────────────────────────────────

@app.patch("/pages/{page_name}/withdraw")
def withdraw_page(page_name: str, current: dict = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT assigned_to, area FROM pages WHERE page_name = %s", (page_name,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        raise HTTPException(404, "Page not found")
    row = dict(row)
    if row["assigned_to"] != current["username"] and current["role"] not in ("manager", "admin"):
        cur.close(); conn.close()
        raise HTTPException(403, "Not your page")
    if row["area"] != "pending_approval":
        cur.close(); conn.close()
        raise HTTPException(400, "Page is not pending approval")
    cur.execute(
        "UPDATE pages SET area = 'assigned' WHERE page_name = %s RETURNING *",
        (page_name,),
    )
    updated = dict(cur.fetchone())
    conn.commit(); cur.close(); conn.close()
    return updated


@app.patch("/pages/{page_name}/submit")
def submit_page(page_name: str, current: dict = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT assigned_to, area FROM pages WHERE page_name = %s", (page_name,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        raise HTTPException(404, "Page not found")
    row = dict(row)
    if row["assigned_to"] != current["username"] and current["role"] not in ("manager", "admin"):
        cur.close(); conn.close()
        raise HTTPException(403, "Not your page")
    if row["area"] not in ("assigned", "needs_rework", "pending_approval"):
        cur.close(); conn.close()
        raise HTTPException(400, f"Cannot submit page with status '{row['area']}'")
    cur.execute(
        "UPDATE pages SET area = 'pending_approval', review_note = NULL WHERE page_name = %s RETURNING *",
        (page_name,),
    )
    updated = dict(cur.fetchone())
    conn.commit(); cur.close(); conn.close()
    return updated


# ── Manager: review queue ─────────────────────────────────────────────────────

@app.get("/manager/pages")
def manager_pages(current: dict = Depends(require_manager)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT p.*, COUNT(b.id) AS box_count
        FROM pages p
        LEFT JOIN boxes b ON b.page_name = p.page_name
        WHERE p.assigned_to IS NOT NULL
          AND p.area IN ('pending_approval', 'approved', 'needs_rework', 'flagged_admin')
        GROUP BY p.page_name
        ORDER BY p.uploaded_at DESC
    """)
    rows = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return rows


@app.patch("/manager/pages/{page_name}/approve")
def manager_approve(page_name: str, current: dict = Depends(require_manager)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT 1 FROM pages WHERE page_name = %s", (page_name,))
    if not cur.fetchone():
        cur.close(); conn.close(); raise HTTPException(404, "Page not found")
    cur.execute("""
        UPDATE pages
        SET area = 'approved', review_note = NULL, reviewed_by = %s, reviewed_at = NOW()
        WHERE page_name = %s RETURNING *
    """, (current["username"], page_name))
    updated = dict(cur.fetchone())
    conn.commit(); cur.close(); conn.close()
    return updated


@app.patch("/manager/pages/{page_name}/send-back")
def manager_send_back(page_name: str, body: schemas.ReviewAction, current: dict = Depends(require_manager)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT 1 FROM pages WHERE page_name = %s", (page_name,))
    if not cur.fetchone():
        cur.close(); conn.close(); raise HTTPException(404, "Page not found")
    cur.execute("""
        UPDATE pages
        SET area = 'needs_rework', review_note = %s, reviewed_by = %s, reviewed_at = NOW()
        WHERE page_name = %s RETURNING *
    """, (body.note, current["username"], page_name))
    updated = dict(cur.fetchone())
    conn.commit(); cur.close(); conn.close()
    return updated


@app.patch("/manager/pages/{page_name}/flag-admin")
def manager_flag_admin(page_name: str, body: schemas.ReviewAction, current: dict = Depends(require_manager)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT 1 FROM pages WHERE page_name = %s", (page_name,))
    if not cur.fetchone():
        cur.close(); conn.close(); raise HTTPException(404, "Page not found")
    cur.execute("""
        UPDATE pages
        SET area = 'flagged_admin', review_note = %s, reviewed_by = %s, reviewed_at = NOW()
        WHERE page_name = %s RETURNING *
    """, (body.note, current["username"], page_name))
    updated = dict(cur.fetchone())
    conn.commit(); cur.close(); conn.close()
    return updated


# ── Export ────────────────────────────────────────────────────────────────────

def _box_ns(d: dict) -> SimpleNamespace:
    nd = dict(d)
    nd["parent_box_id"] = nd.pop("parent_id", None)
    nd["tag_data"] = nd.get("tag_attributes")
    return SimpleNamespace(**nd)


def _tag_data(box) -> dict:
    raw = getattr(box, "tag_data", None)
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


def _confidence_attr(box) -> str:
    c = box.confidence or "high"
    return f", confidence={c}" if c != "high" else ""


def _opt_attrs(td: dict, keys: list) -> str:
    parts = []
    for k in keys:
        v = td.get(k)
        if v not in (None, "", False):
            parts.append(f"{k}={v}")
    return ", ".join(parts) if parts else ""


def _box_to_latex(box, indent: int = 0) -> str:
    sp  = "  " * indent
    tag = box.tag_category or "unknown"
    td  = _tag_data(box)
    conf    = _confidence_attr(box)
    content = (box.content_text or td.get("content") or td.get("source_text") or "").strip()

    if tag == "text":
        attrs = []
        if td.get("style"): attrs.append(f"style={td['style']}")
        if td.get("lang"):  attrs.append(f"lang={td['lang']}")
        if conf: attrs.append(conf.lstrip(", "))
        attr_str = f"[{', '.join(attrs)}]" if attrs else ""
        return f"{sp}\\text{attr_str}{{{content}}}"

    if tag == "line":
        attrs = []
        indent_val = td.get("indent", "0")
        if indent_val and indent_val != "0": attrs.append(f"indent={indent_val}")
        if td.get("continuation_of"): attrs.append(f"continuation={td['continuation_of']}")
        attr_str = f"[{', '.join(attrs)}]" if attrs else ""
        return f"{sp}\\line{attr_str}{{{content}}}"

    if tag == "heading":
        return f"{sp}\\heading[{td.get('level', '1')}]{{{content}}}"

    if tag == "paragraph":
        lang = td.get("lang", "")
        lang_attr = f"[lang={lang}]" if lang else ""
        lines = [f"{sp}  \\text{{{l.strip()}}}" for l in content.split("\n") if l.strip()]
        inner = "\n".join(lines) if lines else f"{sp}  {content}"
        return f"{sp}\\begin{{paragraph}}{lang_attr}\n{inner}\n{sp}\\end{{paragraph}}"

    if tag == "sout":
        if td.get("in_math"):
            return f"{sp}$\\cancel{{{content}}}$"
        return f"{sp}\\sout{{{content}}}"

    if tag == "scribble":
        if td.get("partial") and content:
            return f"{sp}\\scribble[partial]{{{content}}}"
        return f"{sp}\\scribble{{}}"

    if tag == "overwrite":
        return f"{sp}\\overwrite{{{td.get('original', '')}}}{{{content}}}"

    if tag == "insert":
        direction = td.get("direction", "above")
        cmd = {"above": "\\insertabove", "below": "\\insertbelow", "inline": "\\insertinline"}.get(direction, "\\insertabove")
        return f"{sp}{cmd}{{{content}}}"

    if tag == "underline":
        return f"{sp}\\underline{{{content}}}"

    if tag == "circle":
        return f"{sp}\\circle{{{content}}}"

    if tag == "illegible":
        guessed = td.get("guessed", "")
        return f"{sp}\\illegible[guess={{{guessed}}}]{{}}" if guessed else f"{sp}\\illegible{{}}"

    if tag == "overlap":
        return f"{sp}\\overlap[flag=human_review]{{{td.get('description', '')}}}"

    if tag == "arrow_start":
        return f"{sp}\\arrow_start[id={td.get('pair_id', '?')}]{{{content}}}"

    if tag == "arrow_target":
        return f"{sp}\\arrow_target[id={td.get('pair_id', '?')}]{{{content}}}"

    if tag == "page_start":
        return f"{sp}\\page_start[id={td.get('pair_id', '?')}, target_page={td.get('target_page', '?')}]{{{content}}}"

    if tag == "page_target":
        return f"{sp}\\page_target[id={td.get('pair_id', '?')}]{{{content}}}"

    if tag == "marginnote":
        side = td.get("side", "")
        return f"{sp}\\marginnote{'[' + side + ']' if side else ''}{{{content}}}"

    if tag == "math_inline":
        return f"{sp}${content}$"

    if tag == "math_block":
        return f"{sp}\\[\n{sp}  {content}\n{sp}\\]"

    if tag == "ce":
        rtype = td.get("reaction_type", "")
        attr  = f"[type={rtype}]" if rtype else ""
        return f"{sp}\\ce{attr}{{{content}}}"

    if tag == "tabular":
        col_align  = td.get("column_align", "l")
        rows_lines = "\n".join(f"{sp}  {r} \\\\" for r in (content or "").split("\n") if r.strip())
        if td.get("has_header") and rows_lines:
            rows_lines = rows_lines.replace("\\\\", "\\\\\n\\hline", 1)
        return (f"{sp}\\begin{{tabular}}{{{col_align}}}\n"
                f"{sp}\\hline\n{rows_lines}\n{sp}\\hline\n{sp}\\end{{tabular}}")

    if tag in ("enumerate", "itemize"):
        items = [f"{sp}  \\item {l.strip()}" for l in content.split("\n") if l.strip()]
        return f"{sp}\\begin{{{tag}}}\n{chr(10).join(items)}\n{sp}\\end{{{tag}}}"

    if tag == "formalletter":
        flags = [k.replace("has_", "") for k in
                 ("has_sender_address", "has_date", "has_receiver_address",
                  "has_salutation", "has_subject", "has_closing", "has_signature")
                 if td.get(k)]
        return (f"{sp}\\begin{{formalletter}}[{', '.join(flags)}]\n"
                f"{sp}  {content}\n{sp}\\end{{formalletter}}")

    if tag == "letter_informal":
        return f"{sp}\\begin{{letter}}\n{sp}  {content}\n{sp}\\end{{letter}}"

    if tag == "notice":
        parts = []
        if td.get("institution"): parts.append(f"\\institution{{{td['institution']}}}")
        if td.get("title"):       parts.append(f"\\title{{{td['title']}}}")
        parts.append(content)
        inner = f"\n{sp}  ".join(p for p in parts if p)
        return f"{sp}\\begin{{notice}}\n{sp}  {inner}\n{sp}\\end{{notice}}"

    if tag == "application":
        return f"{sp}\\begin{{application}}\n{sp}  {content}\n{sp}\\end{{application}}"

    if tag == "graph":
        lines = [f"\\begin{{graph}}[type={td.get('graph_type', '')}]"]
        if td.get("x_label") or td.get("x_unit"):
            xl = td.get("x_label",""), td.get("x_unit",""), td.get("x_min",""), td.get("x_max","")
            lines += [f"  \\begin{{xaxis}}[label={xl[0]}, unit={xl[1]}, min={xl[2]}, max={xl[3]}]", "  \\end{xaxis}"]
        if td.get("y_label") or td.get("y_unit"):
            yl = td.get("y_label",""), td.get("y_unit",""), td.get("y_min",""), td.get("y_max","")
            lines += [f"  \\begin{{yaxis}}[label={yl[0]}, unit={yl[1]}, min={yl[2]}, max={yl[3]}]", "  \\end{yaxis}"]
        mx,my,cx,cy,r2 = td.get("calib_mx"),td.get("calib_my"),td.get("calib_cx"),td.get("calib_cy"),td.get("calib_r2")
        if any(v is not None for v in [mx,my,cx,cy]):
            lines += ["  \\begin{calibration}",
                      f"    \\transform_matrix{{{mx}  0  {cx} / 0  {my}  {cy} / 0  0  1}}"]
            if r2 is not None: lines.append(f"    \\calibration_confidence[r_squared={r2}]{{}}")
            lines.append("  \\end{calibration}")
        if td.get("written_solution"): lines.append(f"  \\written_solution{{{td['written_solution']}}}")
        lines.append("\\end{graph}")
        return "\n".join(f"{sp}{l}" for l in lines)

    if tag == "map":
        lines = [f"\\begin{{map}}[type={td.get('map_type', '')}]"]
        if td.get("anchor_points"):
            lines += ["  \\begin{calibration}", "    \\begin{anchor_points}"]
            for ap in td["anchor_points"].split("\n"):
                if ap.strip(): lines.append(f"      % {ap.strip()}")
            lines += ["    \\end{anchor_points}", "  \\end{calibration}"]
        if td.get("markings"):
            lines.append("  \\begin{markings}")
            for m in td["markings"].split("\n"):
                if m.strip(): lines.append(f"    % {m.strip()}")
            lines.append("  \\end{markings}")
        lines.append("\\end{map}")
        return "\n".join(f"{sp}{l}" for l in lines)

    if tag == "diagram":
        dtype, comp, corr = td.get("diagram_type",""), td.get("completeness",""), td.get("correctness","")
        lines = [f"\\begin{{diagram}}[type={dtype}]",
                 f"  \\identification[completeness={comp}, correctness={corr}]{{}}"]
        if td.get("labels_found") or td.get("missing_labels"):
            lines.append("  \\begin{components}")
            for lbl in (td.get("labels_found") or "").split(","):
                if lbl.strip(): lines.append(f"    \\component[labelled=true]{{{lbl.strip()}}}")
            for lbl in (td.get("missing_labels") or "").split(","):
                if lbl.strip(): lines.append(f"    \\component[labelled=false]{{{lbl.strip()}}}")
            lines.append("  \\end{components}")
        if td.get("description"):
            lines.append(f"  \\begin{{description}}\n    {td['description']}\n  \\end{{description}}")
        neatness = td.get("neatness")
        if neatness is not None:
            flag = ", flag=human_review" if td.get("neatness_flag") else ""
            lines.append(f"  \\neatness[score={neatness}, max=5{flag}]{{}}")
        lines.append("\\end{diagram}")
        return "\n".join(f"{sp}{l}" for l in lines)

    if tag == "flowchart":
        lines = [f"\\begin{{flowchart}}[completeness={td.get('completeness','')}]"]
        if td.get("description"): lines.append(f"  {td['description']}")
        lines.append("\\end{flowchart}")
        return "\n".join(f"{sp}{l}" for l in lines)

    if tag == "prosody_kannada":
        lines = ["\\begin{prosody}[lang=kannada]", "  \\begin{prastara}", f"    {td.get('source_text','')}",
                 "  \\end{prastara}"]
        if td.get("gana_labels"): lines.append(f"  \\gana_label{{{td['gana_labels']}}}")
        if td.get("chanda"):      lines.append(f"  \\chanda{{{td['chanda']}}}")
        lines.append("\\end{prosody}")
        return "\n".join(f"{sp}{l}" for l in lines)

    if tag == "hwscore":
        dims  = ["letter_formation","sizing_consistency","spacing","alignment","pen_pressure","neatness"]
        lines = ["\\begin{hwscore}"]
        for d in dims:
            lines.append(f"  \\hwdimension{{{d.replace('_',' ').title()}}}{{{td.get(d,'')}}}{{5}}")
        if td.get("overall") is not None: lines.append(f"  \\hwoverall{{{td['overall']}}}{{5}}")
        lines.append("\\end{hwscore}")
        return "\n".join(f"{sp}{l}" for l in lines)

    if tag == "teacher_mark":
        return f"{sp}\\teacher_mark[type={td.get('mark_type','')}, colour={td.get('ink_colour','')}, ref={td.get('ref_box_id','')}]{{}}"

    if tag == "teacher_score":
        return f"{sp}\\teacher_score[type={td.get('score_type','')}, raw={{{td.get('raw_text','')}}}, value={td.get('value','')}, max={td.get('max','')}]{{}}"

    if tag == "teacher_comment":
        return f"{sp}\\teacher_comment[sentiment={td.get('sentiment','')}, ink={td.get('ink_colour','')}]{{{content}}}"

    if tag == "stamp_circular":
        lines = ["\\stamp[type=circular]{"]
        for k in ("outer_text","middle_text","inner_text","center_text"):
            if td.get(k): lines.append(f"  \\{k}{{{td[k]}}}")
        lines.append("}")
        return "\n".join(f"{sp}{l}" for l in lines)

    if tag == "rough":
        return f"{sp}\\begin{{rough}}\n{sp}  {content}\n{sp}\\end{{rough}}"

    if tag == "metadata":
        lines = ["\\begin{metadata}"]
        if td.get("question_number"): lines.append(f"  \\question_number{{{td['question_number']}}}")
        if td.get("page_number"):     lines.append(f"  \\page_number{{{td['page_number']}}}")
        if td.get("roll_number"):     lines.append(f"  \\roll_number{{\\redacted{{}}}}")
        lines.append("\\end{metadata}")
        return "\n".join(f"{sp}{l}" for l in lines)

    if tag == "answer":
        qid   = td.get("question_id", "?")
        attrs = []
        attempt = td.get("attempt")
        if attempt and int(attempt) > 1: attrs.append(f"attempt={attempt}")
        if td.get("cancelled"):  attrs.append("cancelled=true")
        if td.get("misplaced"):  attrs.append(f"misplaced=true, intended={td.get('intended_q','?')}")
        attr_str = f"[{', '.join(attrs)}]" if attrs else ""
        if td.get("blank"):
            return f"{sp}\\begin{{answer}}{attr_str}{{{qid}}}\n{sp}  \\blank{{}}\n{sp}\\end{{answer}}"
        return f"{sp}\\begin{{answer}}{attr_str}{{{qid}}}\n{sp}  % content boxes nested here\n{sp}\\end{{answer}}"

    if tag == "spread":
        return f"{sp}\\begin{{spread}}[spine_x={td.get('spine_x','0.5')}]\n{sp}  % left page | right page\n{sp}\\end{{spread}}"

    if tag == "page_boundary":
        return f"{sp}\\page_boundary{{}}"

    if tag == "page_text":
        return f"{sp}\\begin{{page_text}}\n{sp}  % annotated content\n{sp}\\end{{page_text}}"

    return f"{sp}\\{tag}{{{content}}}" if content else f"{sp}\\{tag}{{}}"


_ENV_TAGS = {
    "paragraph", "tabular", "enumerate", "itemize", "formalletter",
    "letter_informal", "notice", "application", "graph", "map",
    "diagram", "flowchart", "prosody_kannada", "hwscore", "rough",
    "metadata", "answer", "spread", "page_text",
}
_ENV_NAME = {"letter_informal": "letter", "prosody_kannada": "prosody"}


def _env_attrs(tag, td, box) -> str:
    if tag == "answer" and td.get("question_id"):
        return f"q={td['question_id']}"
    if tag in ("paragraph", "text") and td.get("lang"):
        return f"lang={td['lang']}"
    if tag == "prosody_kannada":
        return "lang=kannada"
    if tag == "graph" and td.get("graph_type"):
        return f"type={td['graph_type']}"
    if tag == "map" and td.get("map_type"):
        return f"type={td['map_type']}"
    if tag == "diagram" and td.get("diagram_type"):
        return f"type={td['diagram_type']}"
    return ""


def _sort_key(b):
    return (b.reading_order is None, b.reading_order or 0, b.id)


def _render_tree(box, children_map, indent):
    children = sorted(children_map.get(box.id, []), key=_sort_key)
    if not children:
        try:
            return _box_to_latex(box, indent)
        except Exception as exc:
            return f"{'  '*indent}% ERROR box {box.id}: {exc}"

    sp  = "  " * indent
    tag = box.tag_category or "unknown"
    child_lines = "\n\n".join(_render_tree(c, children_map, indent + 1) for c in children)

    if tag in _ENV_TAGS:
        td      = _tag_data(box)
        env     = _ENV_NAME.get(tag, tag)
        attrs   = _env_attrs(tag, td, box)
        attr_str = f"[{attrs}]" if attrs else ""
        own     = (box.content_text or td.get("content") or "").strip()
        inner_parts = []
        if own:
            for line in own.split("\n"):
                if line.strip():
                    inner_parts.append(f"{sp}  \\text{{{line.strip()}}}")
        inner_parts.append(child_lines)
        inner = "\n\n".join(p for p in inner_parts if p)
        return f"{sp}\\begin{{{env}}}{attr_str}\n\n{inner}\n\n{sp}\\end{{{env}}}"
    else:
        try:
            parent_line = _box_to_latex(box, indent)
        except Exception as exc:
            parent_line = f"{sp}% ERROR box {box.id}: {exc}"
        return f"{parent_line}\n{child_lines}"


@app.get("/export/{page_name}", response_class=PlainTextResponse)
def export_page(page_name: str, _: dict = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT page_number FROM pages WHERE page_name = %s", (page_name,))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        raise HTTPException(404, "Page not found")

    page_number = row["page_number"]
    raw_boxes   = box_db.get_boxes(page_name)
    boxes       = [_box_ns(b) for b in raw_boxes]
    boxes_sorted = sorted(boxes, key=_sort_key)

    children_map = defaultdict(list)
    box_ids  = {b.id for b in boxes_sorted}
    top_level = []
    for box in boxes_sorted:
        if box.parent_box_id and box.parent_box_id in box_ids:
            children_map[box.parent_box_id].append(box)
        else:
            top_level.append(box)

    chunks = [_render_tree(b, children_map, indent=1) for b in top_level]
    inner  = "\n\n".join(chunks)
    return (f"\\begin{{page}}{{{page_number}}}\n\n"
            f"{inner}\n\n"
            f"\\end{{page}}")
