import os
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()


def get_conn():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", 5432),
        dbname=os.getenv("DB_NAME", "annotation_platform"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            SERIAL PRIMARY KEY,
            username      TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role          TEXT NOT NULL CHECK (role IN ('pictaker','annotator','manager','admin')),
            created_at    TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS folders (
            id      SERIAL PRIMARY KEY,
            medium  TEXT NOT NULL,
            cls     TEXT NOT NULL,
            subject TEXT NOT NULL,
            UNIQUE(medium, cls, subject)
        );
        CREATE TABLE IF NOT EXISTS documents (
            id          SERIAL PRIMARY KEY,
            doc_name    TEXT UNIQUE NOT NULL,
            folder_id   INTEGER NOT NULL,
            uploaded_by TEXT,
            uploaded_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT documents_folder_id_fk FOREIGN KEY (folder_id) REFERENCES folders(id)
        );
        CREATE TABLE IF NOT EXISTS pages (
            page_name              TEXT PRIMARY KEY,
            doc_id                 INTEGER,
            page_number            INTEGER NOT NULL DEFAULT 1,
            image_path             TEXT NOT NULL DEFAULT '',
            raw_image_path         TEXT NOT NULL DEFAULT '',
            crop_corners           TEXT,
            width                  INTEGER,
            height                 INTEGER,
            area                   TEXT NOT NULL DEFAULT 'pending_approval',
            assigned_to            TEXT,
            review_note            TEXT,
            reviewed_by            TEXT,
            reviewed_at            TIMESTAMP,
            upload_approval_status TEXT NOT NULL DEFAULT 'pending',
            upload_approval_note   TEXT,
            CONSTRAINT pages_doc_id_fk FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS boxes (
            id             SERIAL PRIMARY KEY,
            page_name      TEXT NOT NULL,
            parent_id      INTEGER,
            coordinates    TEXT NOT NULL DEFAULT '[]',
            tag_category   TEXT,
            tag_attributes TEXT,
            content_text   TEXT,
            reading_order  INTEGER,
            confidence     TEXT,
            created_at     TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS annotation_requests (
            id           SERIAL PRIMARY KEY,
            requested_by TEXT NOT NULL,
            medium       TEXT NOT NULL,
            cls          TEXT NOT NULL,
            subject      TEXT NOT NULL,
            folder_id    INTEGER,
            quantity     INTEGER NOT NULL CHECK (quantity > 0),
            status       TEXT NOT NULL DEFAULT 'pending',
            fulfilled    INTEGER NOT NULL DEFAULT 0,
            created_at   TIMESTAMP DEFAULT NOW(),
            reviewed_by  TEXT,
            reviewed_at  TIMESTAMP,
            CONSTRAINT annotation_requests_folder_id_fk FOREIGN KEY (folder_id) REFERENCES folders(id)
        );
    """)

    # Add new columns to existing installs
    for col_def in [
        "doc_id                 INTEGER",
        "page_number            INTEGER NOT NULL DEFAULT 1",
        "image_path             TEXT NOT NULL DEFAULT ''",
        "raw_image_path         TEXT NOT NULL DEFAULT ''",
        "crop_corners           TEXT",
        "width                  INTEGER",
        "height                 INTEGER",
        "assigned_to            TEXT",
        "review_note            TEXT",
        "reviewed_by            TEXT",
        "reviewed_at            TIMESTAMP",
        "upload_approval_status TEXT NOT NULL DEFAULT 'pending'",
        "upload_approval_note   TEXT",
    ]:
        cur.execute(f"ALTER TABLE pages ADD COLUMN IF NOT EXISTS {col_def}")

    cur.execute("ALTER TABLE annotation_requests ADD COLUMN IF NOT EXISTS folder_id INTEGER")

    # Populate folders from annotation_requests (always safe — those columns are kept)
    cur.execute("""
        INSERT INTO folders (medium, cls, subject)
        SELECT DISTINCT medium, cls, subject FROM annotation_requests
        WHERE medium IS NOT NULL AND cls IS NOT NULL AND subject IS NOT NULL
        ON CONFLICT DO NOTHING;
    """)
    cur.execute("""
        UPDATE annotation_requests ar SET folder_id = f.id
        FROM folders f
        WHERE ar.folder_id IS NULL
          AND ar.medium = f.medium AND ar.cls = f.cls AND ar.subject = f.subject;
    """)

    # Migrate pages → folders + documents (only if old columns still exist)
    cur.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'pages' AND column_name = 'doc_name'
            ) THEN
                INSERT INTO folders (medium, cls, subject)
                SELECT DISTINCT medium, cls, subject FROM pages
                WHERE medium IS NOT NULL AND cls IS NOT NULL AND subject IS NOT NULL
                ON CONFLICT DO NOTHING;

                INSERT INTO documents (doc_name, folder_id, uploaded_by, uploaded_at)
                SELECT p.doc_name, f.id, MIN(p.uploaded_by), MIN(p.uploaded_at)
                FROM pages p
                JOIN folders f
                  ON f.medium = p.medium AND f.cls = p.cls AND f.subject = p.subject
                WHERE p.doc_name IS NOT NULL AND p.doc_name != ''
                GROUP BY p.doc_name, f.id
                ON CONFLICT (doc_name) DO NOTHING;

                UPDATE pages p SET doc_id = d.id
                FROM documents d
                WHERE p.doc_id IS NULL AND p.doc_name = d.doc_name;
            END IF;
        END $$;
    """)

    # Drop the now-redundant columns from pages
    cur.execute("""
        ALTER TABLE pages
            DROP COLUMN IF EXISTS doc_name,
            DROP COLUMN IF EXISTS medium,
            DROP COLUMN IF EXISTS cls,
            DROP COLUMN IF EXISTS subject,
            DROP COLUMN IF EXISTS uploaded_by,
            DROP COLUMN IF EXISTS uploaded_at;
    """)

    # FK constraints (named so the DO block can skip them if already present)
    cur.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pages_doc_id_fk') THEN
                ALTER TABLE pages ADD CONSTRAINT pages_doc_id_fk
                    FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_folder_id_fk') THEN
                ALTER TABLE documents ADD CONSTRAINT documents_folder_id_fk
                    FOREIGN KEY (folder_id) REFERENCES folders(id);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'annotation_requests_folder_id_fk') THEN
                ALTER TABLE annotation_requests ADD CONSTRAINT annotation_requests_folder_id_fk
                    FOREIGN KEY (folder_id) REFERENCES folders(id);
            END IF;
        END $$;
    """)

    # Indexes
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pages_doc_id ON pages(doc_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pages_area ON pages(area)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pages_assigned_to ON pages(assigned_to)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON documents(folder_id)")

    # Ensure FK with ON DELETE CASCADE + ON UPDATE CASCADE for boxes
    cur.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'boxes_page_name_fk'
            ) THEN
                ALTER TABLE boxes DROP CONSTRAINT IF EXISTS boxes_page_name_fkey;
                ALTER TABLE boxes ADD CONSTRAINT boxes_page_name_fk
                    FOREIGN KEY (page_name) REFERENCES pages(page_name)
                    ON DELETE CASCADE ON UPDATE CASCADE;
                ALTER TABLE boxes DROP CONSTRAINT IF EXISTS boxes_parent_id_fkey;
                ALTER TABLE boxes ADD CONSTRAINT boxes_parent_id_fk
                    FOREIGN KEY (parent_id) REFERENCES boxes(id)
                    ON DELETE CASCADE;
            END IF;
        END $$;
    """)

    conn.commit()
    cur.close()
    conn.close()
