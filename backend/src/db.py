import logging
import os
import random
import sqlite3
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("agent.db")

DB_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"
)
DB_PATH = os.path.join(DB_DIR, "swasthya_sathi.db")


def get_db_connection() -> sqlite3.Connection:
    """Create and return a database connection."""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Initialize the SQLite database and ensure tables exist."""
    try:
        os.makedirs(DB_DIR, exist_ok=True)
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                name TEXT,
                language_preference TEXT,
                age_band TEXT,
                last_triage_outcome TEXT,
                last_interaction TEXT,
                created_at TEXT,
                updated_at TEXT
            );
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS follow_ups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                phone_number TEXT,
                reason TEXT,
                scheduled_at TEXT,
                status TEXT,
                consent INTEGER,
                created_at TEXT,
                updated_at TEXT
            );
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS escalations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reference_id TEXT UNIQUE NOT NULL,
                user_id TEXT NOT NULL,
                summary TEXT NOT NULL,
                urgency TEXT NOT NULL,
                language TEXT,
                preferred_follow_up TEXT,
                status TEXT NOT NULL DEFAULT 'open',
                assigned_to TEXT,
                internal_notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        # Migration for existing databases
        for col_def in ["assigned_to TEXT", "internal_notes TEXT"]:
            try:
                cursor.execute(f"ALTER TABLE escalations ADD COLUMN {col_def};")
            except sqlite3.OperationalError:
                logger.debug(f"Column {col_def} already exists in escalations table.")
        conn.commit()
        conn.close()
        logger.info(f"Database initialized successfully at {DB_PATH}")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")


def get_user_memory(user_id: str) -> Optional[dict[str, Any]]:
    """
    Retrieve stored memory for a given user_id using parameterized queries.
    Returns None if no record exists or if an error occurs.
    """
    if not user_id:
        return None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT user_id, name, language_preference, age_band, last_triage_outcome, last_interaction, created_at, updated_at
            FROM users
            WHERE user_id = ?;
            """,
            (user_id,),
        )
        row = cursor.fetchone()
        conn.close()

        if row:
            return {
                "user_id": row["user_id"],
                "name": row["name"],
                "language_preference": row["language_preference"],
                "age_band": row["age_band"],
                "last_triage_outcome": row["last_triage_outcome"],
                "last_interaction": row["last_interaction"],
            }
        return None
    except Exception as e:
        logger.error(f"Memory lookup failed for user_id={user_id}: {e}")
        return None


def save_user_memory(
    user_id: str,
    name: Optional[str] = None,
    language_preference: Optional[str] = None,
    age_band: Optional[str] = None,
    last_triage_outcome: Optional[str] = None,
) -> bool:
    """
    Save or update caller information using an upsert parameterized SQL query.
    Updates last_interaction and updated_at automatically.
    """
    if not user_id:
        return False

    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        query = """
        INSERT INTO users (
            user_id, name, language_preference, age_band, last_triage_outcome, last_interaction, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            name = COALESCE(excluded.name, users.name),
            language_preference = COALESCE(excluded.language_preference, users.language_preference),
            age_band = COALESCE(excluded.age_band, users.age_band),
            last_triage_outcome = COALESCE(excluded.last_triage_outcome, users.last_triage_outcome),
            last_interaction = excluded.last_interaction,
            updated_at = excluded.updated_at;
        """

        cursor.execute(
            query,
            (
                user_id,
                name,
                language_preference,
                age_band,
                last_triage_outcome,
                now_iso,
                now_iso,
                now_iso,
            ),
        )
        conn.commit()
        conn.close()
        logger.info(f"Memory saved successfully for user_id={user_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to save memory for user_id={user_id}: {e}")
        return False


def create_followup(
    user_id: str,
    phone_number: Optional[str] = None,
    reason: Optional[str] = None,
    scheduled_at: Optional[str] = None,
    consent: bool = True,
) -> Optional[int]:
    """Create a new health follow-up record in SQLite."""
    if not user_id or not consent:
        return None

    now_iso = datetime.now(timezone.utc).isoformat()
    scheduled_val = scheduled_at or now_iso
    reason_val = reason or "Follow-up after health consultation"

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO follow_ups (
                user_id, phone_number, reason, scheduled_at, status, consent, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                user_id,
                phone_number,
                reason_val,
                scheduled_val,
                "scheduled",
                1 if consent else 0,
                now_iso,
                now_iso,
            ),
        )
        followup_id = cursor.lastrowid
        conn.commit()
        conn.close()
        logger.info(f"Created follow-up id={followup_id} for user_id={user_id}")
        return followup_id
    except Exception as e:
        logger.error(f"Failed to create follow-up for user_id={user_id}: {e}")
        return None


def get_followup(followup_id: int) -> Optional[dict[str, Any]]:
    """Retrieve a single follow-up record by ID."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, user_id, phone_number, reason, scheduled_at, status, consent, created_at, updated_at FROM follow_ups WHERE id = ?;",
            (followup_id,),
        )
        row = cursor.fetchone()
        conn.close()
        if row:
            return dict(row)
        return None
    except Exception as e:
        logger.error(f"Failed to fetch follow-up id={followup_id}: {e}")
        return None


def get_pending_followups() -> list[dict[str, Any]]:
    """Retrieve all pending/scheduled follow-ups where consent is granted."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, user_id, phone_number, reason, scheduled_at, status, consent, created_at, updated_at FROM follow_ups WHERE status = 'scheduled' AND consent = 1 ORDER BY scheduled_at ASC;"
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Failed to fetch pending follow-ups: {e}")
        return []


def update_followup_status(followup_id: int, status: str) -> bool:
    """Update the status of a follow-up record."""
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE follow_ups SET status = ?, updated_at = ? WHERE id = ?;",
            (status, now_iso, followup_id),
        )
        conn.commit()
        conn.close()
        logger.info(f"Updated follow-up id={followup_id} status to '{status}'")
        return True
    except Exception as e:
        logger.error(f"Failed to update follow-up id={followup_id} status: {e}")
        return False


def cancel_user_followups(user_id: str) -> bool:
    """Cancel all pending follow-ups for a user (opt-out)."""
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE follow_ups SET status = 'cancelled', consent = 0, updated_at = ? WHERE user_id = ? AND status IN ('scheduled', 'calling');",
            (now_iso, user_id),
        )
        updated_count = cursor.rowcount
        conn.commit()
        conn.close()
        logger.info(f"Cancelled {updated_count} follow-ups for user_id={user_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to cancel follow-ups for user_id={user_id}: {e}")
        return False


def generate_unique_reference_id(conn: sqlite3.Connection) -> str:
    """Generate a unique reference ID in the format SS-XXXX."""
    cursor = conn.cursor()
    for _ in range(100):
        ref_num = random.randint(1000, 9999)
        ref_id = f"SS-{ref_num}"
        cursor.execute("SELECT 1 FROM escalations WHERE reference_id = ?;", (ref_id,))
        if not cursor.fetchone():
            return ref_id
    # Fallback to timestamp-based if collisions occur
    return f"SS-{int(datetime.now().timestamp()) % 10000:04d}"


def create_escalation_record(
    user_id: str,
    summary: str,
    urgency: str = "medium",
    language: Optional[str] = None,
    preferred_follow_up: Optional[str] = None,
) -> dict[str, Any]:
    """Create a human escalation record in SQLite and return structured response."""
    if not user_id or not summary or not summary.strip():
        return {
            "success": False,
            "message": "Unable to create the escalation request.",
        }

    valid_urgencies = {"low", "medium", "high", "emergency"}
    clean_urgency = (urgency or "medium").lower().strip()
    if clean_urgency not in valid_urgencies:
        clean_urgency = "medium"

    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        conn = get_db_connection()
        ref_id = generate_unique_reference_id(conn)
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO escalations (
                reference_id, user_id, summary, urgency, language, preferred_follow_up, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                ref_id,
                user_id,
                summary.strip(),
                clean_urgency,
                language or "English",
                preferred_follow_up or "Phone",
                "open",
                now_iso,
                now_iso,
            ),
        )
        conn.commit()
        conn.close()
        logger.info(
            f"Created escalation request ref={ref_id} user_id={user_id} urgency={clean_urgency}"
        )
        return {
            "success": True,
            "reference_id": ref_id,
            "urgency": clean_urgency,
            "status": "open",
        }
    except Exception as e:
        logger.error(f"Failed to create escalation request: {e}")
        return {
            "success": False,
            "message": "Unable to create the escalation request.",
        }


def get_all_escalations() -> list[dict[str, Any]]:
    """Retrieve all human escalation requests from SQLite."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, reference_id, user_id, summary, urgency, language, preferred_follow_up, status, assigned_to, internal_notes, created_at, updated_at FROM escalations ORDER BY id DESC;"
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Failed to fetch escalations: {e}")
        return []


def update_escalation_details_db(
    ref_id_or_id: str,
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    internal_notes: Optional[str] = None,
) -> bool:
    """Update details (status, assigned staff, notes) of an escalation request."""
    now_iso = datetime.now(timezone.utc).isoformat()
    updates = []
    params = []

    if status is not None:
        valid_statuses = {"open", "in_progress", "resolved", "cancelled"}
        clean_status = (status or "open").lower().strip()
        if clean_status in valid_statuses:
            updates.append("status = ?")
            params.append(clean_status)

    if assigned_to is not None:
        updates.append("assigned_to = ?")
        params.append(assigned_to.strip())

    if internal_notes is not None:
        updates.append("internal_notes = ?")
        params.append(internal_notes.strip())

    if not updates:
        return False

    updates.append("updated_at = ?")
    params.append(now_iso)

    params.extend([str(ref_id_or_id), str(ref_id_or_id)])

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        query = f"UPDATE escalations SET {', '.join(updates)} WHERE reference_id = ? OR id = ?;"
        cursor.execute(query, tuple(params))
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success
    except Exception as e:
        logger.error(f"Failed to update escalation details: {e}")
        return False


def update_escalation_status_db(ref_id_or_id: str, status: str) -> bool:
    """Backwards compatible helper to update status."""
    return update_escalation_details_db(ref_id_or_id, status=status)
