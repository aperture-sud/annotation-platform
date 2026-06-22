from database import get_conn

_FIELDS = frozenset({"parent_id", "coordinates", "tag_category", "tag_attributes",
                     "content_text", "reading_order", "confidence"})


def get_boxes(page_name: str) -> list:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM boxes WHERE page_name = %s
        ORDER BY CASE WHEN reading_order IS NULL THEN 1 ELSE 0 END, reading_order, id
    """, (page_name,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def insert_box(page_name: str, data: dict) -> dict:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO boxes (page_name, parent_id, coordinates, tag_category, tag_attributes,
                           content_text, reading_order, confidence)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
    """, (
        page_name,
        data.get("parent_id"),
        data.get("coordinates", "[]"),
        data.get("tag_category"),
        data.get("tag_attributes"),
        data.get("content_text"),
        data.get("reading_order"),
        data.get("confidence"),
    ))
    row = dict(cur.fetchone())
    conn.commit()
    cur.close()
    conn.close()
    return row


def update_box(page_name: str, box_id: int, data: dict) -> dict | None:
    updates = {k: v for k, v in data.items() if k in _FIELDS}
    if not updates:
        return fetch_box(page_name, box_id)
    sets = ", ".join(f"{k} = %s" for k in updates)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        f"UPDATE boxes SET {sets} WHERE id = %s AND page_name = %s RETURNING *",
        (*updates.values(), box_id, page_name),
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return dict(row) if row else None


def fetch_box(page_name: str, box_id: int) -> dict | None:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM boxes WHERE id = %s AND page_name = %s", (box_id, page_name))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return dict(row) if row else None


def remove_box(page_name: str, box_id: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM boxes WHERE id = %s AND page_name = %s", (box_id, page_name))
    conn.commit()
    cur.close()
    conn.close()
