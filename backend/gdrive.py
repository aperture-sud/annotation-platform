import io
import json
import logging
import os
from pathlib import Path
from threading import Thread

logger = logging.getLogger(__name__)

REPO_ROOT   = Path(__file__).parent.parent
_TOKEN_FILE = REPO_ROOT / "gdrive-token.json"
_ROOT_ID    = os.getenv("GDRIVE_ROOT_FOLDER_ID", "")

_service = None
_folder_cache: dict[str, str] = {}


def _get_service():
    global _service
    if _service is not None:
        return _service
    if not _TOKEN_FILE.exists() or not _ROOT_ID:
        return None
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        with open(_TOKEN_FILE) as f:
            data = json.load(f)

        creds = Credentials(
            token=data["token"],
            refresh_token=data["refresh_token"],
            token_uri=data["token_uri"],
            client_id=data["client_id"],
            client_secret=data["client_secret"],
            scopes=data.get("scopes"),
        )
        _service = build("drive", "v3", credentials=creds, cache_discovery=False)
    except Exception:
        logger.exception("Failed to initialise Google Drive client")
        _service = None
    return _service


def _get_or_create_folder(service, name: str, parent_id: str) -> str:
    key = f"{parent_id}/{name}"
    if key in _folder_cache:
        return _folder_cache[key]

    q = (
        f"name='{name}' and '{parent_id}' in parents"
        " and mimeType='application/vnd.google-apps.folder'"
        " and trashed=false"
    )
    res = service.files().list(q=q, fields="files(id)", pageSize=1).execute()
    files = res.get("files", [])
    if files:
        folder_id = files[0]["id"]
    else:
        folder_id = service.files().create(
            body={
                "name": name,
                "mimeType": "application/vnd.google-apps.folder",
                "parents": [parent_id],
            },
            fields="id",
        ).execute()["id"]

    _folder_cache[key] = folder_id
    return folder_id


def _do_upload(file_bytes: bytes, relative_path: str) -> None:
    service = _get_service()
    if not service:
        return

    from googleapiclient.http import MediaIoBaseUpload

    parts = Path(relative_path).parts
    parent_id = _ROOT_ID
    for folder_name in parts[:-1]:
        parent_id = _get_or_create_folder(service, folder_name, parent_id)

    filename = parts[-1]
    ext = Path(filename).suffix.lower()
    mime = "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "image/jpeg"

    media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime, resumable=False)
    service.files().create(
        body={"name": filename, "parents": [parent_id]},
        media_body=media,
        fields="id",
    ).execute()


def _safe_upload(file_bytes: bytes, relative_path: str) -> None:
    try:
        _do_upload(file_bytes, relative_path)
    except Exception:
        logger.exception("Google Drive upload failed for %s", relative_path)


def upload_async(file_bytes: bytes, relative_path: str) -> None:
    """Fire-and-forget upload to Drive. Silently skips if not configured."""
    if not _TOKEN_FILE.exists() or not _ROOT_ID:
        return
    Thread(target=_safe_upload, args=(file_bytes, relative_path), daemon=True).start()
