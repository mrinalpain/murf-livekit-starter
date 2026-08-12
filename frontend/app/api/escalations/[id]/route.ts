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
    const { status, assigned_to, internal_notes } = body;

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (status !== undefined) {
      const validStatuses = ['open', 'in_progress', 'resolved', 'cancelled'];
      const cleanStatus = (status || '').toLowerCase().trim();
      if (!validStatuses.includes(cleanStatus)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
      updates.push('status = ?');
      values.push(cleanStatus);
    }

    if (assigned_to !== undefined) {
      updates.push('assigned_to = ?');
      values.push(String(assigned_to).trim());
    }

    if (internal_notes !== undefined) {
      updates.push('internal_notes = ?');
      values.push(String(internal_notes).trim());
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'At least one field (status, assigned_to, internal_notes) must be provided.' },
        { status: 400 }
      );
    }

    const db = getDbConnection();
    const nowIso = new Date().toISOString();
    updates.push('updated_at = ?');
    values.push(nowIso);

    values.push(id, id);

    const sql = `UPDATE escalations SET ${updates.join(', ')} WHERE reference_id = ? OR id = ?`;
    const stmt = db.prepare(sql);
    const result = stmt.run(...values);

    return NextResponse.json({
      success: true,
      message: `Escalation ${id} updated successfully`,
      changes: result.changes,
    });
  } catch (error) {
    console.error('Failed to update escalation details:', error);
    const msg = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
