import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import swaggerUi from 'swagger-ui-express';
import { load } from 'js-yaml';
import { getDb, seedTestDataIfEmpty } from './db';

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:5173'];

app.use(cors({ origin: (origin, cb) => {
  if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
  cb(new Error(`CORS: origin '${origin}' not allowed`));
}}));
app.use(express.json());

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
    schoolId: number;
    userTypeId: number;
  };

  if (!fullName?.trim() || !email?.trim() || !schoolId || !userTypeId) {
    return res.status(400).json({ error: 'fullName, email, schoolId and userTypeId are required' });
  }

  const result = db
    .prepare(
      `INSERT INTO users (full_name, email, role, school_id, user_type_id)
       VALUES (?, ?, 'USER', ?, ?)`
    )
    .run(fullName.trim(), email.trim().toLowerCase(), schoolId, userTypeId);

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

  if (!teamId || !title?.trim() || !schedule || !dueDate || !Array.isArray(userTypeIds) || !userTypeIds.length) {
    return res.status(400).json({ error: 'Missing required fields for document creation' });
  }

  const result = db
    .prepare(
      `INSERT INTO documents (
        team_id, title, description, content, document_type, schedule, due_date, end_date, file_url, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      teamId,
      title.trim(),
      description ?? '',
      content ?? '',
      documentType ?? 'PDF',
      schedule,
      dueDate,
      endDate ?? null,
      fileUrl ?? null,
      actorUserId ?? null
    );

  const linkStmt = db.prepare(
    'INSERT INTO document_user_types (document_id, user_type_id) VALUES (?, ?)'
  );
  userTypeIds.forEach((userTypeId) => linkStmt.run(result.lastInsertRowid, userTypeId));

  db.prepare(
    'INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id) VALUES (?, ?, ?, ?)'
  ).run('DOCUMENT', result.lastInsertRowid, 'Document created and assigned.', actorUserId ?? null);

  res.status(201).json({ id: result.lastInsertRowid });
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
      teamId ?? null,
      title?.trim() ?? null,
      description ?? null,
      content ?? null,
      documentType ?? null,
      schedule ?? null,
      dueDate ?? null,
      endDate ?? null,
      fileUrl ?? null,
      id
    );

    if (Array.isArray(userTypeIds) && userTypeIds.length) {
      db.prepare('DELETE FROM document_user_types WHERE document_id = ?').run(id);
      const mapStmt = db.prepare(
        'INSERT INTO document_user_types (document_id, user_type_id) VALUES (?, ?)'
      );
      userTypeIds.forEach((userTypeId) => mapStmt.run(id, userTypeId));
    }

    db.prepare(
      'INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id) VALUES (?, ?, ?, ?)'
    ).run('DOCUMENT', id, 'Document updated.', actorUserId ?? null);

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
