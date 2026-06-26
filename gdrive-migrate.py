import io
import os
import sys
from pathlib import Path

os.environ["GDRIVE_ROOT_FOLDER_ID"] = "1pxkUFypBcfZDV59SK_nTg42YaRqhA4J0"

sys.path.insert(0, str(Path(__file__).parent / "backend"))
import gdrive

STORAGE = Path(__file__).parent / "storage"
folders = ["uploads", "raw"]

files = []
for folder in folders:
    for f in (STORAGE / folder).rglob("*"):
        if f.is_file() and f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
            rel = f.relative_to(STORAGE)
            files.append((f, str(rel)))

total = len(files)
print(f"Found {total} files locally\n")

service = gdrive._get_service()
if not service:
    print("ERROR: Could not connect to Google Drive")
    sys.exit(1)

def file_exists_on_drive(service, filename, parent_id):
    q = (
        f"name='{filename}' and '{parent_id}' in parents"
        " and trashed=false"
    )
    res = service.files().list(q=q, fields="files(id)", pageSize=1).execute()
    return len(res.get("files", [])) > 0

uploaded = 0
skipped = 0
failed = 0

for i, (path, rel) in enumerate(files, 1):
    try:
        parts = Path(rel).parts
        parent_id = os.environ["GDRIVE_ROOT_FOLDER_ID"]
        for folder_name in parts[:-1]:
            parent_id = gdrive._get_or_create_folder(service, folder_name, parent_id)

        filename = parts[-1]
        if file_exists_on_drive(service, filename, parent_id):
            print(f"[{i}/{total}] SKIP {rel}")
            skipped += 1
            continue

        from googleapiclient.http import MediaIoBaseUpload
        ext = Path(filename).suffix.lower()
        mime = "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "image/jpeg"
        media = MediaIoBaseUpload(io.BytesIO(path.read_bytes()), mimetype=mime, resumable=False)
        service.files().create(
            body={"name": filename, "parents": [parent_id]},
            media_body=media,
            fields="id",
        ).execute()
        print(f"[{i}/{total}] UP {rel}")
        uploaded += 1
    except Exception as e:
        print(f"[{i}/{total}] FAIL {rel}: {e}")
        failed += 1

print(f"\nDone. Uploaded: {uploaded}  Skipped: {skipped}  Failed: {failed}")
