import express from 'express';
import cors from 'cors';
import { getDb } from './db';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// Initialize DB on startup
getDb();

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// GET all documents
app.get('/api/documents', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM documents ORDER BY updated_at DESC').all();
  res.json(rows);
});

// GET single document
app.get('/api/documents/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Document not found' });
  res.json(row);
});

// POST create document
app.post('/api/documents', (req, res) => {
  const { title, content = '' } = req.body as { title: string; content?: string };
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO documents (title, content) VALUES (?, ?)'
  ).run(title.trim(), content);
  const created = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT update document
app.put('/api/documents/:id', (req, res) => {
  const { title, content } = req.body as { title?: string; content?: string };
  const db = getDb();
  const existing = db.prepare('SELECT id FROM documents WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Document not found' });
  db.prepare(
    `UPDATE documents
     SET title      = COALESCE(?, title),
         content    = COALESCE(?, content),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(title ?? null, content ?? null, req.params.id);
  const updated = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE document
app.delete('/api/documents/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Document not found' });
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
