import express from 'express';
import cors from 'cors';
import { getDb } from './db';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

getDb();

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/lookups', (_req, res) => {
  const db = getDb();
  const teams = db.prepare('SELECT id, name, manager_user_id FROM teams ORDER BY name').all();
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

  const summary = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM documents) AS total_documents,
        (SELECT COUNT(*) FROM acknowledgments WHERE user_id = ?) AS completed,
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
    .get(user.id, user.user_type_id, user.user_type_id, user.id);

  const trend = db
    .prepare(
      `SELECT t.day, tm.name AS team_name, t.ticket_count
       FROM ticket_trend t
       INNER JOIN teams tm ON tm.id = t.team_id
       ORDER BY t.day ASC, tm.name ASC`
    )
    .all();

  const overdueList = db
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
    .all(user.user_type_id, user.id);

  res.json({ summary, trend, overdueList });
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

app.get('/api/documents/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
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

  const activity = db
    .prepare(
      `SELECT af.id, af.message, af.created_at, u.full_name AS actor_name
       FROM activity_feed af
       LEFT JOIN users u ON u.id = af.actor_user_id
       WHERE af.entity_type = 'DOCUMENT' AND af.entity_id = ?
       ORDER BY af.created_at DESC`
    )
    .all(id);

  const acknowledgments = db
    .prepare(
      `SELECT a.id, a.acknowledged_at, a.comment, u.full_name, s.name AS school_name, ut.name AS user_type_name
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

app.post('/api/documents/:id/acknowledge', (req, res) => {
  const db = getDb();
  const documentId = Number(req.params.id);
  const { userId, comment } = req.body as { userId: number; comment?: string };

  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const exists = db.prepare('SELECT id FROM documents WHERE id = ?').get(documentId);
  if (!exists) return res.status(404).json({ error: 'Document not found' });

  const already = db
    .prepare('SELECT id FROM acknowledgments WHERE document_id = ? AND user_id = ?')
    .get(documentId, userId);
  if (already) return res.status(200).json({ message: 'Already acknowledged' });

  db.prepare(
    `INSERT INTO acknowledgments (document_id, user_id, acknowledged, comment)
     VALUES (?, ?, 1, ?)`
  ).run(documentId, userId, comment ?? null);

  db.prepare(
    'INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id) VALUES (?, ?, ?, ?)'
  ).run('DOCUMENT', documentId, 'Document acknowledged by staff member.', userId);

  res.status(201).json({ message: 'Acknowledged' });
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
