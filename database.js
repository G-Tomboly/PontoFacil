/* ==================================================
   database.js — WD Manutenções
   ================================================== */

const sqlite3 = require('sqlite3').verbose();
const bcrypt  = require('bcryptjs');
const path    = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'timecard.db');

const db = new sqlite3.Database(DB_PATH, err => {
  if (err) { console.error('❌ DB connect error:', err); process.exit(1); }
  console.log('✓ SQLite conectado:', DB_PATH);
  init();
});

// Habilita WAL para melhor performance concorrente
db.run('PRAGMA journal_mode=WAL');
db.run('PRAGMA synchronous=NORMAL');

function init() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        email      TEXT    UNIQUE NOT NULL,
        password   TEXT    NOT NULL,
        role       TEXT    NOT NULL DEFAULT 'employee',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS records (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        user_name  TEXT    NOT NULL,
        user_email TEXT    NOT NULL DEFAULT '',
        type       TEXT    NOT NULL,
        photo      TEXT,
        latitude   REAL,
        longitude  REAL,
        address    TEXT,
        date       TEXT    NOT NULL,
        time       TEXT    NOT NULL,
        timestamp  INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `, () => {
      console.log('✓ Tabelas prontas');
      seedAdmin();
    });
  });
}

function seedAdmin() {
  const email = process.env.ADMIN_EMAIL    || 'admin@wdmanutencoes.com';
  const pass  = process.env.ADMIN_PASSWORD || 'admin123';

  db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
    if (row) return; // já existe
    const hash = bcrypt.hashSync(pass, 12);
    db.run(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      ['Administrador WD', email, hash, 'admin'],
      err2 => {
        if (!err2) {
          console.log('');
          console.log('✓ Admin criado:');
          console.log('  Email:', email);
          console.log('  Senha:', pass);
          if (pass === 'admin123') console.log('  ⚠️  Altere a senha em produção via variável ADMIN_PASSWORD');
          console.log('');
        }
      }
    );
  });
}

/* ==================================================
   API
   ================================================== */
const database = {

  registerUser(name, email, password, cb) {
    const hash = bcrypt.hashSync(password, 12);
    db.run(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, 'employee'],
      function (err) {
        if (err) cb(err, null);
        else     cb(null, { id: this.lastID, name, email, role: 'employee' });
      }
    );
  },

  verifyLogin(email, password, cb) {
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
      if (err)   return cb(err, null);
      if (!user) return cb(null, null);
      const ok = bcrypt.compareSync(password, user.password);
      cb(null, ok ? user : null);
    });
  },

  getUserById(id, cb) {
    db.get('SELECT id, name, email, role FROM users WHERE id = ?', [id], cb);
  },

  insertRecord(data, cb) {
    const sql = `
      INSERT INTO records
        (user_id, user_name, user_email, type, photo, latitude, longitude, address, date, time, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(sql, [
      data.user_id,
      data.user_name,
      data.user_email || '',
      data.type,
      data.photo      || null,
      data.latitude   || null,
      data.longitude  || null,
      data.address    || null,
      data.date,
      data.time,
      data.timestamp
    ], function (err) {
      if (err) cb(err);
      else     cb(null, { lastID: this.lastID });
    });
  },

  getAllRecords(cb) {
    db.all('SELECT * FROM records ORDER BY timestamp DESC', [], cb);
  },

  getRecordsByUserId(userId, cb) {
    db.all('SELECT * FROM records WHERE user_id = ? ORDER BY timestamp DESC', [userId], cb);
  },

  getRecordsByPeriod(start, end, cb) {
    db.all(
      'SELECT * FROM records WHERE date BETWEEN ? AND ? ORDER BY timestamp DESC',
      [start, end], cb
    );
  },

  getAllUsers(cb) {
    db.all(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC',
      [], cb
    );
  },

  getStats(cb) {
    db.all('SELECT * FROM records ORDER BY timestamp DESC', [], (err, records) => {
      if (err) return cb(err, null);
      const today = new Date().toLocaleDateString('pt-BR');
      db.get('SELECT COUNT(*) AS cnt FROM users WHERE role = "employee"', [], (e2, row) => {
        cb(null, {
          total_records:    records.length,
          today_records:    records.filter(r => r.date === today).length,
          total_employees:  row?.cnt || 0,
          all_records:      records
        });
      });
    });
  },

  deleteUserAndRecords(userId, cb) {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      db.run('DELETE FROM records WHERE user_id = ?', [userId], rErr => {
        if (rErr) { db.run('ROLLBACK'); return cb(rErr); }
        db.run('DELETE FROM users WHERE id = ?', [userId], function (uErr) {
          if (uErr) { db.run('ROLLBACK'); return cb(uErr); }
          db.run('COMMIT', cErr => {
            if (cErr) { db.run('ROLLBACK'); return cb(cErr); }
            cb(null, { deleted: this.changes });
          });
        });
      });
    });
  },

  clearAllRecords(cb) {
    db.run('DELETE FROM records', function (err) {
      if (err) cb(err);
      else     cb(null, { deleted: this.changes });
    });
  }
};

module.exports = database;
