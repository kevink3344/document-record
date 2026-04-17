import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '../../data/document-record.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    ensureTeamDescriptionColumn();
    ensureAcknowledgmentSignatureColumns();
    ensureUserSignatureColumns();
    ensureAppSettingsDefaults();
    seedDatabaseAtStartupIfEnabled();
    syncTeamManagersFromLegacy();
  }
  return db;
}

function readBoolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function seedDatabaseAtStartupIfEnabled(): void {
  // Defaults: seed in non-production, skip in production unless explicitly enabled.
  const shouldSeed = readBoolEnv('DB_SEED_ON_STARTUP', process.env.NODE_ENV !== 'production');
  if (!shouldSeed) return;
  seedIfEmpty();
}

export function seedTestDataIfEmpty(): { seeded: boolean; reason: 'seeded' | 'already-has-data' } {
  const count = db.prepare('SELECT COUNT(*) AS count FROM teams').get() as { count: number };
  if (count.count > 0) {
    return { seeded: false, reason: 'already-has-data' };
  }
  seedIfEmpty();
  return { seeded: true, reason: 'seeded' };
}

export function addTestUser(): { success: boolean; userId?: number; message: string } {
  try {
    // Get or create schools if needed
    const schools = db.prepare('SELECT id FROM schools').all() as Array<{ id: number }>;
    const userTypes = db.prepare('SELECT id FROM user_types').all() as Array<{ id: number }>;

    if (schools.length === 0 || userTypes.length === 0) {
      return { success: false, message: 'Schools and user types must exist before adding users' };
    }

    const testUsers = [
      { full_name: 'Alice Johnson', email: 'alice.johnson@test.local', role: 'USER' },
      { full_name: 'Bob Martinez', email: 'bob.martinez@test.local', role: 'USER' },
      { full_name: 'Carol Smith', email: 'carol.smith@test.local', role: 'USER' },
      { full_name: 'David Lee', email: 'david.lee@test.local', role: 'TEAM_MANAGER' },
    ];

    const randomUser = testUsers[Math.floor(Math.random() * testUsers.length)];
    const randomSchool = schools[Math.floor(Math.random() * schools.length)];
    const randomUserType = userTypes[Math.floor(Math.random() * userTypes.length)];

    const result = db
      .prepare(
        `INSERT INTO users (full_name, email, role, school_id, user_type_id)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(randomUser.full_name, randomUser.email, randomUser.role, randomSchool.id, randomUserType.id);

    return {
      success: true,
      userId: Number(result.lastInsertRowid),
      message: `Test user "${randomUser.full_name}" added successfully.`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to add test user',
    };
  }
}

export function addTestDocument(): { success: boolean; documentId?: number; message: string } {
  try {
    const teams = db.prepare('SELECT id FROM teams').all() as Array<{ id: number }>;
    const userTypes = db.prepare('SELECT id FROM user_types').all() as Array<{ id: number }>;

    if (teams.length === 0 || userTypes.length === 0) {
      return { success: false, message: 'Teams and user types must exist before adding documents' };
    }

    const testDocuments = [
      {
        title: 'Annual Compliance Review',
        description: 'Yearly compliance checkpoint',
        schedule: 'YEARLY',
      },
      {
        title: 'Quarterly Safety Assessment',
        description: 'Quarterly safety review',
        schedule: 'QUARTERLY',
      },
      {
        title: 'Monthly Team Update',
        description: 'Monthly information update',
        schedule: 'MONTHLY',
      },
    ];

    const randomDoc = testDocuments[Math.floor(Math.random() * testDocuments.length)];
    const randomTeam = teams[Math.floor(Math.random() * teams.length)];
    const randomUserType = userTypes[Math.floor(Math.random() * userTypes.length)];

    const now = new Date();
    const addDays = (days: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      return d.toISOString();
    };

    const result = db
      .prepare(
        `INSERT INTO documents (
        team_id, title, description, content, document_type, schedule, due_date, end_date, file_url, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, null)`
      )
      .run(
        randomTeam.id,
        randomDoc.title,
        randomDoc.description,
        'Test document content',
        'PDF',
        randomDoc.schedule,
        addDays(15),
        addDays(365),
        'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf'
      );

    const docId = Number(result.lastInsertRowid);
    db.prepare('INSERT INTO document_user_types (document_id, user_type_id) VALUES (?, ?)').run(
      docId,
      randomUserType.id
    );

    return {
      success: true,
      documentId: docId,
      message: `Test document "${randomDoc.title}" added successfully.`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to add test document',
    };
  }
}

function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      manager_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (manager_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS team_managers (
      team_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (team_id, user_id),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_signatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      signature_data TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

function ensureTeamDescriptionColumn(): void {
  const columns = db.prepare("PRAGMA table_info('teams')").all() as Array<{ name: string }>;
  const hasDescription = columns.some((col) => col.name === 'description');
  if (!hasDescription) {
    db.exec("ALTER TABLE teams ADD COLUMN description TEXT NOT NULL DEFAULT '';");
  }
}

function syncTeamManagersFromLegacy(): void {
  db.exec(`
    INSERT OR IGNORE INTO team_managers (team_id, user_id)
    SELECT id, manager_user_id
    FROM teams
    WHERE manager_user_id IS NOT NULL;
  `);
}

function ensureAcknowledgmentSignatureColumns(): void {
  const columns = db.prepare("PRAGMA table_info('acknowledgments')").all() as Array<{ name: string }>;
  const hasSignatureData = columns.some((col) => col.name === 'signature_data');
  const hasSignedName = columns.some((col) => col.name === 'signed_name');
  const hasSignedAt = columns.some((col) => col.name === 'signed_at');

  if (!hasSignatureData) {
    db.exec("ALTER TABLE acknowledgments ADD COLUMN signature_data TEXT;");
  }
  if (!hasSignedName) {
    db.exec("ALTER TABLE acknowledgments ADD COLUMN signed_name TEXT;");
  }
  if (!hasSignedAt) {
    db.exec("ALTER TABLE acknowledgments ADD COLUMN signed_at TEXT;");
  }
}

function ensureAppSettingsDefaults(): void {
  const defaultDisclaimer =
    'By signing this acknowledgment, you confirm that you have read and understood the document and agree to comply with its requirements.';

  db.prepare(
    `INSERT OR IGNORE INTO app_settings (key, value)
     VALUES ('acknowledgment_disclaimer', ?)`
  ).run(defaultDisclaimer);
}

function ensureUserSignatureColumns(): void {
  const columns = db.prepare("PRAGMA table_info('user_signatures')").all() as Array<{ name: string }>;
  const hasIsDefault = columns.some((col) => col.name === 'is_default');

  if (!hasIsDefault) {
    db.exec("ALTER TABLE user_signatures ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;");
  }
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
    "INSERT INTO acknowledgments (document_id, user_id, acknowledged_at, comment) VALUES (?, ?, datetime('now', '-10 days'), ?)"
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
