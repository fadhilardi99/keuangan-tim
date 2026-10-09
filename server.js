const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, 'database.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS pemain (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS transaksi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tanggal TEXT NOT NULL,
    jenis TEXT NOT NULL CHECK(jenis IN ('masuk', 'keluar')),
    kategori TEXT DEFAULT 'Lainnya',
    keterangan TEXT DEFAULT '-',
    jumlah REAL NOT NULL CHECK(jumlah >= 0),
    pemain_id INTEGER,
    pemain_nama TEXT,
    iuran_part REAL DEFAULT 0,
    custom_part REAL DEFAULT 0,
    tipe TEXT DEFAULT 'umum' CHECK(tipe IN ('pemain', 'umum')),
    lunas_sebelumnya INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (pemain_id) REFERENCES pemain(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS pengaturan (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_users (
    username TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS baju_bola (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pemain_id INTEGER NOT NULL,
    nama_baju TEXT NOT NULL,
    nomor_punggung TEXT NOT NULL,
    ukuran TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (pemain_id) REFERENCES pemain(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_transaksi_tanggal ON transaksi(tanggal);
  CREATE INDEX IF NOT EXISTS idx_transaksi_pemain ON transaksi(pemain_id);
  CREATE INDEX IF NOT EXISTS idx_transaksi_jenis ON transaksi(jenis);
  CREATE INDEX IF NOT EXISTS idx_baju_bola_pemain ON baju_bola(pemain_id);
`);

const defaultPengaturan = {
  iuran: '2000',
  targetCustom: '150000',
  namaTim: 'Tim Sepak Bola RT'
};

const insertPengaturan = db.prepare('INSERT OR IGNORE INTO pengaturan (key, value) VALUES (?, ?)');
Object.entries(defaultPengaturan).forEach(([k, v]) => insertPengaturan.run(k, v));
db.prepare("DELETE FROM pengaturan WHERE key = 'namaBaju'").run();

function runTx(fn) {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  }
}

const bajuColumns = db.prepare('PRAGMA table_info(baju_bola)').all();
const pemainIdColumn = bajuColumns.find(column => column.name === 'pemain_id');
if (bajuColumns.some(column => column.name === 'pemain_nama') || !pemainIdColumn?.notnull) {
  if (db.prepare('SELECT 1 FROM baju_bola WHERE pemain_id IS NULL LIMIT 1').get()) {
    throw new Error('Data baju tanpa pemain terdaftar harus ditangani sebelum fitur daftar nama baju dihapus');
  }

  db.exec(`
    BEGIN;
    CREATE TABLE baju_bola_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pemain_id INTEGER NOT NULL,
      nama_baju TEXT NOT NULL,
      nomor_punggung TEXT NOT NULL,
      ukuran TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (pemain_id) REFERENCES pemain(id) ON DELETE CASCADE
    );
    INSERT INTO baju_bola_new (id, pemain_id, nama_baju, nomor_punggung, ukuran, created_at)
    SELECT id, pemain_id, nama_baju, nomor_punggung, ukuran, created_at
    FROM baju_bola;
    DROP TABLE baju_bola;
    ALTER TABLE baju_bola_new RENAME TO baju_bola;
    COMMIT;
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_baju_bola_pemain ON baju_bola(pemain_id)');
}

function safe(handler) {
  return (req, res) => {
    try {
      handler(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || 'Server error' });
      }
    }
  };
}

function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

app.use(express.json({ limit: '10mb' }));

const AUTH_USERS = [
  { username: 'admin', role: 'admin', passwordEnv: 'AUTH_ADMIN_PASSWORD' },
  { username: 'user', role: 'user', passwordEnv: 'AUTH_USER_PASSWORD' }
];
const SESSION_COOKIE = 'keuangan_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();
const scryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const dummySalt = crypto.randomBytes(16).toString('hex');
const dummyHash = crypto.scryptSync(crypto.randomBytes(32), dummySalt, 64, scryptOptions);

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64, scryptOptions);
}

function initializeAuthUsers() {
  const existing = db.prepare('SELECT username, role FROM auth_users ORDER BY username').all();
  if (existing.length === 0) {
    const credentials = AUTH_USERS.map(user => ({
      ...user,
      password: process.env[user.passwordEnv]
    }));
    const missing = credentials.filter(user => !user.password);
    if (missing.length) {
      throw new Error(
        `Set ${missing.map(user => user.passwordEnv).join(' and ')} before first startup to initialize login accounts`
      );
    }
    const short = credentials.find(user => user.password.length < 8);
    if (short) throw new Error(`${short.passwordEnv} must be at least 8 characters`);

    const insert = db.prepare(
      'INSERT INTO auth_users (username, role, salt, password_hash) VALUES (?, ?, ?, ?)'
    );
    runTx(() => credentials.forEach(user => {
      const salt = crypto.randomBytes(16).toString('hex');
      insert.run(user.username, user.role, salt, hashPassword(user.password, salt).toString('hex'));
    }));
    return;
  }

  const complete = AUTH_USERS.every(expected =>
    existing.some(user => user.username === expected.username && user.role === expected.role)
  );
  if (!complete || existing.length !== AUTH_USERS.length) {
    throw new Error('Login database must contain exactly the admin and user accounts');
  }
}

initializeAuthUsers();

function requestOriginIsSame(req) {
  const origin = req.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === `${req.protocol}://${req.get('host')}`;
  } catch {
    return false;
  }
}

function readSession(req) {
  const cookieHeader = req.get('cookie') || '';
  const token = cookieHeader.split(';').map(value => value.trim())
    .find(value => value.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;

  const key = crypto.createHash('sha256').update(token).digest('hex');
  const session = sessions.get(key);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(key);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { key, session };
}

app.get('/api/auth/session', (req, res) => {
  const current = readSession(req);
  res.set('Cache-Control', 'no-store');
  res.json({ user: current ? current.session.user : null });
});

app.post('/api/auth/login', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requestOriginIsSame(req)) return res.status(403).json({ error: 'Permintaan login tidak valid' });

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.blockedUntil > Date.now()) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.' });
  }

  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = db.prepare('SELECT username, role, salt, password_hash FROM auth_users WHERE username = ?')
    .get(username);
  const expectedHash = user ? Buffer.from(user.password_hash, 'hex') : dummyHash;
  const actualHash = hashPassword(password, user ? user.salt : dummySalt);
  const valid = expectedHash.length === actualHash.length && crypto.timingSafeEqual(expectedHash, actualHash);

  if (!user || !valid) {
    const failures = attempt && attempt.windowUntil > Date.now() ? attempt.failures + 1 : 1;
    loginAttempts.set(ip, {
      failures,
      windowUntil: Date.now() + 15 * 60 * 1000,
      blockedUntil: failures >= 5 ? Date.now() + 15 * 60 * 1000 : 0
    });
    return res.status(attempt && attempt.failures >= 4 ? 429 : 401)
      .json({ error: 'Username atau password salah' });
  }

  loginAttempts.delete(ip);
  for (const [sessionKey, session] of sessions) {
    if (session.expiresAt <= Date.now()) sessions.delete(sessionKey);
  }
  const token = crypto.randomBytes(32).toString('hex');
  const key = crypto.createHash('sha256').update(token).digest('hex');
  sessions.set(key, {
    user: { username: user.username, role: user.role },
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  const secure = req.secure ? '; Secure' : '';
  res.set('Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}${secure}`
  );
  res.json({ user: { username: user.username, role: user.role } });
});

app.post('/api/auth/logout', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requestOriginIsSame(req)) return res.status(403).json({ error: 'Permintaan logout tidak valid' });
  const current = readSession(req);
  if (current) sessions.delete(current.key);
  res.set('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  res.json({ success: true });
});

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (req.path.startsWith('/auth/')) return next();

  const current = readSession(req);
  if (!current) return res.status(401).json({ error: 'Silakan login untuk melanjutkan' });
  req.authUser = current.session.user;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (!requestOriginIsSame(req)) {
      return res.status(403).json({ error: 'Permintaan tidak valid' });
    }
    const userCanManageShirts = req.authUser.role === 'user' &&
      /^\/baju(?:\/\d+)?$/.test(req.path) &&
      ['POST', 'PUT', 'DELETE'].includes(req.method);
    if (req.authUser.role !== 'admin' && !userCanManageShirts) {
      return res.status(403).json({ error: 'Akses hanya tersedia untuk admin' });
    }
  }
  next();
});

app.get('/api/pengaturan', safe((req, res) => {
  const rows = db.prepare('SELECT key, value FROM pengaturan').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
}));

app.put('/api/pengaturan', safe((req, res) => {
  const updates = req.body || {};
  const stmt = db.prepare('INSERT OR REPLACE INTO pengaturan (key, value) VALUES (?, ?)');
  runTx(() => {
    Object.entries(updates).forEach(([k, v]) => stmt.run(k, String(v)));
  });
  res.json({ success: true });
}));

app.get('/api/pemain', safe((req, res) => {
  const pemain = db.prepare('SELECT * FROM pemain ORDER BY nama').all();
  res.json(pemain);
}));

app.post('/api/pemain/bulk', safe((req, res) => {
  if (!Array.isArray(req.body?.nama) || !req.body.nama.every(nama => typeof nama === 'string')) {
    return res.status(400).json({ error: 'Daftar nama pemain tidak valid' });
  }

  const semuaNama = req.body.nama.map(nama => nama.trim()).filter(Boolean);
  const namaPemain = [...new Set(semuaNama)];
  if (!namaPemain.length) return res.status(400).json({ error: 'Minimal satu nama wajib diisi' });

  const insert = db.prepare('INSERT OR IGNORE INTO pemain (nama) VALUES (?)');
  const select = db.prepare('SELECT * FROM pemain WHERE id = ?');
  const pemainBaru = [];
  let duplikat = semuaNama.length - namaPemain.length;

  runTx(() => {
    namaPemain.forEach(nama => {
      const result = insert.run(nama);
      if (result.changes) {
        pemainBaru.push(select.get(result.lastInsertRowid));
      } else {
        duplikat++;
      }
    });
  });

  res.json({ ditambahkan: pemainBaru.length, duplikat, pemain: pemainBaru });
}));

app.post('/api/pemain', safe((req, res) => {
  const nama = (req.body?.nama || '').trim();
  if (!nama) return res.status(400).json({ error: 'Nama wajib diisi' });
  try {
    const result = db.prepare('INSERT INTO pemain (nama) VALUES (?)').run(nama);
    const pemain = db.prepare('SELECT * FROM pemain WHERE id = ?').get(result.lastInsertRowid);
    res.json(pemain);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'Pemain sudah ada' });
    }
    throw err;
  }
}));

app.delete('/api/pemain/:id', safe((req, res) => {
  db.prepare('DELETE FROM pemain WHERE id = ?').run(n(req.params.id));
  res.json({ success: true });
}));

app.get('/api/transaksi', safe((req, res) => {
  const { pemain_id, jenis, dari, sampai, limit } = req.query;
  let sql = 'SELECT * FROM transaksi WHERE 1=1';
  const params = [];

  if (pemain_id) { sql += ' AND pemain_id = ?'; params.push(n(pemain_id)); }
  if (jenis) { sql += ' AND jenis = ?'; params.push(jenis); }
  if (dari) { sql += ' AND tanggal >= ?'; params.push(dari); }
  if (sampai) { sql += ' AND tanggal <= ?'; params.push(sampai); }

  sql += ' ORDER BY tanggal DESC, id DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit, 10)); }

  const rows = params.length
    ? db.prepare(sql).all(...params)
    : db.prepare(sql).all();
  res.json(rows);
}));

app.post('/api/transaksi', safe((req, res) => {
  const {
    tanggal, jenis, kategori, keterangan, jumlah,
    pemain_id, pemain_nama, iuran_part, custom_part,
    tipe, lunas_sebelumnya
  } = req.body || {};

  if (!tanggal || !jenis || jumlah === undefined || jumlah === null || jumlah === '') {
    return res.status(400).json({ error: 'Data tidak lengkap' });
  }

  const stmt = db.prepare(`
    INSERT INTO transaksi
    (tanggal, jenis, kategori, keterangan, jumlah, pemain_id, pemain_nama,
     iuran_part, custom_part, tipe, lunas_sebelumnya)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    tanggal,
    jenis,
    kategori || 'Lainnya',
    keterangan || '-',
    n(jumlah),
    pemain_id ? n(pemain_id) : null,
    pemain_nama || null,
    n(iuran_part),
    n(custom_part),
    tipe || 'umum',
    lunas_sebelumnya ? 1 : 0
  );

  const trx = db.prepare('SELECT * FROM transaksi WHERE id = ?').get(result.lastInsertRowid);
  res.json(trx);
}));

app.delete('/api/transaksi/:id', safe((req, res) => {
  db.prepare('DELETE FROM transaksi WHERE id = ?').run(n(req.params.id));
  res.json({ success: true });
}));

app.delete('/api/transaksi', safe((req, res) => {
  db.prepare('DELETE FROM transaksi').run();
  res.json({ success: true });
}));

app.get('/api/baju', safe((req, res) => {
  const target = n(db.prepare("SELECT value FROM pengaturan WHERE key = 'targetCustom'").get()?.value, 150000);
  const rows = db.prepare(`
    SELECT b.*, p.nama AS pemain_nama,
      COALESCE(SUM(t.custom_part), 0) AS total_custom
    FROM baju_bola b
    JOIN pemain p ON p.id = b.pemain_id
    LEFT JOIN transaksi t ON t.pemain_id = p.id AND t.jenis = 'masuk'
    GROUP BY b.id
    ORDER BY p.nama, b.nomor_punggung
  `).all();
  res.json(rows.map(row => ({ ...row, lunas: row.total_custom >= target })));
}));

app.post('/api/baju', safe((req, res) => {
  const pemainId = n(req.body?.pemain_id);
  const namaBaju = typeof req.body?.nama_baju === 'string' ? req.body.nama_baju.trim() : '';
  const nomor = typeof req.body?.nomor_punggung === 'string' ? req.body.nomor_punggung.trim() : '';
  const ukuran = typeof req.body?.ukuran === 'string' ? req.body.ukuran.trim().toUpperCase() : '';
  const ukuranValid = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].includes(ukuran);

  if (!Number.isInteger(pemainId) || pemainId <= 0 || !namaBaju || namaBaju.length > 80 ||
      !nomor || nomor.length > 10 || !ukuranValid) {
    return res.status(400).json({ error: 'Data baju tidak valid atau belum lengkap' });
  }

  if (!db.prepare('SELECT id FROM pemain WHERE id = ?').get(pemainId)) {
    return res.status(400).json({ error: 'Pemain tidak ditemukan' });
  }

  const result = db.prepare(`
    INSERT INTO baju_bola (pemain_id, nama_baju, nomor_punggung, ukuran)
    VALUES (?, ?, ?, ?)
  `).run(pemainId, namaBaju, nomor, ukuran);
  res.json(db.prepare('SELECT * FROM baju_bola WHERE id = ?').get(result.lastInsertRowid));
}));

app.put('/api/baju/:id', safe((req, res) => {
  const id = n(req.params.id);
  const pemainId = n(req.body?.pemain_id);
  const namaBaju = typeof req.body?.nama_baju === 'string' ? req.body.nama_baju.trim() : '';
  const nomor = typeof req.body?.nomor_punggung === 'string' ? req.body.nomor_punggung.trim() : '';
  const ukuran = typeof req.body?.ukuran === 'string' ? req.body.ukuran.trim().toUpperCase() : '';
  const ukuranValid = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].includes(ukuran);

  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(pemainId) || pemainId <= 0 ||
      !namaBaju || namaBaju.length > 80 || !nomor || nomor.length > 10 || !ukuranValid) {
    return res.status(400).json({ error: 'Data baju tidak valid atau belum lengkap' });
  }
  if (!db.prepare('SELECT id FROM pemain WHERE id = ?').get(pemainId)) {
    return res.status(400).json({ error: 'Pemain tidak ditemukan' });
  }
  const result = db.prepare(`
    UPDATE baju_bola
    SET pemain_id = ?, nama_baju = ?, nomor_punggung = ?, ukuran = ?
    WHERE id = ?
  `).run(pemainId, namaBaju, nomor, ukuran, id);
  if (!result.changes) return res.status(404).json({ error: 'Data baju tidak ditemukan' });
  res.json(db.prepare('SELECT * FROM baju_bola WHERE id = ?').get(id));
}));

app.delete('/api/baju/:id', safe((req, res) => {
  db.prepare('DELETE FROM baju_bola WHERE id = ?').run(n(req.params.id));
  res.json({ success: true });
}));

app.get('/api/statistik', safe((req, res) => {
  const totalMasuk = db.prepare("SELECT COALESCE(SUM(jumlah), 0) as total FROM transaksi WHERE jenis = 'masuk'").get().total;
  const totalKeluar = db.prepare("SELECT COALESCE(SUM(jumlah), 0) as total FROM transaksi WHERE jenis = 'keluar'").get().total;
  const totalIuran = db.prepare('SELECT COALESCE(SUM(iuran_part), 0) as total FROM transaksi').get().total;
  const totalCustom = db.prepare('SELECT COALESCE(SUM(custom_part), 0) as total FROM transaksi').get().total;
  const totalPemain = db.prepare('SELECT COUNT(*) as total FROM pemain').get().total;
  const totalTransaksi = db.prepare('SELECT COUNT(*) as total FROM transaksi').get().total;

  res.json({
    totalMasuk, totalKeluar,
    saldo: totalMasuk - totalKeluar,
    totalIuran, totalCustom,
    totalPemain, totalTransaksi
  });
}));

app.get('/api/statistik-pemain', safe((req, res) => {
  const target = parseInt(db.prepare("SELECT value FROM pengaturan WHERE key = 'targetCustom'").get()?.value || 150000, 10);

  const rows = db.prepare(`
    SELECT
      p.id, p.nama,
      COALESCE(SUM(CASE WHEN t.jenis = 'masuk' THEN t.jumlah ELSE 0 END), 0) as total_bayar,
      COALESCE(SUM(t.iuran_part), 0) as total_iuran,
      COALESCE(SUM(t.custom_part), 0) as total_custom,
      COUNT(CASE WHEN t.jenis = 'masuk' THEN 1 END) as jumlah_trx
    FROM pemain p
    LEFT JOIN transaksi t ON t.pemain_id = p.id
    GROUP BY p.id, p.nama
    ORDER BY p.nama
  `).all();

  const hasil = rows.map(r => ({
    ...r,
    target,
    sisa: Math.max(0, target - r.total_custom),
    persen: target > 0 ? Math.min(100, (r.total_custom / target) * 100) : 0,
    lunas: r.total_custom >= target
  }));

  res.json(hasil);
}));

app.get('/api/backup', safe((req, res) => {
  const transaksi = db.prepare('SELECT * FROM transaksi ORDER BY tanggal').all();
  const pemain = db.prepare('SELECT * FROM pemain').all();
  const baju = db.prepare('SELECT * FROM baju_bola').all();
  const pengaturan = db.prepare('SELECT * FROM pengaturan').all();

  res.json({
    _meta: {
      version: 'DB-1.0',
      exportedAt: new Date().toISOString(),
      appName: 'Keuangan Tim Sepak Bola RT'
    },
    transaksi, pemain, baju, pengaturan
  });
}));

function normalizeRestore(body) {
  if (!body || typeof body !== 'object') return { transaksi: [], pemain: [], baju: [], pengaturan: [] };

  if (Array.isArray(body.members) && !body.pemain) {
    const pemain = body.members.map(m => ({
      id: n(m.id),
      nama: m.nama || m.name,
      created_at: m.created_at || null
    })).filter(p => p.nama);

    const transaksi = (body.transactions || body.transaksi || []).map(t => ({
      ...t,
      pemain_id: t.pemain_id || t.member_id || null,
      pemain_nama: t.pemain_nama || t.member_name || null
    }));

    return { transaksi, pemain, baju: [], pengaturan: body.pengaturan || [] };
  }

  return {
    transaksi: body.transaksi || body.data?.transaksi || [],
    pemain: body.pemain || body.data?.pemain || [],
    baju: body.baju || body.data?.baju || [],
    pengaturan: body.pengaturan || body.data?.pengaturan || []
  };
}

app.post('/api/restore', safe((req, res) => {
  const { transaksi, pemain, baju, pengaturan } = normalizeRestore(req.body);

  runTx(() => {
    db.prepare('DELETE FROM transaksi').run();
    db.prepare('DELETE FROM baju_bola').run();
    db.prepare('DELETE FROM pemain').run();
    db.prepare('DELETE FROM pengaturan').run();

    if (pemain && pemain.length) {
      const stmtP = db.prepare('INSERT INTO pemain (id, nama, created_at) VALUES (?, ?, ?)');
      pemain.forEach(p => {
        stmtP.run(
          p.id ?? null,
          p.nama,
          p.created_at || new Date().toISOString()
        );
      });
    }

    if (baju && baju.length) {
      const stmtBaju = db.prepare(`
        INSERT INTO baju_bola (id, pemain_id, nama_baju, nomor_punggung, ukuran, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      baju.forEach(item => stmtBaju.run(
        item.id ?? null,
        n(item.pemain_id),
        item.nama_baju,
        String(item.nomor_punggung),
        item.ukuran,
        item.created_at || new Date().toISOString()
      ));
    }

    if (transaksi && transaksi.length) {
      const stmtT = db.prepare(`
        INSERT INTO transaksi
        (id, tanggal, jenis, kategori, keterangan, jumlah, pemain_id, pemain_nama,
         iuran_part, custom_part, tipe, lunas_sebelumnya, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      transaksi.forEach(t => stmtT.run(
        t.id ?? null,
        t.tanggal,
        t.jenis,
        t.kategori || 'Lainnya',
        t.keterangan || '-',
        n(t.jumlah),
        t.pemain_id ? n(t.pemain_id) : null,
        t.pemain_nama || null,
        n(t.iuran_part),
        n(t.custom_part),
        t.tipe || 'umum',
        t.lunas_sebelumnya ? 1 : 0,
        t.created_at || new Date().toISOString()
      ));
    }

    const stmtSet = db.prepare('INSERT INTO pengaturan (key, value) VALUES (?, ?)');
    if (pengaturan && pengaturan.length) {
      pengaturan.filter(s => s.key !== 'namaBaju').forEach(s => stmtSet.run(s.key, String(s.value)));
    }
    Object.entries(defaultPengaturan).forEach(([k, v]) => {
      db.prepare('INSERT OR IGNORE INTO pengaturan (key, value) VALUES (?, ?)').run(k, v);
    });
  });

  res.json({ success: true });
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/app.js', (req, res) => {
  res.type('application/javascript').sendFile(path.join(__dirname, 'app.js'));
});

app.get('/style.css', (req, res) => {
  res.type('text/css').sendFile(path.join(__dirname, 'style.css'));
});

app.use('/public', express.static(path.join(__dirname, 'public')));

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('');
  console.log('========================================');
  console.log('   KEUANGAN TIM SEPAK BOLA RT');
  console.log('   Server siap!');
  console.log('========================================');
  console.log(`   Lokal      : http://localhost:${PORT}`);
  console.log(`   Jaringan   : http://${ip}:${PORT}`);
  console.log(`   Database   : ${DB_PATH}`);
  console.log('========================================');
  console.log('   Tekan Ctrl+C untuk stop server');
  console.log('');
});
