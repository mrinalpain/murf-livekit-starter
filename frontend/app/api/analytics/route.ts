import { NextResponse } from 'next/server';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';

export const revalidate = 0;

function getDbConnection() {
  const dbDir = path.join(process.cwd(), '..', 'backend', 'data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, 'swasthya_sathi.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id TEXT UNIQUE NOT NULL,
      user_id TEXT,
      channel TEXT NOT NULL DEFAULT 'browser',
      language TEXT DEFAULT 'Unknown',
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds INTEGER DEFAULT 0,
      outcome TEXT DEFAULT 'failed',
      outcome_reason TEXT DEFAULT 'unknown',
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

export async function GET() {
  try {
    const db = getDbConnection();

    const totalRow = db.prepare('SELECT COUNT(*) as count FROM calls').get() as
      | { count: number }
      | undefined;
    const totalCalls = totalRow?.count || 0;

    const successRow = db
      .prepare("SELECT COUNT(*) as count FROM calls WHERE outcome = 'success'")
      .get() as { count: number } | undefined;
    const successfulCalls = successRow?.count || 0;

    const failedRow = db
      .prepare("SELECT COUNT(*) as count FROM calls WHERE outcome = 'failed'")
      .get() as { count: number } | undefined;
    const failedCalls = failedRow?.count || 0;

    const successRate =
      totalCalls > 0 ? Number(((successfulCalls / totalCalls) * 100).toFixed(1)) : 0;

    const recentCalls = db
      .prepare(
        `
      SELECT id, call_id, user_id, channel, language, started_at, ended_at, duration_seconds, outcome, outcome_reason, created_at
      FROM calls
      ORDER BY id DESC
      LIMIT 100
    `
      )
      .all();

    return NextResponse.json({
      success: true,
      metrics: {
        total_calls: totalCalls,
        successful_calls: successfulCalls,
        failed_calls: failedCalls,
        success_rate: successRate,
      },
      recent_calls: recentCalls,
    });
  } catch (error) {
    console.error('Failed to fetch call analytics:', error);
    const msg = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const clearAll = searchParams.get('clear_all') === 'true';

    let bodyId: string | number | undefined;
    let bodyClearAll = false;
    try {
      const body = await req.json();
      bodyId = body?.id;
      bodyClearAll = body?.clear_all === true;
    } catch {
      // Body optional
    }

    const db = getDbConnection();

    if (clearAll || bodyClearAll) {
      db.prepare('DELETE FROM calls').run();
      return NextResponse.json({ success: true, message: 'All call records cleared.' });
    }

    const targetId = id || bodyId;
    if (!targetId) {
      return NextResponse.json(
        { error: 'Call id or clear_all parameter required' },
        { status: 400 }
      );
    }

    db.prepare('DELETE FROM calls WHERE id = ? OR call_id = ?').run(
      String(targetId),
      String(targetId)
    );
    return NextResponse.json({ success: true, message: `Deleted call record ${targetId}.` });
  } catch (error) {
    console.error('Failed to delete call record:', error);
    const msg = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
