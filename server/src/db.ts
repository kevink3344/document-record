import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../../data/document-record.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    seedIfEmpty();
  }
  return db;
}

function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      manager_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (manager_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('ADMINISTRATOR', 'TEAM_MANAGER', 'USER')),
      school_id INTEGER,
      user_type_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (user_type_id) REFERENCES user_types(id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      document_type TEXT NOT NULL DEFAULT 'PDF',
      schedule TEXT NOT NULL CHECK (schedule IN ('MONTHLY', 'QUARTERLY', 'YEARLY')),
      due_date TEXT NOT NULL,
      end_date TEXT,
      file_url TEXT,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS document_user_types (
      document_id INTEGER NOT NULL,
      user_type_id INTEGER NOT NULL,
      PRIMARY KEY (document_id, user_type_id),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (user_type_id) REFERENCES user_types(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS acknowledgments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 1,
      acknowledged_at TEXT NOT NULL DEFAULT (datetime('now')),
      comment TEXT,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_feed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      actor_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ticket_trend (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      ticket_count INTEGER NOT NULL,
      UNIQUE(team_id, day),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );
  `);
}

function seedIfEmpty(): void {
  const count = db.prepare('SELECT COUNT(*) AS count FROM teams').get() as { count: number };
  if (count.count > 0) return;

  const insertTeam = db.prepare('INSERT INTO teams (name) VALUES (?)');
  const insertUserType = db.prepare('INSERT INTO user_types (name) VALUES (?)');
  const insertSchool = db.prepare('INSERT INTO schools (name) VALUES (?)');

  const teams = [
    'Security',
    'Crisis Response',
    'Suicide Response',
    'Safety Plan',
    'Risk Management',
    'Blood / Health',
  ];
  const userTypes = ['Principal', 'Vice Principal', 'Teacher', 'Secretary', 'Coordinator', 'Coach'];
  const schools = ['North Ridge High', 'West Lake Middle', 'Cedar Grove Elementary'];

  teams.forEach((name) => insertTeam.run(name));
  userTypes.forEach((name) => insertUserType.run(name));
  schools.forEach((name) => insertSchool.run(name));

  const insertUser = db.prepare(
    `INSERT INTO users (full_name, email, role, school_id, user_type_id)
     VALUES (?, ?, ?, ?, ?)`
  );

  insertUser.run('System Administrator', 'admin@docrecord.local', 'ADMINISTRATOR', 1, 1);
  insertUser.run('Maya Carter', 'manager.security@docrecord.local', 'TEAM_MANAGER', 1, 2);
  insertUser.run('Jon Rivera', 'manager.risk@docrecord.local', 'TEAM_MANAGER', 2, 4);
  insertUser.run('Avery Stone', 'avery.stone@docrecord.local', 'USER', 1, 3);
  insertUser.run('Sky Brooks', 'sky.brooks@docrecord.local', 'USER', 3, 6);

  db.prepare('UPDATE teams SET manager_user_id = ? WHERE id = ?').run(2, 1);
  db.prepare('UPDATE teams SET manager_user_id = ? WHERE id = ?').run(3, 5);

  const insertDocument = db.prepare(
    `INSERT INTO documents (
      team_id, title, description, content, document_type, schedule, due_date, end_date, file_url, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const now = new Date();
  const addDays = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };

  insertDocument.run(
    1,
    'Campus Security Drill Protocol',
    'Required annual review of emergency lockdown procedures.',
    'Review evacuation and lockdown responsibilities for each user type.',
    'PDF',
    'YEARLY',
    addDays(20),
    addDays(365),
    'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf',
    2
  );

  insertDocument.run(
    5,
    'Risk Incident Escalation Matrix',
    'Quarterly acknowledgment of escalation and reporting boundaries.',
    'Read and acknowledge matrix for risk thresholds and reporting windows.',
    'PDF',
    'QUARTERLY',
    addDays(-5),
    addDays(85),
    'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf',
    3
  );

  insertDocument.run(
    2,
    'Crisis Team Phone Tree',
    'Monthly update acknowledgement for contact chain integrity.',
    'Verify phone tree paths and escalation hierarchy.',
    'DOCX',
    'MONTHLY',
    addDays(6),
    addDays(30),
    null,
    2
  );

  const insertDocTypeLink = db.prepare(
    'INSERT INTO document_user_types (document_id, user_type_id) VALUES (?, ?)'
  );

  insertDocTypeLink.run(1, 1);
  insertDocTypeLink.run(1, 2);
  insertDocTypeLink.run(1, 4);
  insertDocTypeLink.run(2, 3);
  insertDocTypeLink.run(2, 6);
  insertDocTypeLink.run(3, 2);
  insertDocTypeLink.run(3, 3);
  insertDocTypeLink.run(3, 4);

  db.prepare(
    'INSERT INTO acknowledgments (document_id, user_id, acknowledged_at, comment) VALUES (?, ?, datetime("now", "-10 days"), ?)'
  ).run(1, 4, 'Read and completed during orientation');

  db.prepare(
    'INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id) VALUES (?, ?, ?, ?)'
  ).run('DOCUMENT', 1, 'Document published for Security team.', 2);
  db.prepare(
    'INSERT INTO activity_feed (entity_type, entity_id, message, actor_user_id) VALUES (?, ?, ?, ?)'
  ).run('DOCUMENT', 2, 'Due date updated and reissued to coaches and teachers.', 3);

  seedTrend();
}

function seedTrend(): void {
  const insertTrend = db.prepare(
    'INSERT OR REPLACE INTO ticket_trend (team_id, day, ticket_count) VALUES (?, ?, ?)'
  );
  const teamIds = [1, 2, 3, 4, 5, 6];
  const today = new Date();

  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    teamIds.forEach((teamId) => {
      const wave = Math.round(Math.abs(Math.sin((i + teamId) / 2)) * 10);
      const noise = ((teamId * 7 + i * 3) % 5) + 2;
      insertTrend.run(teamId, day, wave + noise);
    });
  }
}
