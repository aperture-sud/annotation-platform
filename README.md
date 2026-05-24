# Answer Script Annotation Platform

OCR training data collection tool for handwritten exam answer sheets.

## Setup

### Backend (Python / FastAPI)

```bash
cd annotation-platform/backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Runs on **http://localhost:8000**. The SQLite database (`annotation.db`) and uploaded images (`uploads/`) are created automatically.

### Frontend (React / Vite)

```bash
cd annotation-platform/frontend
npm install
npm run dev
```

Runs on **http://localhost:5173**.

---

## Usage

### Home page (`/`)
- **Scan Answer Sheet** — opens the scanner for camera capture or gallery upload with crop/rotate/brightness tools.
- **Upload Image** — direct file upload (jpg, png, multi-page supported).
- Each uploaded document is shown as a card. Click a page badge to open the annotation workspace.

### Annotation workspace (`/annotate/:pageId`)
- **Draw** a bounding box by clicking and dragging on the image.
- **Click** an existing box to select it (highlight + resize handles).
- **Delete / Backspace** removes the selected box.
- Right panel shows a tag picker when a new box is drawn; then a form with tag-specific fields.
- **Export** downloads a plain-text markup file of all annotated boxes sorted by reading order.

### Scanner (`/scan`)
- **Open Camera** uses the device rear camera (file picker on desktop).
- **Upload from Gallery** for existing photos.
- Edit controls: crop with aspect presets (Free / A4 / Square), rotate ±90° and fine slider, brightness/contrast sliders, "Doc mode" preset (optimised for handwriting clarity).
- **+ Add Page** saves current edit and returns to capture for the next page.
- **Done** processes and uploads all pages, then navigates to the first page annotation.
- Captured page thumbnails appear at the bottom — tap to re-edit any page.

---

## Architecture

```
annotation-platform/
├── backend/
│   ├── main.py          # FastAPI app — all endpoints
│   ├── database.py      # SQLAlchemy engine + session
│   ├── models.py        # Document / Page / Box ORM models
│   ├── schemas.py       # Pydantic request/response schemas
│   ├── requirements.txt
│   └── uploads/         # Saved image files (auto-created)
└── frontend/
    └── src/
        ├── pages/
        │   ├── HomePage.jsx      # Document list + upload
        │   ├── AnnotatePage.jsx  # Split layout annotation UI
        │   └── ScannerPage.jsx   # Camera + crop + filter UI
        ├── components/
        │   ├── ImageCanvas.jsx   # react-konva canvas with draw/select
        │   ├── TagDropdown.jsx   # Grouped tag type picker
        │   ├── TagForm.jsx       # Dynamic form from schema
        │   └── BoxList.jsx       # Sidebar box list
        ├── api/client.js         # Axios API wrappers
        └── tags/tagSchemas.js    # Tag definitions + field schemas
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/upload` | Upload one or more image files → `{document_id, page_ids}` |
| GET | `/documents` | List all documents |
| GET | `/documents/{id}` | Document + pages |
| GET | `/pages/{id}` | Page metadata |
| GET | `/pages/{id}/boxes` | All boxes for a page |
| POST | `/boxes` | Create box |
| PUT | `/boxes/{id}` | Update box tag data |
| DELETE | `/boxes/{id}` | Delete box |
| GET | `/export/{page_id}` | Export markup as plain text |

## Box coordinate system

All box coordinates (`x`, `y`, `width`, `height`) are stored as **fractions of the image dimensions** (0.0 – 1.0). This makes them resolution-independent: the same annotation works regardless of the zoom level or display size.

## Export format

```
[text style="handwritten" lang="english" confidence="high" order="1"]
The quick brown fox jumped over the lazy dog.
[/text]

[math_block confidence="medium" order="2"]
\int_0^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
[/math_block]

[teacher_mark mark_type="tick" ink_colour="red" order="3"][/teacher_mark]
```
