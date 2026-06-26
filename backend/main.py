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
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageEnhance, ImageOps
import io

import box_db
import gdrive
import schemas
from auth import (create_token, get_current_user, hash_password,
                  require_admin, require_manager, verify_password)
from database import get_conn, init_db

REPO_ROOT   = Path(__file__).parent.parent
UPLOADS_DIR = REPO_ROOT / "storage" / "uploads"
RAW_DIR     = REPO_ROOT / "storage" / "raw"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
RAW_DIR.mkdir(parents=True, exist_ok=True)

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
app.mount("/raw", StaticFiles(directory=str(RAW_DIR)), name="raw")


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


def _get_or_create_folder(cur, medium: str, cls: str, subject: str) -> int:
    cur.execute("""
        INSERT INTO folders (medium, cls, subject) VALUES (%s, %s, %s)
        ON CONFLICT (medium, cls, subject) DO UPDATE SET medium = EXCLUDED.medium
        RETURNING id
    """, (medium, cls, subject))
    return cur.fetchone()["id"]


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

def _quad_from_mask(mask: np.ndarray, sw: int, sh: int, min_frac: float = 0.08):
    """Return [[x,y],…] × 4 for the largest quad-shaped contour in mask, or None."""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    min_area = sw * sh * min_frac
    for cnt in contours[:5]:
        if cv2.contourArea(cnt) < min_area:
            break
        for source in [cnt, cv2.convexHull(cnt)]:
            peri = cv2.arcLength(source, True)
            for eps in [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10, 0.12, 0.15, 0.20]:
                approx = cv2.approxPolyDP(source, eps * peri, True)
                if len(approx) == 4 and cv2.isContourConvex(approx):
                    return approx.reshape(4, 2).tolist()
    return None


def _detect_corners(image_bytes: bytes) -> list:
    margin   = 0.05
    fallback = [[margin, margin], [1-margin, margin], [1-margin, 1-margin], [margin, 1-margin]]

    nparr = np.frombuffer(image_bytes, np.uint8)
    img   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return fallback

    h, w   = img.shape[:2]
    scale  = min(1.0, 800 / max(h, w))
    small  = cv2.resize(img, None, fx=scale, fy=scale)
    sh, sw = small.shape[:2]
    gray   = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

    quad = None

    # ── Strategy 1: saturation (white paper = low saturation, surfaces = higher) ──
    hsv   = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    paper = ((hsv[:, :, 1] < 55) & (hsv[:, :, 2] > 60)).astype(np.uint8) * 255
    paper = cv2.morphologyEx(paper, cv2.MORPH_CLOSE, np.ones((20, 20), np.uint8), iterations=3)
    paper = cv2.morphologyEx(paper, cv2.MORPH_OPEN,  np.ones((10, 10), np.uint8), iterations=1)
    quad  = _quad_from_mask(paper, sw, sh, min_frac=0.08)

    # ── Strategy 2: CLAHE + Canny ──
    if quad is None:
        clahe    = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        blurred  = cv2.GaussianBlur(enhanced, (5, 5), 0)
        v        = np.median(blurred)
        edges    = cv2.Canny(blurred, max(0, int(0.3 * v)), min(255, int(1.3 * v)))
        edges    = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8), iterations=2)
        edges    = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=2)
        quad     = _quad_from_mask(edges, sw, sh, min_frac=0.08)

    # ── Strategy 3: Otsu threshold ──
    if quad is None:
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        if np.count_nonzero(thresh) > sh * sw * 0.65:
            thresh = cv2.bitwise_not(thresh)
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8), iterations=3)
        quad   = _quad_from_mask(closed, sw, sh, min_frac=0.08)

    if quad is None:
        return fallback

    pts  = np.array(quad, dtype=np.float32) / np.array([sw, sh], dtype=np.float32)
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


def _next_student_id(cur, folder_id: int, m: str, c: str, s: str) -> int:
    id_prefix = f"{m}_{c}_{s}_id"
    cur.execute(
        "SELECT doc_name FROM documents WHERE folder_id = %s",
        (folder_id,),
    )
    max_id = 0
    for row in cur.fetchall():
        name = row["doc_name"]
        if name.startswith(id_prefix):
            try:
                max_id = max(max_id, int(name[len(id_prefix):]))
            except ValueError:
                pass
    return max_id + 1


# ── Image warp + preprocessing ────────────────────────────────────────────────

def _apply_warp(image_bytes: bytes, corners_norm: list) -> bytes:
    """Clip image to the selected quad, crop to its bounding box, scale to fit
    within 1240×1754, then pad with white to exactly 1240×1754.
    corners_norm: [TL, TR, BR, BL] each as [fx, fy] in [0, 1].
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    h, w = img.shape[:2]

    pts_px = np.array([[c[0] * w, c[1] * h] for c in corners_norm], dtype=np.float32)

    # Mask outside the quad with white
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillPoly(mask, [pts_px.astype(np.int32)], 255)
    white = np.full_like(img, 255)
    img = np.where(mask[:, :, np.newaxis] == 255, img, white)

    # Crop to bounding box
    x0 = max(0, int(np.floor(pts_px[:, 0].min())))
    y0 = max(0, int(np.floor(pts_px[:, 1].min())))
    x1 = min(w, int(np.ceil(pts_px[:, 0].max())))
    y1 = min(h, int(np.ceil(pts_px[:, 1].max())))
    cropped = img[y0:y1, x0:x1]
    crop_h, crop_w = cropped.shape[:2]

    target_w, target_h = 1240, 1754
    scale = min(target_w / max(crop_w, 1), target_h / max(crop_h, 1), 1.0)
    new_w = int(round(crop_w * scale))
    new_h = int(round(crop_h * scale))
    interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_LANCZOS4
    scaled = cv2.resize(cropped, (new_w, new_h), interpolation=interp)

    pad_top    = (target_h - new_h) // 2
    pad_bottom = target_h - new_h - pad_top
    pad_left   = (target_w - new_w) // 2
    pad_right  = target_w - new_w - pad_left
    result = cv2.copyMakeBorder(scaled, pad_top, pad_bottom, pad_left, pad_right,
                                cv2.BORDER_CONSTANT, value=(255, 255, 255))

    buf = io.BytesIO()
    Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB)).save(buf, format="JPEG", quality=92, optimize=True)
    return buf.getvalue()


# ── Image preprocessing ───────────────────────────────────────────────────────

def _preprocess(contents: bytes) -> bytes:
    return contents


# ── Upload ────────────────────────────────────────────────────────────────────

@app.post("/upload")
async def upload_files(
    files: List[UploadFile] = File(...),
    medium:      str = Form("english_medium"),
    cls:         str = Form("class_8"),
    subject:     str = Form("english"),
    corners_json: Optional[str] = Form(None),
    current: dict = Depends(get_current_user),
):
    if not files:
        raise HTTPException(400, "No files provided")

    dest_dir = UPLOADS_DIR / medium / cls / subject
    dest_dir.mkdir(parents=True, exist_ok=True)

    m = _MEDIUM_ABBR.get(medium, medium)
    c = _CLASS_ABBR.get(cls, cls)
    s = _SUBJECT_ABBR.get(subject, subject)

    all_corners: list = []
    if corners_json:
        try:
            all_corners = json.loads(corners_json)
        except Exception:
            pass

    page_names = []

    conn = get_conn()
    cur  = conn.cursor()
    folder_id  = _get_or_create_folder(cur, medium, cls, subject)
    student_id = _next_student_id(cur, folder_id, m, c, s)
    doc_name   = f"{m}_{c}_{s}_id{student_id}"

    cur.execute(
        "INSERT INTO documents (doc_name, folder_id, uploaded_by) VALUES (%s, %s, %s) RETURNING id",
        (doc_name, folder_id, current["username"]),
    )
    doc_id = cur.fetchone()["id"]

    for page_num, upload in enumerate(files, start=1):
        ext = Path(upload.filename or "").suffix.lower()
        if ext not in VALID_EXTS:
            ext = ".jpg"
        page_name = f"{m}_{c}_{s}_id{student_id}_{page_num}"
        fname     = f"{page_name}{ext}"
        file_path = dest_dir / fname
        raw_bytes = await upload.read()

        # Save original (raw) bytes untouched
        raw_dest = RAW_DIR / medium / cls / subject
        raw_dest.mkdir(parents=True, exist_ok=True)
        (raw_dest / fname).write_bytes(raw_bytes)
        raw_image_path = f"{medium}/{cls}/{subject}/{fname}"
        gdrive.upload_async(raw_bytes, f"raw/{raw_image_path}")

        page_corners = all_corners[page_num - 1] if page_num - 1 < len(all_corners) else None
        corners_str  = json.dumps(page_corners) if page_corners is not None else None

        # Apply perspective warp if corners provided, then preprocess
        contents = raw_bytes
        try:
            if page_corners and len(page_corners) == 4:
                contents = _apply_warp(raw_bytes, page_corners)
            contents = _preprocess(contents)
        except Exception:
            contents = raw_bytes

        width = height = None
        try:
            with Image.open(io.BytesIO(contents)) as img:
                width, height = img.size
        except Exception:
            pass

        file_path.write_bytes(contents)
        image_path = f"{medium}/{cls}/{subject}/{fname}"
        gdrive.upload_async(contents, f"uploads/{image_path}")

        cur.execute(
            """
            INSERT INTO pages (page_name, doc_id, page_number, image_path, raw_image_path, width, height, crop_corners)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (page_name, doc_id, page_num, image_path, raw_image_path, width, height, corners_str),
        )
        page_names.append({"display_name": page_name, "page_number": page_num})

    conn.commit()
    cur.close()
    conn.close()

    return {"doc_name": doc_name, "page_names": page_names, "page_count": len(files)}


# ── Documents ─────────────────────────────────────────────────────────────────

@app.get("/folders")
def list_folders(_: dict = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT f.id, f.medium, f.cls, f.subject,
               COUNT(DISTINCT d.id) AS doc_count,
               COUNT(p.page_name)   AS page_count
        FROM folders f
        LEFT JOIN documents d ON d.folder_id = f.id
        LEFT JOIN pages p ON p.doc_id = d.id
        GROUP BY f.id
        ORDER BY f.medium, f.cls, f.subject
    """)
    rows = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return rows


@app.get("/documents")
def list_documents(_: dict = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT d.doc_name, d.uploaded_at, d.uploaded_by,
               f.medium, f.cls, f.subject,
               p.page_name, p.page_number, p.area
        FROM documents d
        JOIN folders f ON f.id = d.folder_id
        LEFT JOIN pages p ON p.doc_id = d.id
        ORDER BY d.uploaded_at DESC, p.page_number ASC
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
                "upload_date":  row["uploaded_at"].isoformat() if row["uploaded_at"] else None,
                "uploaded_by":  row["uploaded_by"],
                "medium":       row["medium"],
                "cls":          row["cls"],
                "subject":      row["subject"],
                "page_count":   0,
                "pages":        [],
            }
        if row["page_name"]:
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
    cur.execute("SELECT 1 FROM documents WHERE doc_name = %s", (doc_name,))
    if not cur.fetchone():
        cur.close(); conn.close()
        raise HTTPException(404, "Document not found")

    new_name = _validate_name(data.display_name) if data.display_name else doc_name
    if new_name != doc_name:
        cur.execute("SELECT 1 FROM documents WHERE doc_name = %s", (new_name,))
        if cur.fetchone():
            cur.close(); conn.close()
            raise HTTPException(409, f"A document named '{new_name}' already exists.")
        cur.execute("UPDATE documents SET doc_name = %s WHERE doc_name = %s", (new_name, doc_name))
        conn.commit()

    cur.close(); conn.close()
    return {"display_name": new_name}


@app.delete("/documents/{doc_name}")
def delete_document(doc_name: str, _: dict = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT p.page_name, p.image_path, p.raw_image_path
        FROM pages p
        JOIN documents d ON d.id = p.doc_id
        WHERE d.doc_name = %s
    """, (doc_name,))
    pages = [dict(r) for r in cur.fetchall()]
    if not pages:
        cur.close(); conn.close()
        raise HTTPException(404, "Document not found")

    for page in pages:
        try:
            (UPLOADS_DIR / page["image_path"]).unlink(missing_ok=True)
        except Exception:
            pass
        try:
            if page.get("raw_image_path"):
                (RAW_DIR / page["raw_image_path"]).unlink(missing_ok=True)
        except Exception:
            pass
    # ON DELETE CASCADE removes pages and their boxes
    cur.execute("DELETE FROM documents WHERE doc_name = %s", (doc_name,))
    conn.commit()
    cur.close(); conn.close()
    return {"deleted": doc_name}


# ── My uploads ───────────────────────────────────────────────────────────────

@app.get("/my-uploads")
def my_uploads(current: dict = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT p.*, d.doc_name, d.uploaded_by, d.uploaded_at, f.medium, f.cls, f.subject
        FROM pages p
        JOIN documents d ON d.id = p.doc_id
        JOIN folders f ON f.id = d.folder_id
        WHERE d.uploaded_by = %s
        ORDER BY d.uploaded_at DESC, p.page_number ASC
    """, (current["username"],))
    rows = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return rows


# ── Admin: upload approval ────────────────────────────────────────────────────

@app.get("/admin/uploads")
def admin_uploads(_: dict = Depends(require_admin)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT p.page_name, d.doc_name, p.page_number, f.medium, f.cls, f.subject,
               p.image_path, p.raw_image_path, d.uploaded_by, d.uploaded_at,
               p.upload_approval_status, p.upload_approval_note
        FROM pages p
        JOIN documents d ON d.id = p.doc_id
        JOIN folders f ON f.id = d.folder_id
        ORDER BY d.uploaded_by, d.doc_name, p.page_number
    """)
    rows = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()

    by_user = {}
    for row in rows:
        user = row["uploaded_by"] or ""
        if user not in by_user:
            by_user[user] = {"username": user, "pending": 0, "redo": 0, "approved": 0, "flagged": 0, "uploads": []}
        by_user[user]["uploads"].append(row)
        status = row["upload_approval_status"] or "pending"
        if status in by_user[user]:
            by_user[user][status] += 1

    return sorted(by_user.values(), key=lambda x: x["username"])


@app.patch("/admin/pages/{page_name}/approve-upload")
def admin_approve_upload(page_name: str, _: dict = Depends(require_admin)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT 1 FROM pages WHERE page_name = %s", (page_name,))
    if not cur.fetchone():
        cur.close(); conn.close(); raise HTTPException(404, "Page not found")
    cur.execute("""
        UPDATE pages SET upload_approval_status = 'approved', upload_approval_note = NULL
        WHERE page_name = %s RETURNING page_name, upload_approval_status
    """, (page_name,))
    updated = dict(cur.fetchone())
    conn.commit(); cur.close(); conn.close()
    return updated


@app.patch("/admin/pages/{page_name}/unflag-upload")
def admin_unflag_upload(page_name: str, _: dict = Depends(require_admin)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT 1 FROM pages WHERE page_name = %s", (page_name,))
    if not cur.fetchone():
        cur.close(); conn.close(); raise HTTPException(404, "Page not found")
    cur.execute("""
        UPDATE pages SET upload_approval_status = 'pending', upload_approval_note = NULL
        WHERE page_name = %s RETURNING page_name, upload_approval_status
    """, (page_name,))
    updated = dict(cur.fetchone())
    conn.commit(); cur.close(); conn.close()
    return updated


@app.patch("/admin/pages/{page_name}/flag-upload")
def admin_flag_upload(page_name: str, body: schemas.UploadApprovalAction, _: dict = Depends(require_admin)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT 1 FROM pages WHERE page_name = %s", (page_name,))
    if not cur.fetchone():
        cur.close(); conn.close(); raise HTTPException(404, "Page not found")
    cur.execute("""
        UPDATE pages SET upload_approval_status = 'flagged', upload_approval_note = %s
        WHERE page_name = %s RETURNING page_name, upload_approval_status, upload_approval_note
    """, (body.note, page_name))
    updated = dict(cur.fetchone())
    conn.commit(); cur.close(); conn.close()
    return updated


# ── Annotator: assigned pages ─────────────────────────────────────────────────

@app.get("/my-pages")
def my_pages(current: dict = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT p.*, COUNT(b.id) AS box_count,
               d.doc_name, d.uploaded_at, f.medium, f.cls, f.subject
        FROM pages p
        LEFT JOIN boxes b ON b.page_name = p.page_name
        JOIN documents d ON d.id = p.doc_id
        JOIN folders f ON f.id = d.folder_id
        WHERE p.assigned_to = %s
        GROUP BY p.page_name, d.doc_name, d.uploaded_at, f.medium, f.cls, f.subject
        ORDER BY d.uploaded_at DESC, p.page_number ASC
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
    folder_id = _get_or_create_folder(cur, body.medium, body.cls, body.subject)
    cur.execute("""
        INSERT INTO annotation_requests (requested_by, medium, cls, subject, folder_id, quantity)
        VALUES (%s, %s, %s, %s, %s, %s) RETURNING *
    """, (current["username"], body.medium, body.cls, body.subject, folder_id, body.quantity))
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
    if not req.get("folder_id"):
        cur.close(); conn.close(); raise HTTPException(400, "Request has no folder — re-submit the request")

    cur.execute("""
        SELECT p.page_name FROM pages p
        JOIN documents d ON d.id = p.doc_id
        WHERE d.folder_id = %s AND p.assigned_to IS NULL AND p.upload_approval_status = 'approved'
        ORDER BY d.uploaded_at ASC, p.page_number ASC
        LIMIT %s
    """, (req["folder_id"], req["quantity"]))
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
    cur.execute("""
        SELECT p.*, d.doc_name, d.uploaded_at, d.uploaded_by, f.medium, f.cls, f.subject
        FROM pages p
        JOIN documents d ON d.id = p.doc_id
        JOIN folders f ON f.id = d.folder_id
        WHERE p.page_name = %s
    """, (page_name,))
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


@app.get("/pages/{page_name}/raw")
def get_raw_image(page_name: str, current: dict = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT p.raw_image_path, d.uploaded_by
        FROM pages p
        JOIN documents d ON d.id = p.doc_id
        WHERE p.page_name = %s
    """, (page_name,))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        raise HTTPException(404, "Page not found")
    if current["role"] not in ("admin", "manager") and row["uploaded_by"] != current["username"]:
        raise HTTPException(403, "Not allowed")
    raw_rel = row["raw_image_path"]
    if not raw_rel:
        raise HTTPException(404, "No raw image stored for this page")
    raw_file = RAW_DIR / raw_rel
    if not raw_file.exists():
        raise HTTPException(404, "Raw file not found on disk")
    return FileResponse(str(raw_file), media_type="image/jpeg")


@app.patch("/pages/{page_name}/image")
async def replace_page_image(page_name: str, file: UploadFile = File(...), corners_json: Optional[str] = Form(None), current: dict = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT p.image_path, p.raw_image_path, d.uploaded_by
        FROM pages p
        JOIN documents d ON d.id = p.doc_id
        WHERE p.page_name = %s
    """, (page_name,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        raise HTTPException(404, "Page not found")
    if current["role"] not in ("admin", "manager") and row["uploaded_by"] != current["username"]:
        cur.close(); conn.close()
        raise HTTPException(403, "Not allowed")

    raw_bytes = await file.read()

    # Parse corners
    page_corners = None
    if corners_json:
        try:
            page_corners = json.loads(corners_json)
        except Exception:
            pass

    # Save original (raw) bytes untouched
    raw_path = RAW_DIR / row["raw_image_path"] if row["raw_image_path"] else None
    if raw_path:
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        raw_path.write_bytes(raw_bytes)
        gdrive.upload_async(raw_bytes, f"raw/{row['raw_image_path']}")

    # Apply perspective warp if corners provided, then preprocess
    contents = raw_bytes
    try:
        if page_corners and len(page_corners) == 4:
            contents = _apply_warp(raw_bytes, page_corners)
        contents = _preprocess(contents)
    except Exception:
        contents = raw_bytes

    img_path = UPLOADS_DIR / row["image_path"]
    img_path.parent.mkdir(parents=True, exist_ok=True)
    img_path.write_bytes(contents)
    gdrive.upload_async(contents, f"uploads/{row['image_path']}")

    width = height = None
    try:
        with Image.open(io.BytesIO(contents)) as img:
            width, height = img.size
    except Exception:
        pass

    cur.execute("SELECT upload_approval_status FROM pages WHERE page_name = %s", (page_name,))
    status_row = cur.fetchone()
    was_flagged = status_row and status_row["upload_approval_status"] == "flagged"

    cur.execute(
        """UPDATE pages
           SET width = %s, height = %s, crop_corners = COALESCE(%s, crop_corners)
               {reset}
           WHERE page_name = %s""".format(
            reset=", upload_approval_status = 'redo'" if was_flagged else ""
        ),
        (width, height, corners_json, page_name),
    )
    conn.commit()
    cur.close(); conn.close()
    return {"page_name": page_name, "width": width, "height": height}


@app.delete("/pages/{page_name}")
def delete_page(page_name: str, current: dict = Depends(get_current_user)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT p.image_path, p.raw_image_path, d.uploaded_by
        FROM pages p
        JOIN documents d ON d.id = p.doc_id
        WHERE p.page_name = %s
    """, (page_name,))
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
    try:
        if row["raw_image_path"]:
            (RAW_DIR / row["raw_image_path"]).unlink(missing_ok=True)
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
        SELECT p.*, COUNT(b.id) AS box_count,
               d.doc_name, d.uploaded_at, d.uploaded_by, f.medium, f.cls, f.subject
        FROM pages p
        LEFT JOIN boxes b ON b.page_name = p.page_name
        JOIN documents d ON d.id = p.doc_id
        JOIN folders f ON f.id = d.folder_id
        WHERE p.assigned_to IS NOT NULL
          AND p.area IN ('pending_approval', 'approved', 'needs_rework', 'flagged_admin')
        GROUP BY p.page_name, d.doc_name, d.uploaded_at, d.uploaded_by, f.medium, f.cls, f.subject
        ORDER BY d.uploaded_at DESC, p.page_number ASC
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
