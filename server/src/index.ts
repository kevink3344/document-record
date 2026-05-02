import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import swaggerUi from 'swagger-ui-express';
import { load } from 'js-yaml';
import { getDb, seedTestDataIfEmpty, addTestUser, addTestDocument } from './db';

const app = express();
const PORT = process.env.PORT || 3001;

const configuredOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

const azureHost = process.env.WEBSITE_HOSTNAME?.trim();
const defaultOrigins = [
  'http://localhost:5173',
  ...(azureHost ? [`https://${azureHost}`] : []),
];

const allowedOrigins = new Set((configuredOrigins.length ? configuredOrigins : defaultOrigins).map((origin) => {
  try {
    const normalized = new URL(origin);
    return normalized.origin;
  } catch {
    return origin;
  }
}));

app.use(cors({ origin: (origin, cb) => {
  if (!origin) return cb(null, true);
  try {
    if (allowedOrigins.has(new URL(origin).origin)) return cb(null, true);
  } catch {
    if (allowedOrigins.has(origin)) return cb(null, true);
  }
  cb(new Error(`CORS: origin '${origin}' not allowed`));
}}));
  app.use(express.json({ limit: '15mb' }));

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
}

getDb();

const openApiPath = path.join(__dirname, '../openapi.yaml');
const openApiDoc = load(fs.readFileSync(openApiPath, 'utf8')) as Record<string, unknown>;

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDoc, { explorer: true }));
app.get('/api/openapi.yaml', (_req, res) => {
  res.sendFile(openApiPath);
});

app.get('/api/pdf-proxy', async (req, res) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!rawUrl) return res.status(400).json({ error: 'url query parameter is required' });

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs are supported' });
  }

  try {
    const upstream = await fetch(parsed.toString());
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream fetch failed (${upstream.status})` });
    }

    const contentType = upstream.headers.get('content-type') ?? 'application/pdf';
    const body = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(body);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to fetch PDF' });
  }
});

const packageJsonPath = path.join(__dirname, '../package.json');
const serverVersion = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

function resolveCommitHash(): string {
  const envCommit = process.env.GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA;
  if (envCommit?.trim()) return envCommit.trim().slice(0, 12);
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function toId(value: string | number): number {
  const id = Number(value);
  return Number.isFinite(id) ? id : 0;
}

function sendSqlError(res: express.Response, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Database error';
  const status = /FOREIGN KEY|UNIQUE|CHECK/.test(message) ? 409 : 400;
  res.status(status).json({ error: message });
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/version', (_req, res) => {
  res.json({
    service: 'document-record-server',
    version: serverVersion,
    commit: resolveCommitHash(),
    node: process.version,
  });
});

app.get('/api/settings/disclaimer', (_req, res) => {
  const db = getDb();
  const row = db
    .prepare("SELECT value, updated_at FROM app_settings WHERE key = 'acknowledgment_disclaimer'")
    .get() as { value?: string; updated_at?: string } | undefined;

  res.json({
    text: row?.value ?? '',
    updated_at: row?.updated_at ?? null,
  });
});

app.put('/api/settings/disclaimer', (req, res) => {
  const db = getDb();
  const { text } = req.body as { text?: string };
  if (typeof text !== 'string') return res.status(400).json({ error: 'text is required' });

  try {
    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('acknowledgment_disclaimer', ?, datetime('now'))
       ON CONFLICT(key)
       DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(text.trim());

    const updated = db
      .prepare("SELECT value, updated_at FROM app_settings WHERE key = 'acknowledgment_disclaimer'")
      .get() as { value: string; updated_at: string };

    res.json({ text: updated.value, updated_at: updated.updated_at });
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.post('/api/settings/seed-data', (req, res) => {
  const db = getDb();
  const { actorUserId } = req.body as { actorUserId?: number };
  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });

  const actor = db
    .prepare('SELECT id, role FROM users WHERE id = ?')
    .get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor user not found' });
  if (actor.role !== 'ADMINISTRATOR') {
    return res.status(403).json({ error: 'Only administrators can seed test data' });
  }

  const result = seedTestDataIfEmpty();
  if (!result.seeded) {
    return res.json({ seeded: false, message: 'Seed skipped: database already contains team data.' });
  }
  return res.json({ seeded: true, message: 'Seed completed: test data has been added.' });
});

app.post('/api/settings/add-user', (req, res) => {
  const db = getDb();
  const { actorUserId } = req.body as { actorUserId?: number };
  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });

  const actor = db
    .prepare('SELECT id, role FROM users WHERE id = ?')
    .get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor user not found' });
  if (actor.role !== 'ADMINISTRATOR') {
    return res.status(403).json({ error: 'Only administrators can add test users' });
  }

  const result = addTestUser();
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  return res.json({ success: true, userId: result.userId, message: result.message });
});

app.post('/api/settings/add-document', (req, res) => {
  const db = getDb();
  const { actorUserId } = req.body as { actorUserId?: number };
  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });

  const actor = db
    .prepare('SELECT id, role FROM users WHERE id = ?')
    .get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor user not found' });
  if (actor.role !== 'ADMINISTRATOR') {
    return res.status(403).json({ error: 'Only administrators can add test documents' });
  }

  const result = addTestDocument();
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  return res.json({ success: true, documentId: result.documentId, message: result.message });
});
app.get('/api/signatures', (req, res) => {
  const db = getDb();
  const userId = req.query.userId ? toId(String(req.query.userId)) : 0;
  const actorUserId = req.query.actorUserId ? toId(String(req.query.actorUserId)) : 0;

  if (!userId || !actorUserId) {
    return res.status(400).json({ error: 'userId and actorUserId are required' });
  }

  const actor = db
    .prepare('SELECT id, role FROM users WHERE id = ?')
    .get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor user not found' });
  if (actor.role !== 'ADMINISTRATOR' && actor.id !== userId) {
    return res.status(403).json({ error: 'Not authorized to view these signatures' });
  }

  const rows = db
    .prepare(
      `SELECT id, user_id, name, signature_data, is_default, created_at, updated_at
       FROM user_signatures
       WHERE user_id = ?
       ORDER BY is_default DESC, updated_at DESC, id DESC`
    )
    .all(userId);

  res.json(rows);
});

app.post('/api/signatures', (req, res) => {
  const db = getDb();
  const { actorUserId, userId, name, signatureData } = req.body as {
    actorUserId?: number;
    userId?: number;
    name?: string;
    signatureData?: string;
  };

  if (!actorUserId || !userId) {
    return res.status(400).json({ error: 'actorUserId and userId are required' });
  }
  if (!name?.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!signatureData?.trim()) {
    return res.status(400).json({ error: 'signatureData is required' });
  }

  const actor = db
    .prepare('SELECT id, role FROM users WHERE id = ?')
    .get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor user not found' });
  if (actor.role !== 'ADMINISTRATOR' && actor.id !== userId) {
    return res.status(403).json({ error: 'Not authorized to create signatures for this user' });
  }

  try {
    const existingCount = db
      .prepare('SELECT COUNT(*) AS count FROM user_signatures WHERE user_id = ?')
      .get(userId) as { count: number };
    const isDefault = existingCount.count === 0 ? 1 : 0;

    const result = db
      .prepare(
        `INSERT INTO user_signatures (user_id, name, signature_data, is_default, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      )
      .run(userId, name.trim(), signatureData.trim(), isDefault);

    const created = db
      .prepare(
        `SELECT id, user_id, name, signature_data, is_default, created_at, updated_at
         FROM user_signatures
         WHERE id = ?`
      )
      .get(result.lastInsertRowid);

    res.status(201).json(created);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.delete('/api/signatures/:id', (req, res) => {
  const db = getDb();
  const signatureId = toId(req.params.id);
  const { actorUserId } = req.body as { actorUserId?: number };
  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });

  const actor = db
    .prepare('SELECT id, role FROM users WHERE id = ?')
    .get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor user not found' });

  const signature = db
    .prepare('SELECT id, user_id FROM user_signatures WHERE id = ?')
    .get(signatureId) as { id: number; user_id: number } | undefined;
  if (!signature) return res.status(404).json({ error: 'Signature not found' });

  if (actor.role !== 'ADMINISTRATOR' && actor.id !== signature.user_id) {
    return res.status(403).json({ error: 'Not authorized to delete this signature' });
  }

  db.prepare('DELETE FROM user_signatures WHERE id = ?').run(signatureId);

  const remaining = db
    .prepare('SELECT id FROM user_signatures WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1')
    .get(signature.user_id) as { id: number } | undefined;
  if (remaining) {
    db.prepare('UPDATE user_signatures SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE user_id = ?').run(
      remaining.id,
      signature.user_id
    );
  }

  res.status(204).send();
});

app.put('/api/signatures/:id/default', (req, res) => {
  const db = getDb();
  const signatureId = toId(req.params.id);
  const { actorUserId } = req.body as { actorUserId?: number };
  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });

  const actor = db
    .prepare('SELECT id, role FROM users WHERE id = ?')
    .get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor user not found' });

  const signature = db
    .prepare('SELECT id, user_id FROM user_signatures WHERE id = ?')
    .get(signatureId) as { id: number; user_id: number } | undefined;
  if (!signature) return res.status(404).json({ error: 'Signature not found' });

  if (actor.role !== 'ADMINISTRATOR' && actor.id !== signature.user_id) {
    return res.status(403).json({ error: 'Not authorized to update this signature' });
  }

  db.prepare('UPDATE user_signatures SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE user_id = ?').run(
    signature.id,
    signature.user_id
  );

  const updated = db
    .prepare(
      `SELECT id, user_id, name, signature_data, is_default, created_at, updated_at
       FROM user_signatures
       WHERE id = ?`
    )
    .get(signature.id);

  res.json(updated);
});

// Categories API
app.get('/api/categories', (_req, res) => {
  const db = getDb();
  const categories = db
    .prepare('SELECT id, name, color, description, created_at, updated_at FROM categories ORDER BY name')
    .all();
  res.json(categories);
});

app.post('/api/categories', (req, res) => {
  const db = getDb();
  const { name, color, description } = req.body as {
    name?: string;
    color?: string;
    description?: string;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  try {
    const result = db
      .prepare(
        `INSERT INTO categories (name, color, description, updated_at)
         VALUES (?, ?, ?, datetime('now'))`
      )
      .run(name.trim(), color?.trim() || '#3B82F6', description?.trim() || '');

    const created = db
      .prepare('SELECT id, name, color, description, created_at, updated_at FROM categories WHERE id = ?')
      .get(result.lastInsertRowid);

    res.status(201).json(created);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.put('/api/categories/:id', (req, res) => {
  const db = getDb();
  const categoryId = toId(req.params.id);
  const { name, color, description } = req.body as {
    name?: string;
    color?: string;
    description?: string;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  try {
    const result = db
      .prepare(
        `UPDATE categories
         SET name = ?, color = ?, description = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(name.trim(), color?.trim() || '#3B82F6', description?.trim() || '', categoryId);

    if (result.changes === 0) return res.status(404).json({ error: 'Category not found' });

    const updated = db
      .prepare('SELECT id, name, color, description, created_at, updated_at FROM categories WHERE id = ?')
      .get(categoryId);

    res.json(updated);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.delete('/api/categories/:id', (req, res) => {
  const db = getDb();
  const categoryId = toId(req.params.id);

  try {
    const result = db.prepare('DELETE FROM categories WHERE id = ?').run(categoryId);
    if (result.changes === 0) return res.status(404).json({ error: 'Category not found' });
    res.status(204).send();
  } catch (error) {
    sendSqlError(res, error);
  }
});

// Tags API
app.get('/api/tags', (_req, res) => {
  const db = getDb();
  const tags = db
    .prepare('SELECT id, name, color, description, created_at, updated_at FROM tags ORDER BY name')
    .all();
  res.json(tags);
});

app.post('/api/tags', (req, res) => {
  const db = getDb();
  const { name, color, description } = req.body as {
    name?: string;
    color?: string;
    description?: string;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  try {
    const result = db
      .prepare(
        `INSERT INTO tags (name, color, description, updated_at)
         VALUES (?, ?, ?, datetime('now'))`
      )
      .run(name.trim(), color?.trim() || '#10B981', description?.trim() || '');

    const created = db
      .prepare('SELECT id, name, color, description, created_at, updated_at FROM tags WHERE id = ?')
      .get(result.lastInsertRowid);

    res.status(201).json(created);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.put('/api/tags/:id', (req, res) => {
  const db = getDb();
  const tagId = toId(req.params.id);
  const { name, color, description } = req.body as {
    name?: string;
    color?: string;
    description?: string;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  try {
    const result = db
      .prepare(
        `UPDATE tags
         SET name = ?, color = ?, description = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(name.trim(), color?.trim() || '#10B981', description?.trim() || '', tagId);

    if (result.changes === 0) return res.status(404).json({ error: 'Tag not found' });

    const updated = db
      .prepare('SELECT id, name, color, description, created_at, updated_at FROM tags WHERE id = ?')
      .get(tagId);

    res.json(updated);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.delete('/api/tags/:id', (req, res) => {
  const db = getDb();
  const tagId = toId(req.params.id);

  try {
    const result = db.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
    if (result.changes === 0) return res.status(404).json({ error: 'Tag not found' });
    res.status(204).send();
  } catch (error) {
    sendSqlError(res, error);
  }
});

// Document Category/Tag Management
app.get('/api/documents/:id/categories', (req, res) => {
  const db = getDb();
  const documentId = toId(req.params.id);

  const categories = db
    .prepare(
      `SELECT c.id, c.name, c.color, c.description, dc.assigned_at
       FROM categories c
       JOIN document_categories dc ON c.id = dc.category_id
       WHERE dc.document_id = ?
       ORDER BY c.name`
    )
    .all(documentId);

  res.json(categories);
});

app.post('/api/documents/:id/categories', (req, res) => {
  const db = getDb();
  const documentId = toId(req.params.id);
  const { categoryId } = req.body as { categoryId?: number };

  if (!categoryId) return res.status(400).json({ error: 'categoryId is required' });

  try {
    db.prepare('INSERT INTO document_categories (document_id, category_id) VALUES (?, ?)').run(
      documentId,
      categoryId
    );
    res.status(201).json({ success: true });
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.delete('/api/documents/:documentId/categories/:categoryId', (req, res) => {
  const db = getDb();
  const documentId = toId(req.params.documentId);
  const categoryId = toId(req.params.categoryId);

  try {
    const result = db
      .prepare('DELETE FROM document_categories WHERE document_id = ? AND category_id = ?')
      .run(documentId, categoryId);

    if (result.changes === 0) return res.status(404).json({ error: 'Document category association not found' });
    res.status(204).send();
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.get('/api/documents/:id/tags', (req, res) => {
  const db = getDb();
  const documentId = toId(req.params.id);

  const tags = db
    .prepare(
      `SELECT t.id, t.name, t.color, t.description, dt.assigned_at
       FROM tags t
       JOIN document_tags dt ON t.id = dt.tag_id
       WHERE dt.document_id = ?
       ORDER BY t.name`
    )
    .all(documentId);

  res.json(tags);
});

app.post('/api/documents/:id/tags', (req, res) => {
  const db = getDb();
  const documentId = toId(req.params.id);
  const { tagId } = req.body as { tagId?: number };

  if (!tagId) return res.status(400).json({ error: 'tagId is required' });

  try {
    db.prepare('INSERT INTO document_tags (document_id, tag_id) VALUES (?, ?)').run(documentId, tagId);
    res.status(201).json({ success: true });
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.delete('/api/documents/:documentId/tags/:tagId', (req, res) => {
  const db = getDb();
  const documentId = toId(req.params.documentId);
  const tagId = toId(req.params.tagId);

  try {
    const result = db
      .prepare('DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?')
      .run(documentId, tagId);

    if (result.changes === 0) return res.status(404).json({ error: 'Document tag association not found' });
    res.status(204).send();
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.get('/api/lookups', (_req, res) => {
  const db = getDb();
  const teams = db
    .prepare(
      `SELECT t.id, t.name, t.description, t.manager_user_id,
              COALESCE((
                SELECT json_group_array(tm.user_id)
                FROM team_managers tm
                WHERE tm.team_id = t.id
              ), '[]') AS manager_user_ids
       FROM teams t
       ORDER BY t.name`
    )
    .all();
  const userTypes = db.prepare('SELECT id, name FROM user_types ORDER BY name').all();
  const schools = db.prepare('SELECT id, name FROM schools ORDER BY name').all();
  const users = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.role, u.school_id, u.user_type_id,
              s.name AS school_name, ut.name AS user_type_name
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
       LEFT JOIN user_types ut ON ut.id = u.user_type_id
       ORDER BY u.full_name`
    )
    .all();

  res.json({ teams, userTypes, schools, users });
});

app.get('/api/teams', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT t.id, t.name, t.description, t.manager_user_id,
              COALESCE((
                SELECT json_group_array(tm.user_id)
                FROM team_managers tm
                WHERE tm.team_id = t.id
              ), '[]') AS manager_user_ids,
              COALESCE((
                SELECT GROUP_CONCAT(u.full_name, ', ')
                FROM team_managers tm
                INNER JOIN users u ON u.id = tm.user_id
                WHERE tm.team_id = t.id
              ), '') AS manager_names,
              t.created_at
       FROM teams t
       ORDER BY t.name`
    )
    .all();
  res.json(rows);
});

app.get('/api/teams/:id', (req, res) => {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT t.id, t.name, t.description, t.manager_user_id,
              COALESCE((
                SELECT json_group_array(tm.user_id)
                FROM team_managers tm
                WHERE tm.team_id = t.id
              ), '[]') AS manager_user_ids,
              COALESCE((
                SELECT GROUP_CONCAT(u.full_name, ', ')
                FROM team_managers tm
                INNER JOIN users u ON u.id = tm.user_id
                WHERE tm.team_id = t.id
              ), '') AS manager_names,
              t.created_at
       FROM teams t
       WHERE t.id = ?`
    )
    .get(toId(req.params.id));
  if (!row) return res.status(404).json({ error: 'Team not found' });
  res.json(row);
});

app.post('/api/teams', (req, res) => {
  const db = getDb();
  const { name, description, managerUserIds } = req.body as {
    name: string;
    description?: string;
    managerUserIds?: number[];
  };
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const managerIds = Array.from(new Set((managerUserIds ?? []).filter((id) => Number.isFinite(Number(id)))));
    const result = db
      .prepare('INSERT INTO teams (name, description, manager_user_id) VALUES (?, ?, ?)')
      .run(name.trim(), (description ?? '').trim(), managerIds[0] ?? null);

    const mapStmt = db.prepare('INSERT INTO team_managers (team_id, user_id) VALUES (?, ?)');
    managerIds.forEach((userId) => mapStmt.run(result.lastInsertRowid, userId));

    const created = db
      .prepare(
        `SELECT t.id, t.name, t.description, t.manager_user_id,
                COALESCE((
                  SELECT json_group_array(tm.user_id)
                  FROM team_managers tm
                  WHERE tm.team_id = t.id
                ), '[]') AS manager_user_ids,
                t.created_at
         FROM teams t
         WHERE t.id = ?`
      )
      .get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.put('/api/teams/:id', (req, res) => {
  const db = getDb();
  const id = toId(req.params.id);
  const { name, description, managerUserIds } = req.body as {
    name?: string;
    description?: string;
    managerUserIds?: number[];
  };
  const existing = db.prepare('SELECT id FROM teams WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Team not found' });
  try {
    const managerIds = Array.isArray(managerUserIds)
      ? Array.from(new Set(managerUserIds.filter((value) => Number.isFinite(Number(value)))))
      : null;

    db.prepare(
      `UPDATE teams
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           manager_user_id = COALESCE(?, manager_user_id)
       WHERE id = ?`
    ).run(name?.trim() ?? null, description == null ? null : description.trim(), managerIds ? managerIds[0] ?? null : null, id);

    if (managerIds) {
      db.prepare('DELETE FROM team_managers WHERE team_id = ?').run(id);
      const mapStmt = db.prepare('INSERT INTO team_managers (team_id, user_id) VALUES (?, ?)');
      managerIds.forEach((userId) => mapStmt.run(id, userId));
    }

    const updated = db
      .prepare(
        `SELECT t.id, t.name, t.description, t.manager_user_id,
                COALESCE((
                  SELECT json_group_array(tm.user_id)
                  FROM team_managers tm
                  WHERE tm.team_id = t.id
                ), '[]') AS manager_user_ids,
                t.created_at
         FROM teams t
         WHERE t.id = ?`
      )
      .get(id);
    res.json(updated);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.delete('/api/teams/:id', (req, res) => {
  const db = getDb();
  try {
    const result = db.prepare('DELETE FROM teams WHERE id = ?').run(toId(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'Team not found' });
    res.status(204).send();
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.get('/api/user-types', (_req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM user_types ORDER BY name').all());
});

app.get('/api/user-types/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_types WHERE id = ?').get(toId(req.params.id));
  if (!row) return res.status(404).json({ error: 'User type not found' });
  res.json(row);
});

app.post('/api/user-types', (req, res) => {
  const db = getDb();
  const { name } = req.body as { name: string };
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const result = db.prepare('INSERT INTO user_types (name) VALUES (?)').run(name.trim());
    const created = db.prepare('SELECT * FROM user_types WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.put('/api/user-types/:id', (req, res) => {
  const db = getDb();
  const id = toId(req.params.id);
  const { name } = req.body as { name?: string };
  const existing = db.prepare('SELECT id FROM user_types WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User type not found' });
  try {
    db.prepare('UPDATE user_types SET name = COALESCE(?, name) WHERE id = ?').run(name?.trim() ?? null, id);
    const updated = db.prepare('SELECT * FROM user_types WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.delete('/api/user-types/:id', (req, res) => {
  const db = getDb();
  try {
    const result = db.prepare('DELETE FROM user_types WHERE id = ?').run(toId(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'User type not found' });
    res.status(204).send();
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.get('/api/schools', (_req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM schools ORDER BY name').all());
});

app.get('/api/schools/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM schools WHERE id = ?').get(toId(req.params.id));
  if (!row) return res.status(404).json({ error: 'School not found' });
  res.json(row);
});

app.post('/api/schools', (req, res) => {
  const db = getDb();
  const { name } = req.body as { name: string };
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const result = db.prepare('INSERT INTO schools (name) VALUES (?)').run(name.trim());
    const created = db.prepare('SELECT * FROM schools WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.put('/api/schools/:id', (req, res) => {
  const db = getDb();
  const id = toId(req.params.id);
  const { name } = req.body as { name?: string };
  const existing = db.prepare('SELECT id FROM schools WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'School not found' });
  try {
    db.prepare('UPDATE schools SET name = COALESCE(?, name) WHERE id = ?').run(name?.trim() ?? null, id);
    const updated = db.prepare('SELECT * FROM schools WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.delete('/api/schools/:id', (req, res) => {
  const db = getDb();
  try {
    const result = db.prepare('DELETE FROM schools WHERE id = ?').run(toId(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'School not found' });
    res.status(204).send();
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.get('/api/users', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.role, u.school_id, u.user_type_id, u.is_active, u.created_at,
              s.name AS school_name, ut.name AS user_type_name
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
       LEFT JOIN user_types ut ON ut.id = u.user_type_id
       ORDER BY u.full_name`
    )
    .all();
  res.json(rows);
});

app.get('/api/users/:id', (req, res) => {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.role, u.school_id, u.user_type_id, u.is_active, u.created_at,
              s.name AS school_name, ut.name AS user_type_name
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
       LEFT JOIN user_types ut ON ut.id = u.user_type_id
       WHERE u.id = ?`
    )
    .get(toId(req.params.id));
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json(row);
});

app.post('/api/users', (req, res) => {
  const db = getDb();
  const { fullName, email, role, schoolId, userTypeId, isActive } = req.body as {
    fullName: string;
    email: string;
    role: 'ADMINISTRATOR' | 'TEAM_MANAGER' | 'USER';
    schoolId?: number | null;
    userTypeId?: number | null;
    isActive?: number;
  };
  if (!fullName?.trim() || !email?.trim() || !role) {
    return res.status(400).json({ error: 'fullName, email and role are required' });
  }
  try {
    const result = db
      .prepare(
        `INSERT INTO users (full_name, email, role, school_id, user_type_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        fullName.trim(),
        email.trim().toLowerCase(),
        role,
        schoolId ?? null,
        userTypeId ?? null,
        isActive ?? 1
      );
    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.put('/api/users/:id', (req, res) => {
  const db = getDb();
  const id = toId(req.params.id);
  const { fullName, email, role, schoolId, userTypeId, isActive } = req.body as {
    fullName?: string;
    email?: string;
    role?: 'ADMINISTRATOR' | 'TEAM_MANAGER' | 'USER';
    schoolId?: number | null;
    userTypeId?: number | null;
    isActive?: number;
  };
  const hasSchoolId = Object.prototype.hasOwnProperty.call(req.body, 'schoolId');
  const hasUserTypeId = Object.prototype.hasOwnProperty.call(req.body, 'userTypeId');
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  try {
    db.prepare(
      `UPDATE users
       SET full_name = COALESCE(?, full_name),
           email = COALESCE(?, email),
           role = COALESCE(?, role),
           school_id = CASE WHEN ? THEN ? ELSE school_id END,
           user_type_id = CASE WHEN ? THEN ? ELSE user_type_id END,
           is_active = COALESCE(?, is_active)
       WHERE id = ?`
    ).run(
      fullName?.trim() ?? null,
      email?.trim().toLowerCase() ?? null,
      role ?? null,
      hasSchoolId ? 1 : 0,
      schoolId ?? null,
      hasUserTypeId ? 1 : 0,
      userTypeId ?? null,
      isActive ?? null,
      id
    );
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.delete('/api/users/:id', (req, res) => {
  const db = getDb();
  try {
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(toId(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'User not found' });
    res.status(204).send();
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.post('/api/register', (req, res) => {
  const db = getDb();
  const { fullName, email, schoolId, userTypeId } = req.body as {
    fullName: string;
    email: string;
    schoolId?: number | null;
    userTypeId?: number | null;
  };

  if (!fullName?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'fullName and email are required' });
  }

  const result = db
    .prepare(
      `INSERT INTO users (full_name, email, role, school_id, user_type_id)
       VALUES (?, ?, 'USER', ?, ?)`
    )
    .run(fullName.trim(), email.trim().toLowerCase(), schoolId ?? null, userTypeId ?? null);

  const user = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.role, u.school_id, u.user_type_id,
              s.name AS school_name, ut.name AS user_type_name
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
       LEFT JOIN user_types ut ON ut.id = u.user_type_id
       WHERE u.id = ?`
    )
    .get(result.lastInsertRowid);

  res.status(201).json(user);
});

app.get('/api/dashboard', (req, res) => {
  const db = getDb();
  const userId = Number(req.query.userId);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
    | { id: number; role: string; user_type_id: number }
    | undefined;
  if (!user) return res.status(404).json({ error: 'User not found' });

  let summary: {
    total_documents: number;
    completed: number;
    assigned: number;
    overdue: number;
  };

  let overdueList: Array<{ id: number; title: string; due_date: string; team_name: string }> = [];

  if (user.role === 'ADMINISTRATOR') {
    summary = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM documents) AS total_documents,
          (SELECT COUNT(*)
             FROM documents d
            WHERE EXISTS (SELECT 1 FROM acknowledgments a WHERE a.document_id = d.id)
          ) AS completed,
          (SELECT COUNT(*) FROM documents) AS assigned,
          (SELECT COUNT(*)
             FROM documents d
            WHERE date(d.due_date) < date('now')
              AND NOT EXISTS (SELECT 1 FROM acknowledgments a WHERE a.document_id = d.id)
          ) AS overdue`
      )
      .get() as {
      total_documents: number;
      completed: number;
      assigned: number;
      overdue: number;
    };

    overdueList = db
      .prepare(
        `SELECT d.id, d.title, d.due_date, tm.name AS team_name
         FROM documents d
         INNER JOIN teams tm ON tm.id = d.team_id
         WHERE date(d.due_date) < date('now')
           AND NOT EXISTS (
             SELECT 1 FROM acknowledgments a WHERE a.document_id = d.id
           )
         ORDER BY d.due_date ASC`
      )
      .all() as Array<{ id: number; title: string; due_date: string; team_name: string }>;
  } else if (user.role === 'TEAM_MANAGER') {
    summary = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM documents d
            INNER JOIN team_managers tmg ON tmg.team_id = d.team_id
           WHERE tmg.user_id = ?) AS total_documents,
          (SELECT COUNT(*)
             FROM documents d
             INNER JOIN team_managers tmg ON tmg.team_id = d.team_id
            WHERE tmg.user_id = ?
              AND EXISTS (SELECT 1 FROM acknowledgments a WHERE a.document_id = d.id)
          ) AS completed,
          (SELECT COUNT(*) FROM documents d
            INNER JOIN team_managers tmg ON tmg.team_id = d.team_id
           WHERE tmg.user_id = ?) AS assigned,
          (SELECT COUNT(*)
             FROM documents d
             INNER JOIN team_managers tmg ON tmg.team_id = d.team_id
            WHERE tmg.user_id = ?
              AND date(d.due_date) < date('now')
              AND NOT EXISTS (SELECT 1 FROM acknowledgments a WHERE a.document_id = d.id)
          ) AS overdue`
      )
      .get(user.id, user.id, user.id, user.id) as {
      total_documents: number;
      completed: number;
      assigned: number;
      overdue: number;
    };

    overdueList = db
      .prepare(
        `SELECT d.id, d.title, d.due_date, tm.name AS team_name
         FROM documents d
         INNER JOIN teams tm ON tm.id = d.team_id
         INNER JOIN team_managers tmg ON tmg.team_id = d.team_id
         WHERE tmg.user_id = ?
           AND date(d.due_date) < date('now')
           AND NOT EXISTS (
             SELECT 1 FROM acknowledgments a WHERE a.document_id = d.id
           )
         ORDER BY d.due_date ASC`
      )
      .all(user.id) as Array<{ id: number; title: string; due_date: string; team_name: string }>;
  } else {
    summary = db
      .prepare(
        `SELECT
          (SELECT COUNT(*)
             FROM documents d
             INNER JOIN document_user_types dut ON dut.document_id = d.id
            WHERE dut.user_type_id = ?) AS total_documents,
          (SELECT COUNT(*)
             FROM acknowledgments a
             INNER JOIN documents d ON d.id = a.document_id
             INNER JOIN document_user_types dut ON dut.document_id = d.id
            WHERE a.user_id = ? AND dut.user_type_id = ?
          ) AS completed,
          (SELECT COUNT(*)
             FROM documents d
             INNER JOIN document_user_types dut ON dut.document_id = d.id
            WHERE dut.user_type_id = ?) AS assigned,
          (SELECT COUNT(*)
             FROM documents d
             INNER JOIN document_user_types dut ON dut.document_id = d.id
            WHERE dut.user_type_id = ?
              AND date(d.due_date) < date('now')
              AND d.id NOT IN (
                SELECT document_id FROM acknowledgments WHERE user_id = ?
              )) AS overdue`
      )
      .get(user.user_type_id, user.id, user.user_type_id, user.user_type_id, user.user_type_id, user.id) as {
      total_documents: number;
      completed: number;
      assigned: number;
      overdue: number;
    };

    overdueList = db
      .prepare(
        `SELECT d.id, d.title, d.due_date, tm.name AS team_name
         FROM documents d
         INNER JOIN teams tm ON tm.id = d.team_id
         INNER JOIN document_user_types dut ON dut.document_id = d.id
         WHERE dut.user_type_id = ?
           AND date(d.due_date) < date('now')
           AND d.id NOT IN (
             SELECT document_id FROM acknowledgments WHERE user_id = ?
           )
         ORDER BY d.due_date ASC`
      )
      .all(user.user_type_id, user.id) as Array<{ id: number; title: string; due_date: string; team_name: string }>;
  }

  let trend: Array<{ day: string; team_name: string; acknowledgment_count: number }> = [];
  if (user.role === 'ADMINISTRATOR') {
    trend = db
      .prepare(
        `SELECT date(a.acknowledged_at) AS day,
                tm.name AS team_name,
                COUNT(*) AS acknowledgment_count
         FROM acknowledgments a
         INNER JOIN documents d ON d.id = a.document_id
         INNER JOIN teams tm ON tm.id = d.team_id
         WHERE date(a.acknowledged_at) >= date('now', '-13 days')
         GROUP BY date(a.acknowledged_at), tm.id, tm.name
         ORDER BY day ASC, tm.name ASC`
      )
      .all() as Array<{ day: string; team_name: string; acknowledgment_count: number }>;
  } else if (user.role === 'TEAM_MANAGER') {
    trend = db
      .prepare(
        `SELECT date(a.acknowledged_at) AS day,
                tm.name AS team_name,
                COUNT(*) AS acknowledgment_count
         FROM acknowledgments a
         INNER JOIN documents d ON d.id = a.document_id
         INNER JOIN teams tm ON tm.id = d.team_id
         INNER JOIN team_managers tmg ON tmg.team_id = tm.id
         WHERE tmg.user_id = ?
           AND date(a.acknowledged_at) >= date('now', '-13 days')
         GROUP BY date(a.acknowledged_at), tm.id, tm.name
         ORDER BY day ASC, tm.name ASC`
      )
      .all(user.id) as Array<{ day: string; team_name: string; acknowledgment_count: number }>;
  }

  let compliance: Array<{ team_name: string; signed: number; total: number }> = [];
  if (user.role === 'ADMINISTRATOR') {
    compliance = db
      .prepare(
        `SELECT tm.name AS team_name,
                COUNT(DISTINCT d.id) AS total,
                COUNT(DISTINCT CASE WHEN a.document_id IS NOT NULL THEN d.id END) AS signed
         FROM teams tm
         LEFT JOIN documents d ON d.team_id = tm.id
         LEFT JOIN acknowledgments a ON a.document_id = d.id
         GROUP BY tm.id, tm.name
         ORDER BY tm.name ASC`
      )
      .all() as Array<{ team_name: string; signed: number; total: number }>;
  } else if (user.role === 'TEAM_MANAGER') {
    compliance = db
      .prepare(
        `SELECT tm.name AS team_name,
                COUNT(DISTINCT d.id) AS total,
                COUNT(DISTINCT CASE WHEN a.document_id IS NOT NULL THEN d.id END) AS signed
         FROM teams tm
         INNER JOIN team_managers tmg ON tmg.team_id = tm.id
         LEFT JOIN documents d ON d.team_id = tm.id
         LEFT JOIN acknowledgments a ON a.document_id = d.id
         WHERE tmg.user_id = ?
         GROUP BY tm.id, tm.name
         ORDER BY tm.name ASC`
      )
      .all(user.id) as Array<{ team_name: string; signed: number; total: number }>;
  }

  res.json({ summary, trend, overdueList, compliance });
});

app.get('/api/documents', (req, res) => {
  const db = getDb();
  const userId = Number(req.query.userId);

  const user = db
    .prepare('SELECT id, role, user_type_id FROM users WHERE id = ?')
    .get(userId) as { id: number; role: string; user_type_id: number } | undefined;
  if (!user) return res.status(404).json({ error: 'User not found' });

  const docs =
    user.role === 'ADMINISTRATOR'
      ? db
          .prepare(
            `SELECT d.*, tm.name AS team_name,
                GROUP_CONCAT(ut.name, ', ') AS user_types,
                CASE WHEN EXISTS (
                    SELECT 1 FROM acknowledgments a
                    WHERE a.document_id = d.id AND a.user_id = ?
                ) THEN 1 ELSE 0 END AS is_acknowledged
             FROM documents d
             INNER JOIN teams tm ON tm.id = d.team_id
             LEFT JOIN document_user_types dut ON dut.document_id = d.id
             LEFT JOIN user_types ut ON ut.id = dut.user_type_id
             GROUP BY d.id
             ORDER BY d.due_date ASC`
          )
          .all(user.id)
      : db
          .prepare(
            `SELECT d.*, tm.name AS team_name,
                GROUP_CONCAT(ut.name, ', ') AS user_types,
                CASE WHEN EXISTS (
                    SELECT 1 FROM acknowledgments a
                    WHERE a.document_id = d.id AND a.user_id = ?
                ) THEN 1 ELSE 0 END AS is_acknowledged
             FROM documents d
             INNER JOIN teams tm ON tm.id = d.team_id
             INNER JOIN document_user_types dut ON dut.document_id = d.id
             INNER JOIN user_types ut ON ut.id = dut.user_type_id
             WHERE dut.user_type_id = ?
             GROUP BY d.id
             ORDER BY d.due_date ASC`
          )
          .all(user.id, user.user_type_id);

  const withStatus = (docs as Array<Record<string, unknown>>).map((doc) => {
    const due = new Date(doc.due_date as string).getTime();
    const now = Date.now();
    let status = 'PENDING';
    if (doc.is_acknowledged as number) status = 'COMPLETED';
    else if (due < now) status = 'OVERDUE';
    return { ...doc, status };
  });

  res.json(withStatus);
});

app.get('/api/my-team-docs', (req, res) => {
  const db = getDb();
  const managerUserId = Number(req.query.managerUserId);
  if (!managerUserId) return res.status(400).json({ error: 'managerUserId is required' });

  const manager = db
    .prepare('SELECT id FROM users WHERE id = ? AND role = ?')
    .get(managerUserId, 'TEAM_MANAGER');
  if (!manager) return res.status(404).json({ error: 'Team manager not found' });

  const docs = db
    .prepare(
      `SELECT d.*, tm.name AS team_name,
              GROUP_CONCAT(ut.name, ', ') AS user_types,
              CASE WHEN EXISTS (
                SELECT 1 FROM acknowledgments a
                WHERE a.document_id = d.id AND a.user_id = ?
              ) THEN 1 ELSE 0 END AS is_acknowledged
       FROM documents d
       INNER JOIN teams tm ON tm.id = d.team_id
       INNER JOIN team_managers tmg ON tmg.team_id = d.team_id
       LEFT JOIN document_user_types dut ON dut.document_id = d.id
       LEFT JOIN user_types ut ON ut.id = dut.user_type_id
       WHERE tmg.user_id = ?
       GROUP BY d.id
       ORDER BY d.due_date ASC`
    )
    .all(managerUserId, managerUserId);

  const withStatus = (docs as Array<Record<string, unknown>>).map((doc) => {
    const due = new Date(doc.due_date as string).getTime();
    const now = Date.now();
    let status = 'PENDING';
    if (doc.is_acknowledged as number) status = 'COMPLETED';
    else if (due < now) status = 'OVERDUE';
    return { ...doc, status };
  });

  res.json(withStatus);
});

app.get('/api/documents/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const userRole = req.query.userRole ? String(req.query.userRole) : null;
  
  const doc = db
    .prepare(
      `SELECT d.*, tm.name AS team_name,
              GROUP_CONCAT(ut.name, ', ') AS user_types
       FROM documents d
       INNER JOIN teams tm ON tm.id = d.team_id
       LEFT JOIN document_user_types dut ON dut.document_id = d.id
       LEFT JOIN user_types ut ON ut.id = dut.user_type_id
       WHERE d.id = ?
       GROUP BY d.id`
    )
    .get(id);

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  let activity;
  if (userRole === 'USER' && userId) {
    activity = db
      .prepare(
        `SELECT af.id, af.message, af.created_at, u.full_name AS actor_name
         FROM activity_feed af
         LEFT JOIN users u ON u.id = af.actor_user_id
         WHERE af.entity_type = 'DOCUMENT' AND af.entity_id = ?
           AND (af.actor_user_id = ? OR af.actor_user_id IS NULL)
         ORDER BY af.created_at DESC`
      )
      .all(id, userId);
  } else {
    activity = db
      .prepare(
        `SELECT af.id, af.message, af.created_at, u.full_name AS actor_name
         FROM activity_feed af
         LEFT JOIN users u ON u.id = af.actor_user_id
         WHERE af.entity_type = 'DOCUMENT' AND af.entity_id = ?
         ORDER BY af.created_at DESC`
      )
      .all(id);
  }

  const acknowledgments = db
    .prepare(
      `SELECT a.id, a.user_id, a.acknowledged_at, a.comment, a.signature_data, a.signed_name, a.signed_at,
              u.full_name, s.name AS school_name, ut.name AS user_type_name
       FROM acknowledgments a
       INNER JOIN users u ON u.id = a.user_id
       LEFT JOIN schools s ON s.id = u.school_id
       LEFT JOIN user_types ut ON ut.id = u.user_type_id
       WHERE a.document_id = ?
       ORDER BY a.acknowledged_at DESC`
    )
    .all(id);

  res.json({ document: doc, activity, acknowledgments });
});

app.post('/api/documents', (req, res) => {
  const db = getDb();
  const {
    teamId,
    title,
    description,
    content,
    documentType,
    schedule,
    dueDate,
    endDate,
    fileUrl,
    userTypeIds,
    actorUserId,
  } = req.body as {
    teamId: number;
    title: string;
    description: string;
    content: string;
    documentType: string;
    schedule: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
    dueDate: string;
    endDate: string;
    fileUrl?: string;
    userTypeIds: number[];
    actorUserId: number;
  };

  const normalizedTeamId = Number(teamId);
  const normalizedActorUserId = actorUserId != null ? Number(actorUserId) : null;
  const normalizedUserTypeIds = Array.isArray(userTypeIds)
    ? [...new Set(userTypeIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))]
    : [];

  if (!normalizedTeamId || !title?.trim() || !schedule || !dueDate || !normalizedUserTypeIds.length) {
    return res.status(400).json({ error: 'Missing required fields for document creation' });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO documents (
          team_id, title, description, content, document_type, schedule, due_date, end_date, file_url, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        normalizedTeamId,
        title.trim(),
        description ?? '',
        content ?? '',
        documentType ?? 'PDF',
        schedule,
        dueDate,
        endDate?.trim() ? endDate : null,
        fileUrl?.trim() ? fileUrl : null,
        normalizedActorUserId
      );

    const linkStmt = db.prepare(
      'INSERT INTO document_user_types (document_id, user_type_id) VALUES (?, ?)'
    );
    normalizedUserTypeIds.forEach((userTypeId) => linkStmt.run(result.lastInsertRowid, userTypeId));

    db.prepare(
      'INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id) VALUES (?, ?, ?, ?)'
    ).run('DOCUMENT', result.lastInsertRowid, 'Document created and assigned.', normalizedActorUserId);

    res.status(201).json({ id: result.lastInsertRowid });
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.put('/api/documents/:id', (req, res) => {
  const db = getDb();
  const id = toId(req.params.id);
  const {
    teamId,
    title,
    description,
    content,
    documentType,
    schedule,
    dueDate,
    endDate,
    fileUrl,
    userTypeIds,
    actorUserId,
  } = req.body as {
    teamId?: number;
    title?: string;
    description?: string;
    content?: string;
    documentType?: string;
    schedule?: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
    dueDate?: string;
    endDate?: string | null;
    fileUrl?: string | null;
    userTypeIds?: number[];
    actorUserId?: number;
  };

  const existing = db.prepare('SELECT id FROM documents WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Document not found' });

  const normalizedTeamId = teamId != null ? Number(teamId) : null;
  const normalizedActorUserId = actorUserId != null ? Number(actorUserId) : null;
  const normalizedUserTypeIds = Array.isArray(userTypeIds)
    ? [...new Set(userTypeIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))]
    : null;

  try {
    db.prepare(
      `UPDATE documents
       SET team_id = COALESCE(?, team_id),
           title = COALESCE(?, title),
           description = COALESCE(?, description),
           content = COALESCE(?, content),
           document_type = COALESCE(?, document_type),
           schedule = COALESCE(?, schedule),
           due_date = COALESCE(?, due_date),
           end_date = COALESCE(?, end_date),
           file_url = COALESCE(?, file_url),
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      normalizedTeamId,
      title?.trim() ?? null,
      description ?? null,
      content ?? null,
      documentType ?? null,
      schedule ?? null,
      dueDate ?? null,
      endDate?.trim() ? endDate : null,
      fileUrl?.trim() ? fileUrl : null,
      id
    );

    if (Array.isArray(normalizedUserTypeIds)) {
      db.prepare('DELETE FROM document_user_types WHERE document_id = ?').run(id);
      const mapStmt = db.prepare(
        'INSERT INTO document_user_types (document_id, user_type_id) VALUES (?, ?)'
      );
      normalizedUserTypeIds.forEach((userTypeId) => mapStmt.run(id, userTypeId));
    }

    db.prepare(
      'INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id) VALUES (?, ?, ?, ?)'
    ).run('DOCUMENT', id, 'Document updated.', normalizedActorUserId);

    const updated = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.delete('/api/documents/:id', (req, res) => {
  const db = getDb();
  const id = toId(req.params.id);
  try {
    const result = db.prepare('DELETE FROM documents WHERE id = ?').run(id);
    if (!result.changes) return res.status(404).json({ error: 'Document not found' });
    res.status(204).send();
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.get('/api/document-user-types', (req, res) => {
  const db = getDb();
  const documentId = req.query.documentId ? toId(String(req.query.documentId)) : null;
  const rows = db
    .prepare(
      `SELECT dut.document_id, dut.user_type_id, ut.name AS user_type_name
       FROM document_user_types dut
       INNER JOIN user_types ut ON ut.id = dut.user_type_id
       WHERE (? IS NULL OR dut.document_id = ?)
       ORDER BY dut.document_id, ut.name`
    )
    .all(documentId, documentId);
  res.json(rows);
});

app.post('/api/document-user-types', (req, res) => {
  const db = getDb();
  const { documentId, userTypeId } = req.body as { documentId: number; userTypeId: number };
  if (!documentId || !userTypeId) {
    return res.status(400).json({ error: 'documentId and userTypeId are required' });
  }
  try {
    db.prepare('INSERT INTO document_user_types (document_id, user_type_id) VALUES (?, ?)').run(
      documentId,
      userTypeId
    );
    res.status(201).json({ documentId, userTypeId });
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.delete('/api/document-user-types', (req, res) => {
  const db = getDb();
  const { documentId, userTypeId } = req.body as { documentId: number; userTypeId: number };
  if (!documentId || !userTypeId) {
    return res.status(400).json({ error: 'documentId and userTypeId are required' });
  }
  const result = db
    .prepare('DELETE FROM document_user_types WHERE document_id = ? AND user_type_id = ?')
    .run(documentId, userTypeId);
  if (!result.changes) return res.status(404).json({ error: 'Mapping not found' });
  res.status(204).send();
});

app.post('/api/documents/:id/acknowledge', (req, res) => {
  const db = getDb();
  const documentId = Number(req.params.id);
  const { userId, comment, signature } = req.body as {
    userId: number;
    comment?: string;
    signature?: {
      imageDataUrl?: string;
      signedName?: string;
      signedAt?: string;
    };
  };

  if (!userId) return res.status(400).json({ error: 'userId is required' });
  if (!signature?.imageDataUrl?.trim()) {
    return res.status(400).json({ error: 'signature.imageDataUrl is required' });
  }

  const exists = db.prepare('SELECT id FROM documents WHERE id = ?').get(documentId);
  if (!exists) return res.status(404).json({ error: 'Document not found' });

  const already = db
    .prepare('SELECT id FROM acknowledgments WHERE document_id = ? AND user_id = ?')
    .get(documentId, userId);
  if (already) return res.status(200).json({ message: 'Already acknowledged' });

  db.prepare(
    `INSERT INTO acknowledgments (
      document_id,
      user_id,
      acknowledged,
      comment,
      signature_data,
      signed_name,
      signed_at
    ) VALUES (?, ?, 1, ?, ?, ?, ?)`
  ).run(
    documentId,
    userId,
    comment ?? null,
    signature.imageDataUrl.trim(),
    signature.signedName?.trim() || null,
    signature.signedAt?.trim() || new Date().toISOString()
  );

  db.prepare(
    'INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id) VALUES (?, ?, ?, ?)'
  ).run('DOCUMENT', documentId, 'Document acknowledged by staff member.', userId);

  res.status(201).json({ message: 'Acknowledged' });
});

app.get('/api/acknowledgments', (req, res) => {
  const db = getDb();
  const documentId = req.query.documentId ? toId(String(req.query.documentId)) : null;
  const userId = req.query.userId ? toId(String(req.query.userId)) : null;
  const rows = db
    .prepare(
      `SELECT a.*, u.full_name, d.title AS document_title
       FROM acknowledgments a
       INNER JOIN users u ON u.id = a.user_id
       INNER JOIN documents d ON d.id = a.document_id
       WHERE (? IS NULL OR a.document_id = ?)
         AND (? IS NULL OR a.user_id = ?)
       ORDER BY a.acknowledged_at DESC`
    )
    .all(documentId, documentId, userId, userId);
  res.json(rows);
});

app.get('/api/acknowledgments/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM acknowledgments WHERE id = ?').get(toId(req.params.id));
  if (!row) return res.status(404).json({ error: 'Acknowledgment not found' });
  res.json(row);
});

app.post('/api/acknowledgments', (req, res) => {
  const db = getDb();
  const { documentId, userId, acknowledged, comment } = req.body as {
    documentId: number;
    userId: number;
    acknowledged?: number;
    comment?: string;
  };
  if (!documentId || !userId) return res.status(400).json({ error: 'documentId and userId are required' });
  try {
    const result = db
      .prepare(
        `INSERT INTO acknowledgments (document_id, user_id, acknowledged, comment)
         VALUES (?, ?, ?, ?)`
      )
      .run(documentId, userId, acknowledged ?? 1, comment ?? null);
    const created = db.prepare('SELECT * FROM acknowledgments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.put('/api/acknowledgments/:id', (req, res) => {
  const db = getDb();
  const id = toId(req.params.id);
  const { acknowledged, comment } = req.body as { acknowledged?: number; comment?: string | null };
  const existing = db.prepare('SELECT id FROM acknowledgments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Acknowledgment not found' });
  db.prepare(
    `UPDATE acknowledgments
     SET acknowledged = COALESCE(?, acknowledged),
         comment = COALESCE(?, comment)
     WHERE id = ?`
  ).run(acknowledged ?? null, comment ?? null, id);
  const updated = db.prepare('SELECT * FROM acknowledgments WHERE id = ?').get(id);
  res.json(updated);
});

app.delete('/api/acknowledgments/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM acknowledgments WHERE id = ?').run(toId(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'Acknowledgment not found' });
  res.status(204).send();
});

app.get('/api/activity-feed', (req, res) => {
  const db = getDb();
  const entityType = req.query.entityType ? String(req.query.entityType) : null;
  const entityId = req.query.entityId ? toId(String(req.query.entityId)) : null;
  const rows = db
    .prepare(
      `SELECT af.*, u.full_name AS actor_name
       FROM activity_feed af
       LEFT JOIN users u ON u.id = af.actor_user_id
       WHERE (? IS NULL OR af.entity_type = ?)
         AND (? IS NULL OR af.entity_id = ?)
       ORDER BY af.created_at DESC`
    )
    .all(entityType, entityType, entityId, entityId);
  res.json(rows);
});

app.get('/api/activity-feed/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM activity_feed WHERE id = ?').get(toId(req.params.id));
  if (!row) return res.status(404).json({ error: 'Activity item not found' });
  res.json(row);
});

app.post('/api/activity-feed', (req, res) => {
  const db = getDb();
  const { entityType, entityId, message, actorUserId } = req.body as {
    entityType: string;
    entityId: number;
    message: string;
    actorUserId?: number | null;
  };
  if (!entityType || !entityId || !message?.trim()) {
    return res.status(400).json({ error: 'entityType, entityId and message are required' });
  }
  try {
    const result = db
      .prepare(
        `INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id)
         VALUES (?, ?, ?, ?)`
      )
      .run(entityType, entityId, message.trim(), actorUserId ?? null);
    const created = db.prepare('SELECT * FROM activity_feed WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.put('/api/activity-feed/:id', (req, res) => {
  const db = getDb();
  const id = toId(req.params.id);
  const { message } = req.body as { message?: string };
  const existing = db.prepare('SELECT id FROM activity_feed WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Activity item not found' });
  db.prepare('UPDATE activity_feed SET message = COALESCE(?, message) WHERE id = ?').run(
    message?.trim() ?? null,
    id
  );
  const updated = db.prepare('SELECT * FROM activity_feed WHERE id = ?').get(id);
  res.json(updated);
});

app.delete('/api/activity-feed/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM activity_feed WHERE id = ?').run(toId(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'Activity item not found' });
  res.status(204).send();
});

app.get('/api/ticket-trend', (req, res) => {
  const db = getDb();
  const teamId = req.query.teamId ? toId(String(req.query.teamId)) : null;
  const rows = db
    .prepare(
      `SELECT tt.*, t.name AS team_name
       FROM ticket_trend tt
       INNER JOIN teams t ON t.id = tt.team_id
       WHERE (? IS NULL OR tt.team_id = ?)
       ORDER BY tt.day ASC, t.name ASC`
    )
    .all(teamId, teamId);
  res.json(rows);
});

app.get('/api/ticket-trend/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ticket_trend WHERE id = ?').get(toId(req.params.id));
  if (!row) return res.status(404).json({ error: 'Trend item not found' });
  res.json(row);
});

app.post('/api/ticket-trend', (req, res) => {
  const db = getDb();
  const { teamId, day, ticketCount } = req.body as { teamId: number; day: string; ticketCount: number };
  if (!teamId || !day || ticketCount === undefined) {
    return res.status(400).json({ error: 'teamId, day and ticketCount are required' });
  }
  try {
    const result = db
      .prepare('INSERT INTO ticket_trend (team_id, day, ticket_count) VALUES (?, ?, ?)')
      .run(teamId, day, ticketCount);
    const created = db.prepare('SELECT * FROM ticket_trend WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.put('/api/ticket-trend/:id', (req, res) => {
  const db = getDb();
  const id = toId(req.params.id);
  const { teamId, day, ticketCount } = req.body as {
    teamId?: number;
    day?: string;
    ticketCount?: number;
  };
  const existing = db.prepare('SELECT id FROM ticket_trend WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Trend item not found' });
  try {
    db.prepare(
      `UPDATE ticket_trend
       SET team_id = COALESCE(?, team_id),
           day = COALESCE(?, day),
           ticket_count = COALESCE(?, ticket_count)
       WHERE id = ?`
    ).run(teamId ?? null, day ?? null, ticketCount ?? null, id);
    const updated = db.prepare('SELECT * FROM ticket_trend WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.delete('/api/ticket-trend/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM ticket_trend WHERE id = ?').run(toId(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'Trend item not found' });
  res.status(204).send();
});

app.get('/api/reports/compliance', (req, res) => {
  const db = getDb();
  const schoolId = req.query.schoolId ? Number(req.query.schoolId) : null;
  const userTypeId = req.query.userTypeId ? Number(req.query.userTypeId) : null;
  const status = req.query.status ? String(req.query.status).toUpperCase() : null;

  const rows = (db
    .prepare(
      `SELECT
          d.id AS document_id,
          d.title AS document_title,
          d.due_date,
          tm.name AS team_name,
          u.id AS user_id,
          u.full_name,
          s.name AS school_name,
          ut.name AS user_type_name,
          CASE
            WHEN a.id IS NOT NULL THEN 'COMPLETED'
            WHEN date(d.due_date) < date('now') THEN 'OVERDUE'
            ELSE 'PENDING'
          END AS completion_status,
          a.acknowledged_at
       FROM documents d
       INNER JOIN teams tm ON tm.id = d.team_id
       INNER JOIN document_user_types dut ON dut.document_id = d.id
       INNER JOIN users u ON u.user_type_id = dut.user_type_id
       LEFT JOIN schools s ON s.id = u.school_id
       LEFT JOIN user_types ut ON ut.id = u.user_type_id
       LEFT JOIN acknowledgments a ON a.document_id = d.id AND a.user_id = u.id
       WHERE (? IS NULL OR u.school_id = ?)
         AND (? IS NULL OR u.user_type_id = ?)
       ORDER BY d.due_date ASC, u.full_name ASC`
    )
    .all(schoolId, schoolId, userTypeId, userTypeId) as Array<{ completion_status: string }>)
    .filter((row) => (status ? row.completion_status === status : true));

  res.json(rows);
});

// ─── Form Templates ───────────────────────────────────────────────────────────

app.get('/api/form-templates', (req, res) => {
  const db = getDb();
  const actorUserId = req.query.actorUserId ? toId(String(req.query.actorUserId)) : 0;
  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });

  const actor = db.prepare('SELECT id, role FROM users WHERE id = ?').get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor not found' });
  if (actor.role !== 'ADMINISTRATOR' && actor.role !== 'TEAM_MANAGER') {
    return res.status(403).json({ error: 'Only Administrators and Team Managers can view templates' });
  }

  const rows = db.prepare(`
    SELECT ft.id, ft.created_by_user_id, ft.is_active, ft.created_at, ft.updated_at,
           u.full_name AS created_by_name,
           ftv.id AS latest_version_id, ftv.version_number, ftv.title,
           ftv.description, ftv.status, ftv.created_at AS version_created_at
    FROM form_templates ft
    LEFT JOIN users u ON u.id = ft.created_by_user_id
    LEFT JOIN form_template_versions ftv ON ftv.id = (
      SELECT id FROM form_template_versions
      WHERE template_id = ft.id
      ORDER BY version_number DESC LIMIT 1
    )
    WHERE ft.is_active = 1
    ORDER BY ft.updated_at DESC
  `).all();

  res.json(rows);
});

app.post('/api/form-templates', (req, res) => {
  const db = getDb();
  const { actorUserId, title, description, status, fields } = req.body as {
    actorUserId: number;
    title: string;
    description?: string;
    status?: string;
    fields?: Array<{
      field_key: string;
      label: string;
      help_text?: string;
      field_type: string;
      is_required?: number;
      sort_order?: number;
      config_json?: string;
    }>;
  };

  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

  const actor = db.prepare('SELECT id, role FROM users WHERE id = ?').get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor not found' });
  if (actor.role !== 'ADMINISTRATOR' && actor.role !== 'TEAM_MANAGER') {
    return res.status(403).json({ error: 'Only Administrators and Team Managers can create templates' });
  }

  try {
    const templateResult = db.prepare(
      `INSERT INTO form_templates (created_by_user_id, updated_at) VALUES (?, datetime('now'))`
    ).run(actorUserId);
    const templateId = Number(templateResult.lastInsertRowid);

    const versionResult = db.prepare(
      `INSERT INTO form_template_versions (template_id, version_number, title, description, status, created_by_user_id)
       VALUES (?, 1, ?, ?, ?, ?)`
    ).run(templateId, title.trim(), description ?? '', status ?? 'draft', actorUserId);
    const versionId = Number(versionResult.lastInsertRowid);

    if (Array.isArray(fields) && fields.length > 0) {
      const insertField = db.prepare(
        `INSERT INTO form_template_fields (template_version_id, field_key, label, help_text, field_type, is_required, sort_order, config_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      fields.forEach((f, i) => {
        insertField.run(versionId, f.field_key || `field_${i + 1}`, f.label, f.help_text ?? '', f.field_type, f.is_required ?? 0, f.sort_order ?? i, f.config_json ?? '{}');
      });
    }

    db.prepare(
      `INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id) VALUES ('FORM_TEMPLATE', ?, ?, ?)`
    ).run(templateId, `Form template "${title.trim()}" created (v1).`, actorUserId);

    db.prepare(`UPDATE form_templates SET updated_at = datetime('now') WHERE id = ?`).run(templateId);

    res.status(201).json({ id: templateId, versionId });
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.get('/api/form-templates/:id', (req, res) => {
  const db = getDb();
  const id = toId(req.params.id);
  const actorUserId = req.query.actorUserId ? toId(String(req.query.actorUserId)) : 0;

  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });

  const actor = db.prepare('SELECT id, role FROM users WHERE id = ?').get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor not found' });
  if (actor.role !== 'ADMINISTRATOR' && actor.role !== 'TEAM_MANAGER') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const template = db.prepare(`
    SELECT ft.*, u.full_name AS created_by_name
    FROM form_templates ft
    LEFT JOIN users u ON u.id = ft.created_by_user_id
    WHERE ft.id = ?
  `).get(id) as Record<string, unknown> | undefined;

  if (!template) return res.status(404).json({ error: 'Template not found' });

  const versions = db.prepare(`
    SELECT ftv.*, u.full_name AS created_by_name
    FROM form_template_versions ftv
    LEFT JOIN users u ON u.id = ftv.created_by_user_id
    WHERE ftv.template_id = ?
    ORDER BY ftv.version_number DESC
  `).all(id);

  const latestVersionId = versions.length > 0 ? (versions[0] as Record<string, unknown>).id : null;
  const latestFields = latestVersionId
    ? db.prepare('SELECT * FROM form_template_fields WHERE template_version_id = ? ORDER BY sort_order ASC').all(latestVersionId)
    : [];

  res.json({ ...template, versions, latestFields });
});

app.put('/api/form-templates/:id', (req, res) => {
  const db = getDb();
  const templateId = toId(req.params.id);
  const { actorUserId, title, description, status } = req.body as {
    actorUserId?: number;
    title?: string;
    description?: string;
    status?: string;
  };

  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (status && !['draft', 'published', 'archived'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const actor = db.prepare('SELECT id, role FROM users WHERE id = ?').get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor not found' });
  if (actor.role !== 'ADMINISTRATOR' && actor.role !== 'TEAM_MANAGER') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const template = db.prepare('SELECT id FROM form_templates WHERE id = ? AND is_active = 1').get(templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const latestVersion = db.prepare(`
    SELECT id, version_number
    FROM form_template_versions
    WHERE template_id = ?
    ORDER BY version_number DESC
    LIMIT 1
  `).get(templateId) as { id: number; version_number: number } | undefined;
  if (!latestVersion) return res.status(404).json({ error: 'Template version not found' });

  try {
    db.prepare(`
      UPDATE form_template_versions
      SET title = ?,
          description = ?,
          status = ?
      WHERE id = ?
    `).run(title.trim(), description ?? '', status ?? 'draft', latestVersion.id);

    db.prepare(`UPDATE form_templates SET updated_at = datetime('now') WHERE id = ?`).run(templateId);
    db.prepare(
      `INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id) VALUES ('FORM_TEMPLATE', ?, ?, ?)`
    ).run(templateId, `Form template metadata updated in v${latestVersion.version_number}.`, actorUserId);

    res.json({ success: true, versionId: latestVersion.id, versionNumber: latestVersion.version_number });
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.post('/api/form-templates/:id/versions', (req, res) => {
  const db = getDb();
  const templateId = toId(req.params.id);
  const { actorUserId, title, description, status, fields } = req.body as {
    actorUserId: number;
    title: string;
    description?: string;
    status?: string;
    fields?: Array<{
      field_key: string;
      label: string;
      help_text?: string;
      field_type: string;
      is_required?: number;
      sort_order?: number;
      config_json?: string;
    }>;
  };

  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

  const actor = db.prepare('SELECT id, role FROM users WHERE id = ?').get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor not found' });
  if (actor.role !== 'ADMINISTRATOR' && actor.role !== 'TEAM_MANAGER') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const template = db.prepare('SELECT id FROM form_templates WHERE id = ? AND is_active = 1').get(templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  try {
    const maxRow = db.prepare('SELECT MAX(version_number) AS max_v FROM form_template_versions WHERE template_id = ?').get(templateId) as { max_v: number };
    const nextVersion = (maxRow.max_v ?? 0) + 1;

    const versionResult = db.prepare(
      `INSERT INTO form_template_versions (template_id, version_number, title, description, status, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(templateId, nextVersion, title.trim(), description ?? '', status ?? 'draft', actorUserId);
    const versionId = Number(versionResult.lastInsertRowid);

    if (Array.isArray(fields) && fields.length > 0) {
      const insertField = db.prepare(
        `INSERT INTO form_template_fields (template_version_id, field_key, label, help_text, field_type, is_required, sort_order, config_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      fields.forEach((f, i) => {
        insertField.run(versionId, f.field_key || `field_${i + 1}`, f.label, f.help_text ?? '', f.field_type, f.is_required ?? 0, f.sort_order ?? i, f.config_json ?? '{}');
      });
    }

    db.prepare(`UPDATE form_templates SET updated_at = datetime('now') WHERE id = ?`).run(templateId);
    db.prepare(
      `INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id) VALUES ('FORM_TEMPLATE', ?, ?, ?)`
    ).run(templateId, `Form template updated — v${nextVersion} created by ${actor.id}.`, actorUserId);

    res.status(201).json({ versionId, versionNumber: nextVersion });
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.delete('/api/form-templates/:id', (req, res) => {
  const db = getDb();
  const id = toId(req.params.id);
  const { actorUserId } = req.body as { actorUserId?: number };
  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });

  const actor = db.prepare('SELECT id, role FROM users WHERE id = ?').get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor not found' });
  if (actor.role !== 'ADMINISTRATOR' && actor.role !== 'TEAM_MANAGER') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare(`UPDATE form_templates SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
  res.json({ success: true });
});

// ─── Form Assignments ────────────────────────────────────────────────────────

app.post('/api/form-assignments', (req, res) => {
  const db = getDb();
  const { actorUserId, templateId, templateVersionId, titleOverride, instructions, openAt, closeAt, userTypeIds, userIds } = req.body as {
    actorUserId: number;
    templateId: number;
    templateVersionId: number;
    titleOverride?: string;
    instructions?: string;
    openAt?: string;
    closeAt?: string;
    userTypeIds?: number[];
    userIds?: number[];
  };

  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });
  if (!templateId || !templateVersionId) return res.status(400).json({ error: 'templateId and templateVersionId are required' });

  const actor = db.prepare('SELECT id, role FROM users WHERE id = ?').get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor not found' });
  if (actor.role !== 'ADMINISTRATOR' && actor.role !== 'TEAM_MANAGER') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const version = db.prepare('SELECT id, title FROM form_template_versions WHERE id = ? AND template_id = ?').get(templateVersionId, templateId) as { id: number; title: string } | undefined;
  if (!version) return res.status(404).json({ error: 'Template version not found' });

  try {
    const result = db.prepare(
      `INSERT INTO form_assignments (template_id, template_version_id, assigned_by_user_id, title_override, instructions, open_at, close_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(templateId, templateVersionId, actorUserId, titleOverride?.trim() || null, instructions ?? '', openAt || null, closeAt || null);
    const assignmentId = Number(result.lastInsertRowid);

    const normalizedUserTypeIds = Array.isArray(userTypeIds)
      ? [...new Set(userTypeIds.map(Number).filter((n) => n > 0))]
      : [];
    const normalizedUserIds = Array.isArray(userIds)
      ? [...new Set(userIds.map(Number).filter((n) => n > 0))]
      : [];

    const insertUt = db.prepare('INSERT OR IGNORE INTO form_assignment_user_types (assignment_id, user_type_id) VALUES (?, ?)');
    normalizedUserTypeIds.forEach((utId) => insertUt.run(assignmentId, utId));

    const insertU = db.prepare('INSERT OR IGNORE INTO form_assignment_users (assignment_id, user_id) VALUES (?, ?)');
    normalizedUserIds.forEach((uId) => insertU.run(assignmentId, uId));

    db.prepare(
      `INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id) VALUES ('FORM_ASSIGNMENT', ?, ?, ?)`
    ).run(assignmentId, `Form "${version.title}" assigned to ${normalizedUserTypeIds.length} user type(s) and ${normalizedUserIds.length} user(s).`, actorUserId);

    res.status(201).json({ id: assignmentId });
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.get('/api/form-assignments', (req, res) => {
  const db = getDb();
  const actorUserId = req.query.actorUserId ? toId(String(req.query.actorUserId)) : 0;
  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });

  const actor = db.prepare('SELECT id, role FROM users WHERE id = ?').get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor not found' });
  if (actor.role !== 'ADMINISTRATOR' && actor.role !== 'TEAM_MANAGER') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const templateIdFilter = req.query.templateId ? toId(String(req.query.templateId)) : 0;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (actor.role !== 'ADMINISTRATOR') { conditions.push('fa.assigned_by_user_id = ?'); params.push(actorUserId); }
  if (templateIdFilter) { conditions.push('fa.template_id = ?'); params.push(templateIdFilter); }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT fa.id, fa.template_id, fa.template_version_id, fa.assigned_by_user_id, fa.title_override,
           fa.instructions, fa.open_at, fa.close_at, fa.created_at,
           u.full_name AS assigned_by_name,
           ftv.title AS template_title, ftv.version_number,
           (SELECT COUNT(*) FROM form_responses fr WHERE fr.assignment_id = fa.id) AS response_count,
           (SELECT COUNT(*) FROM form_responses fr WHERE fr.assignment_id = fa.id AND fr.status = 'submitted') AS submitted_count
    FROM form_assignments fa
    LEFT JOIN users u ON u.id = fa.assigned_by_user_id
    LEFT JOIN form_template_versions ftv ON ftv.id = fa.template_version_id
    ${whereClause}
    ORDER BY fa.created_at DESC
  `).all(...params);

  res.json(rows);
});

app.get('/api/form-assignments/for-user', (req, res) => {
  const db = getDb();
  const userId = req.query.userId ? toId(String(req.query.userId)) : 0;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const user = db.prepare('SELECT id, user_type_id FROM users WHERE id = ? AND is_active = 1').get(userId) as { id: number; user_type_id: number | null } | undefined;
  if (!user) return res.status(404).json({ error: 'User not found' });

  const rows = db.prepare(`
    SELECT DISTINCT fa.id, fa.template_id, fa.template_version_id, fa.assigned_by_user_id,
           fa.title_override, fa.instructions, fa.open_at, fa.close_at, fa.created_at,
           ftv.title AS template_title, ftv.version_number, ftv.description,
           fr.id AS response_id, fr.status AS response_status,
           fr.first_submitted_at, fr.last_submitted_at, fr.last_edited_at
    FROM form_assignments fa
    INNER JOIN form_template_versions ftv ON ftv.id = fa.template_version_id
    LEFT JOIN form_responses fr ON fr.assignment_id = fa.id AND fr.user_id = ?
    WHERE fa.id IN (
      SELECT assignment_id FROM form_assignment_users WHERE user_id = ?
      UNION
      SELECT assignment_id FROM form_assignment_user_types WHERE user_type_id = ?
    )
      AND fa.id NOT IN (
        SELECT assignment_id FROM form_assignment_dismissals WHERE user_id = ?
      )
    ORDER BY fa.created_at DESC
  `).all(userId, userId, user.user_type_id ?? -1, userId);

  res.json(rows);
});

app.delete('/api/form-assignments/:id/for-user', (req, res) => {
  const db = getDb();
  const assignmentId = toId(req.params.id);
  const actorUserId = req.query.actorUserId ? toId(String(req.query.actorUserId)) : 0;
  const userId = req.query.userId ? toId(String(req.query.userId)) : 0;

  if (!assignmentId || !actorUserId || !userId) {
    return res.status(400).json({ error: 'assignmentId, actorUserId, and userId are required' });
  }

  const actor = db.prepare('SELECT id, role, user_type_id FROM users WHERE id = ? AND is_active = 1').get(actorUserId) as {
    id: number;
    role: string;
    user_type_id: number | null;
  } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor not found' });
  if (actor.role !== 'USER' || actor.id !== userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const assignment = db.prepare(`
    SELECT fa.id, ftv.title AS template_title
    FROM form_assignments fa
    INNER JOIN form_template_versions ftv ON ftv.id = fa.template_version_id
    WHERE fa.id = ?
      AND fa.id IN (
        SELECT assignment_id FROM form_assignment_users WHERE user_id = ?
        UNION
        SELECT assignment_id FROM form_assignment_user_types WHERE user_type_id = ?
      )
  `).get(assignmentId, userId, actor.user_type_id ?? -1) as { id: number; template_title: string } | undefined;

  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

  try {
    const response = db.prepare('SELECT id FROM form_responses WHERE assignment_id = ? AND user_id = ?').get(assignmentId, userId) as { id: number } | undefined;

    db.prepare(
      `INSERT INTO form_assignment_dismissals (assignment_id, user_id)
       VALUES (?, ?)
       ON CONFLICT(assignment_id, user_id) DO UPDATE SET dismissed_at = datetime('now')`
    ).run(assignmentId, userId);

    if (response) {
      db.prepare('DELETE FROM form_responses WHERE id = ?').run(response.id);
    }

    db.prepare(
      `INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id)
       VALUES ('FORM_ASSIGNMENT', ?, ?, ?)`
    ).run(assignmentId, `Form "${assignment.template_title}" removed from My Forms by user ${userId}.`, actorUserId);

    res.json({ success: true });
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.get('/api/form-assignments/:id', (req, res) => {
  const db = getDb();
  const id = toId(req.params.id);
  const actorUserId = req.query.actorUserId ? toId(String(req.query.actorUserId)) : 0;

  const assignment = db.prepare(`
    SELECT fa.*, ftv.title AS template_title, ftv.version_number, ftv.description AS template_description,
           u.full_name AS assigned_by_name
    FROM form_assignments fa
    INNER JOIN form_template_versions ftv ON ftv.id = fa.template_version_id
    LEFT JOIN users u ON u.id = fa.assigned_by_user_id
    WHERE fa.id = ?
  `).get(id) as Record<string, unknown> | undefined;

  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

  const fields = db.prepare(
    'SELECT * FROM form_template_fields WHERE template_version_id = ? ORDER BY sort_order ASC'
  ).all(assignment.template_version_id as number);

  const userTypeIds = (db.prepare('SELECT user_type_id FROM form_assignment_user_types WHERE assignment_id = ?').all(id) as Array<{ user_type_id: number }>).map((r) => r.user_type_id);
  const userIds = (db.prepare('SELECT user_id FROM form_assignment_users WHERE assignment_id = ?').all(id) as Array<{ user_id: number }>).map((r) => r.user_id);

  let userResponse: Record<string, unknown> | null = null;
  if (actorUserId) {
    userResponse = db.prepare('SELECT * FROM form_responses WHERE assignment_id = ? AND user_id = ?').get(id, actorUserId) as Record<string, unknown> | null ?? null;
  }

  res.json({ ...assignment, fields, userTypeIds, userIds, userResponse });
});

// ─── Form Responses ──────────────────────────────────────────────────────────

app.get('/api/form-responses', (req, res) => {
  const db = getDb();
  const assignmentId = req.query.assignmentId ? toId(String(req.query.assignmentId)) : 0;
  const userId = req.query.userId ? toId(String(req.query.userId)) : 0;

  if (!assignmentId || !userId) return res.status(400).json({ error: 'assignmentId and userId are required' });

  const response = db.prepare(`
    SELECT fr.*, u.full_name AS user_name
    FROM form_responses fr
    LEFT JOIN users u ON u.id = fr.user_id
    WHERE fr.assignment_id = ? AND fr.user_id = ?
  `).get(assignmentId, userId) as Record<string, unknown> | undefined;

  if (!response) return res.json(null);

  const answers = db.prepare('SELECT * FROM form_response_answers WHERE response_id = ?').all(response.id as number);
  const revisions = db.prepare(`
    SELECT frr.*, u.full_name AS edited_by_name
    FROM form_response_revisions frr
    LEFT JOIN users u ON u.id = frr.edited_by_user_id
    WHERE frr.response_id = ?
    ORDER BY frr.revision_number ASC
  `).all(response.id as number);

  res.json({ ...response, answers, revisions });
});

app.get('/api/form-responses/assignment/:assignmentId', (req, res) => {
  const db = getDb();
  const assignmentId = toId(req.params.assignmentId);
  const actorUserId = req.query.actorUserId ? toId(String(req.query.actorUserId)) : 0;

  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });

  const actor = db.prepare('SELECT id, role FROM users WHERE id = ?').get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor not found' });

  const assignment = db.prepare('SELECT * FROM form_assignments WHERE id = ?').get(assignmentId) as { assigned_by_user_id: number } | undefined;
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

  if (actor.role !== 'ADMINISTRATOR' && actor.id !== assignment.assigned_by_user_id) {
    return res.status(403).json({ error: 'Not authorized to view responses for this assignment' });
  }

  const rows = db.prepare(`
    SELECT fr.*, u.full_name AS user_name, s.name AS school_name, ut.name AS user_type_name
    FROM form_responses fr
    LEFT JOIN users u ON u.id = fr.user_id
    LEFT JOIN schools s ON s.id = u.school_id
    LEFT JOIN user_types ut ON ut.id = u.user_type_id
    WHERE fr.assignment_id = ?
    ORDER BY fr.last_submitted_at DESC, fr.created_at DESC
  `).all(assignmentId);

  res.json(rows);
});

app.get('/api/form-responses/:id', (req, res) => {
  const db = getDb();
  const responseId = toId(req.params.id);
  const actorUserId = req.query.actorUserId ? toId(String(req.query.actorUserId)) : 0;

  const response = db.prepare(`
    SELECT fr.*, u.full_name AS user_name
    FROM form_responses fr
    LEFT JOIN users u ON u.id = fr.user_id
    WHERE fr.id = ?
  `).get(responseId) as Record<string, unknown> | undefined;

  if (!response) return res.status(404).json({ error: 'Response not found' });

  if (actorUserId) {
    const actor = db.prepare('SELECT id, role FROM users WHERE id = ?').get(actorUserId) as { id: number; role: string } | undefined;
    if (actor && actor.role !== 'ADMINISTRATOR' && actor.id !== (response.user_id as number)) {
      const assignment = db.prepare('SELECT assigned_by_user_id FROM form_assignments WHERE id = ?').get(response.assignment_id as number) as { assigned_by_user_id: number } | undefined;
      if (!assignment || assignment.assigned_by_user_id !== actor.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }
    }
  }

  const answers = db.prepare('SELECT * FROM form_response_answers WHERE response_id = ?').all(responseId);
  const revisions = db.prepare(`
    SELECT frr.*, u.full_name AS edited_by_name
    FROM form_response_revisions frr
    LEFT JOIN users u ON u.id = frr.edited_by_user_id
    WHERE frr.response_id = ?
    ORDER BY frr.revision_number ASC
  `).all(responseId);

  res.json({ ...response, answers, revisions });
});

app.post('/api/form-responses', (req, res) => {
  const db = getDb();
  const { actorUserId, assignmentId, userId, answers, submit } = req.body as {
    actorUserId: number;
    assignmentId: number;
    userId: number;
    answers?: Array<{ fieldId: number; valueText: string; valueJson?: string }>;
    submit?: boolean;
  };

  if (!actorUserId || !assignmentId || !userId) {
    return res.status(400).json({ error: 'actorUserId, assignmentId, and userId are required' });
  }

  const actor = db.prepare('SELECT id, role FROM users WHERE id = ?').get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor not found' });
  if (actor.role !== 'USER' && actor.id !== userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const assignment = db.prepare(`
    SELECT fa.id, fa.template_id, fa.template_version_id, fa.assigned_by_user_id
    FROM form_assignments fa WHERE fa.id = ?
  `).get(assignmentId) as { id: number; template_id: number; template_version_id: number; assigned_by_user_id: number } | undefined;

  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

  const existing = db.prepare('SELECT id FROM form_responses WHERE assignment_id = ? AND user_id = ?').get(assignmentId, userId);
  if (existing) return res.status(409).json({ error: 'Response already exists. Use PUT to update.' });

  try {
    const now = `datetime('now')`;
    const submitFields = submit
      ? `, 'submitted', ${now}, ${now}`
      : `, 'draft', NULL, NULL`;

    const result = db.prepare(`
      INSERT INTO form_responses
        (assignment_id, template_id, template_version_id, user_id, status, first_submitted_at, last_submitted_at, submitted_to_user_id, updated_at)
      VALUES (?, ?, ?, ?, ${submit ? "'submitted'" : "'draft'"}, ${submit ? "datetime('now')" : 'NULL'}, ${submit ? "datetime('now')" : 'NULL'}, ?, datetime('now'))
    `).run(assignmentId, assignment.template_id, assignment.template_version_id, userId, assignment.assigned_by_user_id);

    const responseId = Number(result.lastInsertRowid);

    if (Array.isArray(answers) && answers.length > 0) {
      const insertAnswer = db.prepare(
        'INSERT INTO form_response_answers (response_id, field_id, value_text, value_json) VALUES (?, ?, ?, ?)'
      );
      answers.forEach((a) => insertAnswer.run(responseId, a.fieldId, a.valueText ?? '', a.valueJson ?? null));
    }

    if (submit) {
      db.prepare(
        `INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id) VALUES ('FORM_RESPONSE', ?, ?, ?)`
      ).run(responseId, `Form response submitted by user ${userId}.`, actorUserId);
    }

    res.status(201).json({ id: responseId });
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.put('/api/form-responses/:id', (req, res) => {
  const db = getDb();
  const responseId = toId(req.params.id);
  const { actorUserId, answers, changeSummary, submit } = req.body as {
    actorUserId: number;
    answers?: Array<{ fieldId: number; valueText: string; valueJson?: string }>;
    changeSummary?: string;
    submit?: boolean;
  };

  if (!actorUserId) return res.status(400).json({ error: 'actorUserId is required' });

  const response = db.prepare('SELECT * FROM form_responses WHERE id = ?').get(responseId) as Record<string, unknown> | undefined;
  if (!response) return res.status(404).json({ error: 'Response not found' });

  const actor = db.prepare('SELECT id, role FROM users WHERE id = ?').get(actorUserId) as { id: number; role: string } | undefined;
  if (!actor) return res.status(404).json({ error: 'Actor not found' });
  if (actor.id !== (response.user_id as number)) {
    return res.status(403).json({ error: 'Only the response owner can edit it' });
  }

  try {
    const maxRevRow = db.prepare('SELECT MAX(revision_number) AS max_r FROM form_response_revisions WHERE response_id = ?').get(responseId) as { max_r: number };
    const nextRevision = (maxRevRow.max_r ?? 0) + 1;

    const oldAnswers = db.prepare('SELECT * FROM form_response_answers WHERE response_id = ?').all(responseId);
    db.prepare('INSERT INTO form_response_revisions (response_id, edited_by_user_id, revision_number, change_summary, snapshot_json) VALUES (?, ?, ?, ?, ?)').run(
      responseId, actorUserId, nextRevision, changeSummary ?? '', JSON.stringify(oldAnswers)
    );

    db.prepare('DELETE FROM form_response_answers WHERE response_id = ?').run(responseId);

    if (Array.isArray(answers) && answers.length > 0) {
      const insertAnswer = db.prepare(
        'INSERT INTO form_response_answers (response_id, field_id, value_text, value_json) VALUES (?, ?, ?, ?)'
      );
      answers.forEach((a) => insertAnswer.run(responseId, a.fieldId, a.valueText ?? '', a.valueJson ?? null));
    }

    db.prepare(`
      UPDATE form_responses
      SET last_edited_at = datetime('now'),
          last_submitted_at = CASE WHEN ? = 1 THEN datetime('now') ELSE last_submitted_at END,
          status = CASE WHEN ? = 1 THEN 'submitted' ELSE status END,
          first_submitted_at = CASE WHEN first_submitted_at IS NULL AND ? = 1 THEN datetime('now') ELSE first_submitted_at END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(submit ? 1 : 0, submit ? 1 : 0, submit ? 1 : 0, responseId);

    db.prepare(
      `INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id) VALUES ('FORM_RESPONSE', ?, ?, ?)`
    ).run(responseId, `Form response updated (revision ${nextRevision}).`, actorUserId);

    res.json({ id: responseId, revisionNumber: nextRevision });
  } catch (error) {
    sendSqlError(res, error);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// SPA fallback — must be last, after all API routes
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api')) return next();
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}
