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
  `);
  try {
    db.exec(`ALTER TABLE escalations ADD COLUMN assigned_to TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE escalations ADD COLUMN internal_notes TEXT;`);
  } catch {}
  return db;
}

export async function GET() {
  try {
    const db = getDbConnection();
    const rows = db.prepare('SELECT * FROM escalations ORDER BY id DESC').all();
    return NextResponse.json({ success: true, escalations: rows });
  } catch (error) {
    console.error('Failed to fetch escalations:', error);
    const msg = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_id, summary, urgency, language, preferred_follow_up } = body;
    if (!user_id || !summary) {
      return NextResponse.json({ error: 'user_id and summary required' }, { status: 400 });
    }

    const db = getDbConnection();
    const refNum = Math.floor(1000 + Math.random() * 9000);
    const refId = `SS-${refNum}`;
    const nowIso = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO escalations (
        reference_id, user_id, summary, urgency, language, preferred_follow_up, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `
    ).run(
      refId,
      user_id,
      summary,
      urgency || 'medium',
      language || 'English',
      preferred_follow_up || 'Phone',
      nowIso,
      nowIso
    );

    return NextResponse.json({
      success: true,
      reference_id: refId,
      urgency: urgency || 'medium',
      status: 'open',
    });
  } catch (error) {
    console.error('Failed to create escalation:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create escalation';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
