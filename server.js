const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.db');

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
      pengaturan.forEach(s => stmtSet.run(s.key, String(s.value)));
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
