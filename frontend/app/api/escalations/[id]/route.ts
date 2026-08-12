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
  return new DatabaseSync(dbPath);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;
    const body = await req.json();
    const { status } = body;

    const validStatuses = ['open', 'in_progress', 'resolved', 'cancelled'];
    const cleanStatus = (status || '').toLowerCase().trim();

    if (!cleanStatus || !validStatuses.includes(cleanStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const db = getDbConnection();
    const nowIso = new Date().toISOString();

    const stmt = db.prepare(`
      UPDATE escalations SET status = ?, updated_at = ? WHERE reference_id = ? OR id = ?
    `);
    const result = stmt.run(cleanStatus, nowIso, id, id);

    return NextResponse.json({
      success: true,
      message: `Escalation ${id} status updated to ${cleanStatus}`,
      changes: result.changes,
    });
  } catch (error) {
    console.error('Failed to update escalation status:', error);
    const msg = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
