import json
import os
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from sqlalchemy import text
from sqlalchemy.orm import Session

import models
import schemas
from database import Base, SessionLocal, engine, get_db

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

Base.metadata.create_all(bind=engine)

# Add new columns to existing databases gracefully
def _migrate_db():
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE documents ADD COLUMN display_name TEXT",
            "ALTER TABLE boxes ADD COLUMN parent_box_id INTEGER REFERENCES boxes(id)",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # column already exists

_migrate_db()

app = FastAPI(title="Annotation Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


# ── Upload ────────────────────────────────────────────────────────────────────

@app.post("/upload")
async def upload_files(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    first = files[0]
    base_name = Path(first.filename).stem if first.filename else "scan"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    doc_slug = f"{timestamp}_{base_name}"

    db_doc = models.Document(
        filename=doc_slug,
        original_filename=first.filename or "upload",
        display_name=base_name,
        page_count=len(files),
        status="pending",
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)

    page_ids = []
    for page_num, upload in enumerate(files, start=1):
        ext = Path(upload.filename).suffix.lstrip(".").lower() if upload.filename else "jpg"
        if ext not in ("jpg", "jpeg", "png", "webp"):
            ext = "jpg"
        saved_name = f"{doc_slug}_p{page_num}.{ext}"
        file_path = UPLOAD_DIR / saved_name

        contents = await upload.read()
        file_path.write_bytes(contents)

        width = height = None
        try:
            with Image.open(file_path) as img:
                width, height = img.size
        except Exception:
            pass

        db_page = models.Page(
            document_id=db_doc.id,
            page_number=page_num,
            image_path=saved_name,
            width=width,
            height=height,
            status="pending",
        )
        db.add(db_page)
        db.commit()
        db.refresh(db_page)
        page_ids.append(db_page.id)

    return {"document_id": db_doc.id, "page_ids": page_ids, "page_count": len(files)}


# ── Documents ─────────────────────────────────────────────────────────────────

@app.get("/documents")
def list_documents(db: Session = Depends(get_db)):
    docs = (
        db.query(models.Document)
        .order_by(models.Document.upload_date.desc())
        .all()
    )
    result = []
    for doc in docs:
        pages = (
            db.query(models.Page)
            .filter(models.Page.document_id == doc.id)
            .order_by(models.Page.page_number)
            .all()
        )
        result.append({
            "id": doc.id,
            "filename": doc.filename,
            "original_filename": doc.original_filename,
            "display_name": doc.display_name or doc.original_filename,
            "upload_date": doc.upload_date.isoformat() if doc.upload_date else None,
            "status": doc.status,
            "page_count": doc.page_count,
            "pages": [{"id": p.id, "page_number": p.page_number, "status": p.status} for p in pages],
        })
    return result


@app.get("/documents/{doc_id}")
def get_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    pages = (
        db.query(models.Page)
        .filter(models.Page.document_id == doc.id)
        .order_by(models.Page.page_number)
        .all()
    )
    return {
        "id": doc.id,
        "filename": doc.filename,
        "original_filename": doc.original_filename,
        "display_name": doc.display_name or doc.original_filename,
        "upload_date": doc.upload_date.isoformat() if doc.upload_date else None,
        "status": doc.status,
        "page_count": doc.page_count,
        "pages": [
            {
                "id": p.id,
                "page_number": p.page_number,
                "image_path": p.image_path,
                "width": p.width,
                "height": p.height,
                "status": p.status,
            }
            for p in pages
        ],
    }


@app.patch("/documents/{doc_id}")
def update_document(doc_id: int, data: schemas.DocumentUpdate, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if data.display_name is not None:
        doc.display_name = data.display_name
    if data.status is not None:
        doc.status = data.status
    db.commit()
    db.refresh(doc)
    return {"id": doc.id, "display_name": doc.display_name}


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    # Remove image files
    pages = db.query(models.Page).filter(models.Page.document_id == doc_id).all()
    for page in pages:
        try:
            (UPLOAD_DIR / page.image_path).unlink(missing_ok=True)
        except Exception:
            pass
    db.delete(doc)
    db.commit()
    return {"deleted": doc_id}


# ── Pages ─────────────────────────────────────────────────────────────────────

@app.get("/pages/{page_id}")
def get_page(page_id: int, db: Session = Depends(get_db)):
    page = db.query(models.Page).filter(models.Page.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return {
        "id": page.id,
        "document_id": page.document_id,
        "page_number": page.page_number,
        "image_path": page.image_path,
        "width": page.width,
        "height": page.height,
        "status": page.status,
    }


@app.get("/pages/{page_id}/boxes")
def get_page_boxes(page_id: int, db: Session = Depends(get_db)):
    page = db.query(models.Page).filter(models.Page.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    boxes = db.query(models.Box).filter(models.Box.page_id == page_id).all()
    return [_box_dict(b) for b in boxes]


# ── Boxes ─────────────────────────────────────────────────────────────────────

@app.post("/boxes")
def create_box(box: schemas.BoxCreate, db: Session = Depends(get_db)):
    db_box = models.Box(**box.model_dump())
    db.add(db_box)
    db.commit()
    db.refresh(db_box)
    return _box_dict(db_box)


@app.put("/boxes/{box_id}")
def update_box(box_id: int, data: schemas.BoxUpdate, db: Session = Depends(get_db)):
    db_box = db.query(models.Box).filter(models.Box.id == box_id).first()
    if not db_box:
        raise HTTPException(status_code=404, detail="Box not found")
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(db_box, field, val)
    db.commit()
    db.refresh(db_box)
    return _box_dict(db_box)


@app.delete("/boxes/{box_id}")
def delete_box(box_id: int, db: Session = Depends(get_db)):
    db_box = db.query(models.Box).filter(models.Box.id == box_id).first()
    if not db_box:
        raise HTTPException(status_code=404, detail="Box not found")
    db.delete(db_box)
    db.commit()
    return {"deleted": box_id}


def _box_dict(b: models.Box) -> dict:
    return {
        "id": b.id,
        "page_id": b.page_id,
        "parent_box_id": b.parent_box_id,
        "x": b.x,
        "y": b.y,
        "width": b.width,
        "height": b.height,
        "tag_category": b.tag_category,
        "tag_data": b.tag_data,
        "content_text": b.content_text,
        "reading_order": b.reading_order,
        "confidence": b.confidence,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


# ── Export ────────────────────────────────────────────────────────────────────

def _tag_data(box: models.Box) -> dict:
    if not box.tag_data:
        return {}
    try:
        return json.loads(box.tag_data)
    except (json.JSONDecodeError, TypeError):
        return {}


def _confidence_attr(box: models.Box) -> str:
    c = box.confidence or "high"
    return f", confidence={c}" if c != "high" else ""


def _opt_attrs(td: dict, keys: list) -> str:
    parts = []
    for k in keys:
        v = td.get(k)
        if v not in (None, "", False):
            parts.append(f"{k}={v}")
    return (", ".join(parts)) if parts else ""


def _box_to_latex(box: models.Box, indent: int = 0) -> str:
    sp = "  " * indent
    tag = box.tag_category or "unknown"
    td = _tag_data(box)
    conf = _confidence_attr(box)
    content = (box.content_text or td.get("content") or td.get("source_text") or "").strip()

    # ── TEXT ──────────────────────────────────────────────────────────────
    if tag == "text":
        attrs = []
        if td.get("style"): attrs.append(f"style={td['style']}")
        if td.get("lang"): attrs.append(f"lang={td['lang']}")
        if box.reading_order is not None: attrs.append(f"id=text{box.id}")
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
        level = td.get("level", "1")
        return f"{sp}\\heading[{level}]{{{content}}}"

    if tag == "paragraph":
        lang = td.get("lang", "")
        lang_attr = f"[lang={lang}]" if lang else ""
        lines = [f"{sp}  \\text{{{l.strip()}}}" for l in content.split("\n") if l.strip()]
        inner = "\n".join(lines) if lines else f"{sp}  {content}"
        return f"{sp}\\begin{{paragraph}}{lang_attr}\n{inner}\n{sp}\\end{{paragraph}}"

    # ── CORRECTIONS ───────────────────────────────────────────────────────
    if tag == "sout":
        if td.get("in_math"):
            return f"{sp}$\\cancel{{{content}}}$"
        return f"{sp}\\sout{{{content}}}"

    if tag == "scribble":
        if td.get("partial") and content:
            return f"{sp}\\scribble[partial]{{{content}}}"
        return f"{sp}\\scribble{{}}"

    if tag == "overwrite":
        original = td.get("original", "")
        return f"{sp}\\overwrite{{{original}}}{{{content}}}"

    if tag == "insert":
        direction = td.get("direction", "above")
        cmd = {"above": "\\insertabove", "below": "\\insertbelow", "inline": "\\insertinline"}.get(direction, "\\insertabove")
        return f"{sp}{cmd}{{{content}}}"

    if tag == "underline":
        ink = td.get("ink_colour", "")
        attr = f"[ink={ink}]" if ink else ""
        return f"{sp}\\underline{attr}{{{content}}}"

    if tag == "circle":
        return f"{sp}\\circle{{{content}}}"

    if tag == "illegible":
        guessed = td.get("guessed", "")
        if guessed:
            return f"{sp}\\illegible[guess={{{guessed}}}]{{}}"
        return f"{sp}\\illegible{{}}"

    if tag == "overlap":
        desc = td.get("description", "")
        return f"{sp}\\overlap[flag=human_review]{{{desc}}}"

    # ── CONTINUATIONS ─────────────────────────────────────────────────────
    if tag == "arrow_start":
        pair_id = td.get("pair_id", "?")
        return f"{sp}\\arrow_start{{{pair_id}}}\n{sp}% content: {content}" if content else f"{sp}\\arrow_start{{{pair_id}}}"

    if tag == "arrow_target":
        pair_id = td.get("pair_id", "?")
        return f"{sp}\\arrow_target{{{pair_id}}}{{{content}}}"

    if tag == "page_start":
        pair_id = td.get("pair_id", "?")
        target = td.get("target_page", "?")
        return f"{sp}\\page_start{{{pair_id}}}{{{content}}}"

    if tag == "page_target":
        pair_id = td.get("pair_id", "?")
        return f"{sp}\\page_target{{{pair_id}}}{{{content}}}"

    if tag == "marginnote":
        side = td.get("side", "")
        attr = f"[{side}]" if side else ""
        return f"{sp}\\marginnote{attr}{{{content}}}"

    # ── MATH ──────────────────────────────────────────────────────────────
    if tag == "math_inline":
        return f"{sp}${content}$"

    if tag == "math_block":
        return f"{sp}\\[\n{sp}  {content}\n{sp}\\]"

    if tag == "ce":
        rtype = td.get("reaction_type", "")
        attr = f"[type={rtype}]" if rtype else ""
        return f"{sp}\\ce{attr}{{{content}}}"

    # ── STRUCTURE ─────────────────────────────────────────────────────────
    if tag == "tabular":
        col_align = td.get("column_align", "l")
        rows_raw = content or ""
        rows_lines = "\n".join(f"{sp}  {r} \\\\" for r in rows_raw.split("\n") if r.strip())
        if td.get("has_header") and rows_lines:
            rows_lines = rows_lines.replace("\\\\", "\\\\\n\\hline", 1)
        return (
            f"{sp}\\begin{{tabular}}{{{col_align}}}\n"
            f"{sp}\\hline\n"
            f"{rows_lines}\n"
            f"{sp}\\hline\n"
            f"{sp}\\end{{tabular}}"
        )

    if tag in ("enumerate", "itemize"):
        items = [f"{sp}  \\item {l.strip()}" for l in content.split("\n") if l.strip()]
        inner = "\n".join(items)
        return f"{sp}\\begin{{{tag}}}\n{inner}\n{sp}\\end{{{tag}}}"

    # ── DOCUMENT ──────────────────────────────────────────────────────────
    if tag == "formalletter":
        bool_flags = []
        for k in ("has_sender_address", "has_date", "has_receiver_address", "has_salutation", "has_subject", "has_closing", "has_signature"):
            if td.get(k): bool_flags.append(k.replace("has_", ""))
        flags_str = ", ".join(bool_flags)
        return (
            f"{sp}\\begin{{formalletter}}[{flags_str}]\n"
            f"{sp}  {content}\n"
            f"{sp}\\end{{formalletter}}"
        )

    if tag == "letter_informal":
        return (
            f"{sp}\\begin{{letter}}\n"
            f"{sp}  {content}\n"
            f"{sp}\\end{{letter}}"
        )

    if tag == "notice":
        parts = []
        if td.get("institution"): parts.append(f"\\institution{{{td['institution']}}}")
        if td.get("title"): parts.append(f"\\title{{{td['title']}}}")
        parts.append(content)
        inner = f"\n{sp}  ".join(p for p in parts if p)
        return f"{sp}\\begin{{notice}}\n{sp}  {inner}\n{sp}\\end{{notice}}"

    if tag == "application":
        return f"{sp}\\begin{{application}}\n{sp}  {content}\n{sp}\\end{{application}}"

    # ── VISUAL ────────────────────────────────────────────────────────────
    if tag == "graph":
        gtype = td.get("graph_type", "")
        lines = [f"\\begin{{graph}}[type={gtype}]"]
        # Axes
        if td.get("x_label") or td.get("x_unit"):
            xl = td.get("x_label", ""), td.get("x_unit", ""), td.get("x_min", ""), td.get("x_max", "")
            lines.append(f"  \\begin{{xaxis}}[label={xl[0]}, unit={xl[1]}, min={xl[2]}, max={xl[3]}]")
            lines.append("  \\end{xaxis}")
        if td.get("y_label") or td.get("y_unit"):
            yl = td.get("y_label", ""), td.get("y_unit", ""), td.get("y_min", ""), td.get("y_max", "")
            lines.append(f"  \\begin{{yaxis}}[label={yl[0]}, unit={yl[1]}, min={yl[2]}, max={yl[3]}]")
            lines.append("  \\end{yaxis}")
        # Calibration
        mx, my, cx, cy, r2 = td.get("calib_mx"), td.get("calib_my"), td.get("calib_cx"), td.get("calib_cy"), td.get("calib_r2")
        if any(v is not None for v in [mx, my, cx, cy]):
            lines.append(f"  \\begin{{calibration}}")
            lines.append(f"    \\transform_matrix{{{mx}  0  {cx} / 0  {my}  {cy} / 0  0  1}}")
            if r2 is not None: lines.append(f"    \\calibration_confidence[r_squared={r2}]{{}}")
            lines.append(f"  \\end{{calibration}}")
        if td.get("curves"):
            for curve in td["curves"].split("\n"):
                if curve.strip():
                    lines.append(f"  % curve: {curve.strip()}")
        if td.get("written_solution"):
            lines.append(f"  \\written_solution{{{td['written_solution']}}}")
        if td.get("table_of_values_present"):
            lines.append(f"  \\table_of_values[correct={td.get('table_correct', '')}, total={td.get('table_total', '')}]{{}}")
        lines.append("\\end{graph}")
        return ("\n" + sp).join(f"{sp}{l}" if i > 0 else f"{sp}{l}" for i, l in enumerate(lines))

    if tag == "map":
        mtype = td.get("map_type", "")
        lines = [f"\\begin{{map}}[type={mtype}]"]
        if td.get("anchor_points"):
            lines.append("  \\begin{calibration}")
            lines.append("    \\begin{anchor_points}")
            for ap in td["anchor_points"].split("\n"):
                if ap.strip(): lines.append(f"      % {ap.strip()}")
            lines.append("    \\end{anchor_points}")
            lines.append("  \\end{calibration}")
        if td.get("markings"):
            lines.append("  \\begin{markings}")
            for m in td["markings"].split("\n"):
                if m.strip(): lines.append(f"    % {m.strip()}")
            lines.append("  \\end{markings}")
        if td.get("notes"): lines.append(f"  % notes: {td['notes']}")
        lines.append("\\end{map}")
        return "\n".join(f"{sp}{l}" for l in lines)

    if tag == "diagram":
        dtype = td.get("diagram_type", "")
        comp = td.get("completeness", "")
        corr = td.get("correctness", "")
        lines = [f"\\begin{{diagram}}[type={dtype}]"]
        lines.append(f"  \\identification[completeness={comp}, correctness={corr}]{{}}")
        if td.get("labels_found") or td.get("missing_labels"):
            lines.append("  \\begin{components}")
            for lbl in (td.get("labels_found") or "").split(","):
                l = lbl.strip()
                if l: lines.append(f"    \\component[labelled=true]{{{l}}}")
            for lbl in (td.get("missing_labels") or "").split(","):
                l = lbl.strip()
                if l: lines.append(f"    \\component[labelled=false]{{{l}}}")
            lines.append("  \\end{components}")
        if td.get("position_relations"):
            lines.append("  \\begin{position}")
            for rel in td["position_relations"].split("\n"):
                if rel.strip(): lines.append(f"    % {rel.strip()}")
            lines.append("  \\end{position}")
        if td.get("description"):
            lines.append(f"  \\begin{{description}}\n    {td['description']}\n  \\end{{description}}")
        neatness = td.get("neatness")
        if neatness is not None:
            flag = ", flag=human_review" if td.get("neatness_flag") else ""
            lines.append(f"  \\neatness[score={neatness}, max=5{flag}]{{}}")
        lines.append("\\end{diagram}")
        return "\n".join(f"{sp}{l}" for l in lines)

    if tag == "flowchart":
        comp = td.get("completeness", "")
        lines = [f"\\begin{{flowchart}}[completeness={comp}]"]
        if td.get("description"): lines.append(f"  {td['description']}")
        lines.append("\\end{flowchart}")
        return "\n".join(f"{sp}{l}" for l in lines)

    # ── LANGUAGE ──────────────────────────────────────────────────────────
    if tag in ("prosody_kannada", "prosody_sanskrit"):
        lang = "kannada" if tag == "prosody_kannada" else "sanskrit"
        src = td.get("source_text", "")
        lines = [f"\\begin{{prosody}}[lang={lang}]"]
        lines.append(f"  \\begin{{prastara}}")
        lines.append(f"    {src}")
        lines.append(f"  \\end{{prastara}}")
        if td.get("gana_marks_present") and td.get("laghu_guru_pattern"):
            lines.append(f"  % gana pattern: {td['laghu_guru_pattern']}")
        if td.get("gana_labels"): lines.append(f"  \\gana_label{{{td['gana_labels']}}}")
        if td.get("chanda"): lines.append(f"  \\chanda{{{td['chanda']}}}")
        lines.append("\\end{prosody}")
        return "\n".join(f"{sp}{l}" for l in lines)

    if tag == "hwscore":
        dims = ["letter_formation", "sizing_consistency", "spacing", "alignment", "pen_pressure", "neatness"]
        lines = ["\\begin{hwscore}"]
        for d in dims:
            v = td.get(d, "")
            label = d.replace("_", " ").title()
            lines.append(f"  \\hwdimension{{{label}}}{{{v}}}{{5}}")
        if td.get("overall") is not None:
            lines.append(f"  \\hwoverall{{{td['overall']}}}{{5}}")
        lines.append("\\end{hwscore}")
        return "\n".join(f"{sp}{l}" for l in lines)

    # ── ADMINISTRATIVE ────────────────────────────────────────────────────
    if tag == "teacher_mark":
        mtype = td.get("mark_type", "")
        ink = td.get("ink_colour", "")
        ref = td.get("ref_box_id", "")
        return f"{sp}\\teacher_mark[type={mtype}, colour={ink}, ref={ref}]{{}}"

    if tag == "teacher_score":
        stype = td.get("score_type", "")
        raw = td.get("raw_text", "")
        val = td.get("value", "")
        mx = td.get("max", "")
        return f"{sp}\\teacher_score[type={stype}, raw={{{raw}}}, value={val}, max={mx}]{{}}"

    if tag == "teacher_comment":
        sent = td.get("sentiment", "")
        ink = td.get("ink_colour", "")
        return f"{sp}\\teacher_comment[sentiment={sent}, ink={ink}]{{{content}}}"

    if tag == "teacher_stamp":
        stype = td.get("stamp_type", "")
        return f"{sp}\\teacher_stamp[type={stype}]{{{content}}}"

    if tag == "stamp_circular":
        lines = [f"\\stamp[type=circular]{{"]
        for k in ("outer_text", "middle_text", "inner_text", "center_text"):
            v = td.get(k, "")
            if v: lines.append(f"  \\{k}{{{v}}}")
        lines.append("}")
        return "\n".join(f"{sp}{l}" for l in lines)

    if tag == "rough":
        return f"{sp}\\begin{{rough}}\n{sp}  {content}\n{sp}\\end{{rough}}"

    if tag == "metadata":
        lines = ["\\begin{metadata}"]
        if td.get("question_number"): lines.append(f"  \\question_number{{{td['question_number']}}}")
        if td.get("page_number"): lines.append(f"  \\page_number{{{td['page_number']}}}")
        if td.get("roll_number"): lines.append(f"  \\roll_number{{\\redacted{{}}}}")
        lines.append("\\end{metadata}")
        return "\n".join(f"{sp}{l}" for l in lines)

    # ── WRAPPERS ──────────────────────────────────────────────────────────
    if tag == "answer":
        qid = td.get("question_id", "?")
        attrs = []
        attempt = td.get("attempt")
        if attempt and int(attempt) > 1: attrs.append(f"attempt={attempt}")
        if td.get("cancelled"): attrs.append("cancelled=true")
        if td.get("misplaced"): attrs.append(f"misplaced=true, intended={td.get('intended_q', '?')}")
        attr_str = f"[{', '.join(attrs)}]" if attrs else ""
        if td.get("blank"):
            return f"{sp}\\begin{{answer}}{attr_str}{{{qid}}}\n{sp}  \\blank{{}}\n{sp}\\end{{answer}}"
        return f"{sp}\\begin{{answer}}{attr_str}{{{qid}}}\n{sp}  % content boxes nested here\n{sp}\\end{{answer}}"

    if tag == "spread":
        sx = td.get("spine_x", "0.5")
        return f"{sp}\\begin{{spread}}[spine_x={sx}]\n{sp}  % left page | right page\n{sp}\\end{{spread}}"

    # ── FALLBACK ──────────────────────────────────────────────────────────
    if content:
        return f"{sp}\\{tag}{{{content}}}"
    return f"{sp}\\{tag}{{}}"


def _sort_key(b):
    return (b.reading_order is None, b.reading_order or 0, b.id)

def _render_tree(box, children_map, indent):
    """Render a box and all its nested children."""
    children = sorted(children_map.get(box.id, []), key=_sort_key)
    if not children:
        try:
            return _box_to_latex(box, indent)
        except Exception as exc:
            return f"{'  '*indent}% ERROR box {box.id}: {exc}"

    # Render parent open, then children indented, then parent close
    sp = "  " * indent
    tag = box.tag_category or "unknown"
    schema = TAG_SCHEMAS_ENV.get(tag, False)
    child_lines = "\n\n".join(_render_tree(c, children_map, indent + 1) for c in children)

    if schema:
        # Environment tag: embed children between \begin and \end
        td = _tag_data(box)
        env = ENV_NAME.get(tag, tag)
        attrs = _env_attrs(tag, td, box)
        attr_str = f"[{attrs}]" if attrs else ""
        return f"{sp}\\begin{{{env}}}{attr_str}\n\n{child_lines}\n\n{sp}\\end{{{env}}}"
    else:
        # Inline tag: render the tag, then children as sub-content
        try:
            parent_line = _box_to_latex(box, indent)
        except Exception as exc:
            parent_line = f"{sp}% ERROR box {box.id}: {exc}"
        return f"{parent_line}\n{child_lines}"


# Simple lookup for which tags are environments and their env names
TAG_SCHEMAS_ENV = {
    "paragraph", "tabular", "enumerate", "itemize", "formalletter",
    "letter_informal", "notice", "application", "graph", "map",
    "diagram", "flowchart", "prosody_kannada", "prosody_sanskrit",
    "hwscore", "rough", "metadata", "answer", "spread",
}

ENV_NAME = {
    "letter_informal": "letter",
    "formalletter": "formalletter",
    "prosody_kannada": "prosody",
    "prosody_sanskrit": "prosody",
    "hwscore": "hwscore",
    "rough": "rough",
}

def _env_attrs(tag, td, box):
    parts = []
    if tag == "answer":
        if td.get("question_id"): parts.append(f"q={td['question_id']}")
    elif tag in ("prosody_kannada", "prosody_sanskrit"):
        parts.append(f"lang={'kannada' if tag=='prosody_kannada' else 'sanskrit'}")
    elif tag == "graph" and td.get("graph_type"):
        parts.append(f"type={td['graph_type']}")
    elif tag == "map" and td.get("map_type"):
        parts.append(f"type={td['map_type']}")
    elif tag == "diagram" and td.get("diagram_type"):
        parts.append(f"type={td['diagram_type']}")
    return ", ".join(parts)


@app.get("/export/{page_id}", response_class=PlainTextResponse)
def export_page(page_id: int, db: Session = Depends(get_db)):
    page = db.query(models.Page).filter(models.Page.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    boxes = db.query(models.Box).filter(models.Box.page_id == page_id).all()
    boxes_sorted = sorted(boxes, key=_sort_key)

    # Build parent→children map
    from collections import defaultdict
    children_map = defaultdict(list)
    box_ids = {b.id for b in boxes_sorted}
    top_level = []
    for box in boxes_sorted:
        if box.parent_box_id and box.parent_box_id in box_ids:
            children_map[box.parent_box_id].append(box)
        else:
            top_level.append(box)

    chunks = [_render_tree(b, children_map, indent=1) for b in top_level]
    inner = "\n\n".join(chunks)
    return (
        f"\\begin{{page}}{{{page.page_number}}}\n\n"
        f"{inner}\n\n"
        f"\\end{{page}}"
    )
