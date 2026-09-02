import { env } from "cloudflare:workers";

export async function ensureViewHistorySchema() {
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS viewed_strips (
        user_id TEXT NOT NULL,
        strip_id TEXT NOT NULL,
        viewed_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, strip_id)
      )`,
    ),
    env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_viewed_strips_user_viewed
       ON viewed_strips (user_id, viewed_at)`,
    ),
    env.DB.prepare("PRAGMA optimize"),
  ]);
}

export async function recordStripView(userId: string, stripId: string) {
  await ensureViewHistorySchema();
  await env.DB.prepare(
    `INSERT INTO viewed_strips (user_id, strip_id, viewed_at)
     VALUES (?, ?, ?)
     ON CONFLICT (user_id, strip_id)
     DO UPDATE SET viewed_at = excluded.viewed_at`,
  )
    .bind(userId, stripId, Date.now())
    .run();
}
