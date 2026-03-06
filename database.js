/* ============================================================
   database.js — WD Manutenções v3 FINAL
   ============================================================ */
'use strict';

const sqlite3 = require('sqlite3').verbose();
const bcrypt  = require('bcryptjs');
const path    = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'timecard.db');

const db = new sqlite3.Database(DB_PATH, err => {
  if (err) { console.error('❌ DB:', err.message); process.exit(1); }
  console.log('✓ SQLite:', DB_PATH);
});

db.run('PRAGMA journal_mode=WAL');
db.run('PRAGMA foreign_keys=ON');

/* ─── helpers promise ─── */
const run = (sql, p=[]) => new Promise((res,rej) =>
  db.run(sql, p, function(e){ e ? rej(e) : res(this); })
);
const get = (sql, p=[]) => new Promise((res,rej) =>
  db.get(sql, p, (e,r) => e ? rej(e) : res(r))
);
const all = (sql, p=[]) => new Promise((res,rej) =>
  db.all(sql, p, (e,r) => e ? rej(e) : res(r))
);

/* ─── schema ─── */
async function init(cb) {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        email      TEXT    UNIQUE NOT NULL COLLATE NOCASE,
        password   TEXT    NOT NULL,
        role       TEXT    NOT NULL DEFAULT 'employee' CHECK(role IN ('admin','employee')),
        active     INTEGER NOT NULL DEFAULT 1,
        created_at TEXT    DEFAULT (datetime('now','localtime'))
      )`);

    db.run(`
      CREATE TABLE IF NOT EXISTS records (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        user_name  TEXT    NOT NULL,
        user_email TEXT    NOT NULL DEFAULT '',
        type       TEXT    NOT NULL CHECK(type IN ('entrada','saida_almoco','retorno_almoco','saida')),
        photo_data TEXT,
        latitude   REAL,
        longitude  REAL,
        address    TEXT,
        date       TEXT    NOT NULL,
        time       TEXT    NOT NULL,
        ts         INTEGER NOT NULL,
        created_at TEXT    DEFAULT (datetime('now','localtime')),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )`, () => {
      db.run('CREATE INDEX IF NOT EXISTS idx_rec_user ON records(user_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_rec_date ON records(date)');
      db.run('CREATE INDEX IF NOT EXISTS idx_rec_ts   ON records(ts DESC)', () => {
        seedAdmin(cb);
      });
    });
  });
}

function seedAdmin(cb) {
  const email = process.env.ADMIN_EMAIL    || 'admin@wdmanutencoes.com';
  const pass  = process.env.ADMIN_PASSWORD || 'admin123';
  db.get('SELECT id FROM users WHERE email=?', [email], (err, row) => {
    if (row) return cb && cb();
    const hash = bcrypt.hashSync(pass, 12);
    db.run('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)',
      ['Administrador WD', email, hash, 'admin'],
      () => {
        console.log('\n✓ Admin padrão:  ' + email + '  /  ' + pass);
        if (pass === 'admin123') console.warn('  ⚠️  Altere ADMIN_PASSWORD em produção!\n');
        cb && cb();
      }
    );
  });
}

/* ─── API ─── */
const DB = {
  init,

  /* USERS */
  registerUser: ({ name, email, password }) => {
    const hash = bcrypt.hashSync(password, 12);
    return run('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)',
      [name.trim(), email.trim().toLowerCase(), hash, 'employee'])
      .then(r => ({ id: r.lastID, name, email: email.trim().toLowerCase(), role: 'employee' }));
  },

  verifyLogin: async (email, password) => {
    const u = await get('SELECT * FROM users WHERE email=? AND active=1', [email.toLowerCase()]);
    if (!u || !bcrypt.compareSync(password, u.password)) return null;
    return u;
  },

  getUserById: id => get('SELECT id,name,email,role FROM users WHERE id=?', [id]),

  getAllUsers: () => all(`
    SELECT u.id, u.name, u.email, u.role, u.created_at,
           COUNT(r.id) total_records, MAX(r.ts) last_ts
    FROM users u
    LEFT JOIN records r ON r.user_id=u.id
    WHERE u.active=1
    GROUP BY u.id ORDER BY u.created_at DESC`),

  deactivateUser: id => run('UPDATE users SET active=0 WHERE id=?', [id]),

  /* RECORDS */
  insertRecord: d => run(`
    INSERT INTO records
      (user_id,user_name,user_email,type,photo_data,latitude,longitude,address,date,time,ts)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [ d.user_id, d.user_name, d.user_email||'', d.type,
      d.photo_data||null, d.latitude||null, d.longitude||null, d.address||null,
      d.date, d.time, d.ts ]
  ).then(r => ({ id: r.lastID })),

  /* retorna lista sem photo_data (pesado) */
  getAllRecords: ({ limit=1000, offset=0 } = {}) => all(`
    SELECT id,user_id,user_name,user_email,type,
           latitude,longitude,address,date,time,ts,
           CASE WHEN photo_data IS NOT NULL THEN 1 ELSE 0 END has_photo
    FROM records ORDER BY ts DESC LIMIT ? OFFSET ?`, [limit, offset]),

  /* retorna 1 registro COM photo_data */
  getRecordById: id => get('SELECT * FROM records WHERE id=?', [id]),

  getRecordsByUser: userId => all(`
    SELECT id,user_id,user_name,user_email,type,
           latitude,longitude,address,date,time,ts,
           CASE WHEN photo_data IS NOT NULL THEN 1 ELSE 0 END has_photo
    FROM records WHERE user_id=? ORDER BY ts DESC`, [userId]),

  deleteRecord: id => run('DELETE FROM records WHERE id=?', [id]),

  updateRecord: (id, { type, date, time }) => {
    const fields = [], vals = [];
    if (type) { fields.push('type=?');  vals.push(type); }
    if (date) { fields.push('date=?');  vals.push(date); }
    if (time) { fields.push('time=?');  vals.push(time); }
    if (!fields.length) return Promise.resolve();
    vals.push(id);
    return run(`UPDATE records SET ${fields.join(',')} WHERE id=?`, vals);
  },

  clearAllRecords: () => run('DELETE FROM records').then(r => ({ deleted: r.changes })),

  getStats: async () => {
    const today = new Date().toLocaleDateString('pt-BR');
    const [tr, td, te] = await Promise.all([
      get('SELECT COUNT(*) c FROM records'),
      get('SELECT COUNT(*) c FROM records WHERE date=?', [today]),
      get('SELECT COUNT(*) c FROM users WHERE role="employee" AND active=1'),
    ]);
    return { total_records: tr.c, today_records: td.c, total_employees: te.c };
  },
};

module.exports = DB;