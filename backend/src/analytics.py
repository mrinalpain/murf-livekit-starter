import logging
from datetime import datetime, timezone
from typing import Any, Optional

from db import get_db_connection

logger = logging.getLogger("agent.analytics")


def start_call(
    call_id: str,
    user_id: Optional[str] = None,
    channel: str = "browser",
    language: str = "Unknown",
) -> bool:
    """Record the start of a call in the calls table.

    Uses parameterized queries and handles exceptions gracefully without crashing.
    """
    if not call_id:
        return False

    now_iso = datetime.now(timezone.utc).isoformat()
    clean_channel = (channel or "browser").lower().strip()
    if clean_channel not in ("browser", "sip"):
        clean_channel = "browser"

    clean_language = (language or "Unknown").strip()

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO calls (
                call_id, user_id, channel, language, started_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(call_id) DO UPDATE SET
                user_id = COALESCE(excluded.user_id, calls.user_id),
                channel = excluded.channel,
                language = COALESCE(excluded.language, calls.language);
            """,
            (
                call_id,
                user_id or "caller_default",
                clean_channel,
                clean_language,
                now_iso,
                now_iso,
            ),
        )
        conn.commit()
        conn.close()
        logger.info(
            f"Analytics: started call call_id={call_id} channel={clean_channel}"
        )
        return True
    except Exception as e:
        logger.error(f"Analytics error in start_call for call_id={call_id}: {e}")
        return False


def _safe_parse_dt(iso_str: Optional[str]) -> Optional[datetime]:
    """Safely parse ISO datetime string into timezone-aware datetime."""
    if not iso_str:
        return None
    try:
        clean_str = iso_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def end_call(
    call_id: str,
    outcome: str,
    outcome_reason: str = "unknown",
    ended_at: Optional[str] = None,
    duration_seconds: Optional[int] = None,
    language: Optional[str] = None,
) -> bool:
    """Record the completion and outcome of a call.

    Valid outcomes: 'success', 'failed'.
    """
    if not call_id:
        return False

    now_iso = datetime.now(timezone.utc).isoformat()
    end_iso = ended_at or now_iso

    clean_outcome = (outcome or "failed").lower().strip()
    if clean_outcome not in ("success", "failed"):
        clean_outcome = "failed"

    clean_reason = (outcome_reason or "unknown").lower().strip()

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Retrieve started_at to compute real duration using epoch timestamps
        cursor.execute("SELECT started_at FROM calls WHERE call_id = ?;", (call_id,))
        row = cursor.fetchone()

        calc_duration = duration_seconds
        if calc_duration is None or calc_duration <= 0:
            if row and row["started_at"]:
                start_dt = _safe_parse_dt(row["started_at"])
                end_dt = _safe_parse_dt(end_iso)
                if start_dt and end_dt:
                    calc_duration = max(
                        0, int(end_dt.timestamp() - start_dt.timestamp())
                    )
                else:
                    calc_duration = 0
            else:
                calc_duration = 0

        updates = [
            "ended_at = ?",
            "duration_seconds = ?",
            "outcome = ?",
            "outcome_reason = ?",
        ]
        params = [end_iso, calc_duration, clean_outcome, clean_reason]

        if language and language.strip() and language != "Unknown":
            updates.append("language = ?")
            params.append(language.strip())

        params.append(call_id)

        query = f"UPDATE calls SET {', '.join(updates)} WHERE call_id = ?;"
        cursor.execute(query, tuple(params))
        conn.commit()

        # If no row was updated, insert a fallback record
        if cursor.rowcount == 0:
            cursor.execute(
                """
                INSERT INTO calls (
                    call_id, user_id, channel, language, started_at, ended_at, duration_seconds, outcome, outcome_reason, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    call_id,
                    "caller_default",
                    "browser",
                    language or "Unknown",
                    now_iso,
                    end_iso,
                    calc_duration or 0,
                    clean_outcome,
                    clean_reason,
                    now_iso,
                ),
            )
            conn.commit()

        conn.close()
        logger.info(
            f"Analytics: ended call call_id={call_id} outcome={clean_outcome} reason={clean_reason} duration={calc_duration}s"
        )
        return True
    except Exception as e:
        logger.error(f"Analytics error in end_call for call_id={call_id}: {e}")
        return False


def get_call_metrics() -> dict[str, Any]:
    """Retrieve aggregated metrics for all recorded calls."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) AS total FROM calls;")
        total_calls = cursor.fetchone()["total"] or 0

        cursor.execute(
            "SELECT COUNT(*) AS success_count FROM calls WHERE outcome = 'success';"
        )
        successful_calls = cursor.fetchone()["success_count"] or 0

        cursor.execute(
            "SELECT COUNT(*) AS failed_count FROM calls WHERE outcome = 'failed';"
        )
        failed_calls = cursor.fetchone()["failed_count"] or 0

        conn.close()

        success_rate = (
            round((successful_calls / total_calls) * 100, 1) if total_calls > 0 else 0.0
        )

        return {
            "total_calls": total_calls,
            "successful_calls": successful_calls,
            "failed_calls": failed_calls,
            "success_rate": success_rate,
        }
    except Exception as e:
        logger.error(f"Analytics error in get_call_metrics: {e}")
        return {
            "total_calls": 0,
            "successful_calls": 0,
            "failed_calls": 0,
            "success_rate": 0.0,
        }


def get_recent_calls(limit: int = 50) -> list[dict[str, Any]]:
    """Retrieve recent call records without sensitive healthcare data."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, call_id, user_id, channel, language, started_at, ended_at, duration_seconds, outcome, outcome_reason, created_at
            FROM calls
            ORDER BY id DESC
            LIMIT ?;
            """,
            (limit,),
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Analytics error in get_recent_calls: {e}")
        return []


def delete_call_record(call_id_or_id: Any) -> bool:
    """Delete a single call record by integer database ID or string call_id."""
    if not call_id_or_id:
        return False
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM calls WHERE id = ? OR call_id = ?;",
            (str(call_id_or_id), str(call_id_or_id)),
        )
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        logger.info(f"Analytics: deleted call record key={call_id_or_id}")
        return success
    except Exception as e:
        logger.error(f"Analytics error deleting call record key={call_id_or_id}: {e}")
        return False


def clear_all_call_records() -> bool:
    """Clear all call records from the analytics database."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM calls;")
        conn.commit()
        conn.close()
        logger.info("Analytics: cleared all call records.")
        return True
    except Exception as e:
        logger.error(f"Analytics error clearing all call records: {e}")
        return False
