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
        CREATE TABLE IF NOT EXISTS pages (
            page_name   TEXT PRIMARY KEY,
            doc_name    TEXT NOT NULL DEFAULT '',
            page_number INTEGER NOT NULL DEFAULT 1,
            medium      TEXT NOT NULL DEFAULT 'english_medium',
            cls         TEXT NOT NULL DEFAULT 'class_8',
            subject     TEXT NOT NULL DEFAULT 'english',
            area        TEXT NOT NULL DEFAULT 'pending_approval',
            uploaded_at TIMESTAMP DEFAULT NOW(),
            uploaded_by TEXT,
            image_path  TEXT NOT NULL DEFAULT '',
            width       INTEGER,
            height      INTEGER
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
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS annotation_requests (
            id           SERIAL PRIMARY KEY,
            requested_by TEXT NOT NULL,
            medium       TEXT NOT NULL,
            cls          TEXT NOT NULL,
            subject      TEXT NOT NULL,
            quantity     INTEGER NOT NULL CHECK (quantity > 0),
            status       TEXT NOT NULL DEFAULT 'pending',
            fulfilled    INTEGER NOT NULL DEFAULT 0,
            created_at   TIMESTAMP DEFAULT NOW(),
            reviewed_by  TEXT,
            reviewed_at  TIMESTAMP
        );
    """)

    # Add new columns to existing installs
    for col_def in [
        "uploaded_by TEXT",
        "doc_name    TEXT NOT NULL DEFAULT ''",
        "page_number INTEGER NOT NULL DEFAULT 1",
        "image_path  TEXT NOT NULL DEFAULT ''",
        "width       INTEGER",
        "height      INTEGER",
        "medium      TEXT NOT NULL DEFAULT 'english_medium'",
        "cls         TEXT NOT NULL DEFAULT 'class_8'",
        "subject     TEXT NOT NULL DEFAULT 'english'",
        "assigned_to TEXT",
        "review_note TEXT",
        "reviewed_by TEXT",
        "reviewed_at TIMESTAMP",
    ]:
        cur.execute(f"ALTER TABLE pages ADD COLUMN IF NOT EXISTS {col_def}")

    # Ensure FK with ON DELETE CASCADE + ON UPDATE CASCADE
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
