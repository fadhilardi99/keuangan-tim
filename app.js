// ================== CONFIG ==================
const API = ''; // Kosong = same origin
let DATA = {
  transaksi: [],
  pemain: [],
  pengaturan: { iuran: 2000, targetCustom: 150000 },
  statistik: {},
  statistikPemain: []
};
let selectedPemainId = '';

// ================== UTIL ==================
function rupiah(n) {
  return 'Rp ' + Number(Math.round(n || 0)).toLocaleString('id-ID');
}
function inisial(nama) {
  return (nama || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
}
function tglSingkat(s) {
  return new Date(s).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}
function tglIndo(s) {
  return new Date(s).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric', weekday:'long' });
}

function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = 'toast', 3500);
}

async function api(url, options = {}) {
  const res = await fetch(API + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Network error' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ================== LOAD DATA ==================
async function loadAll() {
  try {
    const [transaksi, pemain, pengaturan, statistik, statistikPemain] = await Promise.all([
      api('/api/transaksi'),
      api('/api/pemain'),
      api('/api/pengaturan'),
      api('/api/statistik'),
      api('/api/statistik-pemain')
    ]);

    DATA.transaksi = transaksi;
    DATA.pemain = pemain;
    DATA.pengaturan = {
      iuran: parseInt(pengaturan.iuran || 2000),
      targetCustom: parseInt(pengaturan.targetCustom || 150000)
    };
    DATA.statistik = statistik;
    DATA.statistikPemain = statistikPemain;

    const onlineText = document.getElementById('onlineText');
    const onlineDot = document.querySelector('#onlineBadge .dot');
    if (onlineText) onlineText.textContent = 'Online • Tersinkron';
    if (onlineDot) onlineDot.style.background = '';
    renderAll();
  } catch (err) {
    console.error(err);
    const onlineText = document.getElementById('onlineText');
    const onlineDot = document.querySelector('#onlineBadge .dot');
    if (onlineText) onlineText.textContent = 'Offline';
    if (onlineDot) onlineDot.style.background = 'var(--red)';
    toast('Gagal konek ke server: ' + err.message, true);
  }
}

// ================== RENDER ==================
function renderAll() {
  renderStatistik();
  renderHeaderBadge();
  renderTabel();
  renderPemain();
  renderDaftarPemainSelect();
  renderPengaturan();
  renderStatInfo();
}

function renderStatistik() {
  const s = DATA.statistik;
  document.getElementById('totalMasuk').textContent = rupiah(s.totalMasuk);
  document.getElementById('totalKeluar').textContent = rupiah(s.totalKeluar);
  document.getElementById('saldoKas').textContent = rupiah(s.saldo);
  document.getElementById('totalIuran').textContent = rupiah(s.totalIuran);
  document.getElementById('totalCustom').textContent = rupiah(s.totalCustom);
}

function renderHeaderBadge() {
  document.getElementById('headerBadge').textContent = 
    `Iuran ${rupiah(DATA.pengaturan.iuran)} flat  •  Target custom ${rupiah(DATA.pengaturan.targetCustom)}`;
  document.getElementById('infoIuran').textContent = DATA.pengaturan.iuran.toLocaleString('id-ID');
}

function renderTabel() {
  const filterJenis = document.getElementById('filterJenis').value;
  const filterPemain = document.getElementById('filterPemain').value;
  const search = (document.getElementById('searchBox').value || '').toLowerCase();

  let list = [...DATA.transaksi];
  if (filterJenis) list = list.filter(t => t.jenis === filterJenis);
  if (filterPemain) list = list.filter(t => String(t.pemain_id) === String(filterPemain));
  if (search) list = list.filter(t =>
    (t.keterangan || '').toLowerCase().includes(search) ||
    (t.pemain_nama || '').toLowerCase().includes(search)
  );

  const tbody = document.getElementById('tabelBody');
  const emptyState = document.getElementById('emptyState');

  if (list.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  tbody.innerHTML = list.map(t => {
    const isMasuk = t.jenis === 'masuk';
    let breakdown = '<span style="color:var(--text-muted);">—</span>';
    if (t.tipe === 'pemain') {
      breakdown = `<span class="badge iuran">🏦 ${rupiah(t.iuran_part)}</span> <span class="badge custom">⚽ ${rupiah(t.custom_part)}</span>`;
    }
    return `
      <tr>
        <td data-label="Tanggal" style="color:var(--text-muted);font-size:12px;font-weight:600;">${tglSingkat(t.tanggal)}</td>
        <td data-label="Pemain">${t.pemain_nama ? `<strong>${t.pemain_nama}</strong>` : '<span style="color:var(--text-muted);">—</span>'}</td>
        <td data-label="Keterangan">${t.keterangan || '—'}</td>
        <td data-label="Breakdown">${breakdown}</td>
        <td data-label="Jumlah" class="${isMasuk ? 'amount-in' : 'amount-out'} trx-amount">
          ${isMasuk ? '+' : '−'} ${rupiah(t.jumlah)}
        </td>
        <td data-label=""><button class="del-btn" onclick="hapusTransaksi(${t.id})">Hapus</button></td>
      </tr>
    `;
  }).join('');
}

function renderDaftarPemainSelect() {
  const sel = document.getElementById('pemainSelect');
  const cur = sel.value;
  sel.innerHTML = '<option value="">-- Pilih Pemain --</option>' +
    DATA.pemain.map(p => `<option value="${p.id}">${p.nama}</option>`).join('');
  sel.value = cur;

  const fp = document.getElementById('filterPemain');
  const curFp = fp.value;
  fp.innerHTML = '<option value="">👥 Semua Pemain</option>' +
    DATA.pemain.map(p => `<option value="${p.id}">${p.nama}</option>`).join('');
  fp.value = curFp;
}

function playerCardHtml(p) {
  return `
    <div class="player-card ${p.lunas ? 'lunas' : ''}">
      <div class="player-header" onclick="lihatDetailPemain(${p.id})">
        <div class="player-name">
          <div class="avatar">${inisial(p.nama)}</div>
          ${p.nama} ${p.lunas ? '✅' : ''}
        </div>
        <span class="detail-link">Detail →</span>
      </div>
      <div class="player-stat">
        <span class="lbl">Total Bayar (${p.jumlah_trx}x)</span>
        <span class="val">${rupiah(p.total_bayar)}</span>
      </div>
      <div class="player-stat">
        <span class="lbl">🏦 Iuran</span>
        <span class="val" style="color:#60a5fa;">${rupiah(p.total_iuran)}</span>
      </div>
      <div class="player-stat">
        <span class="lbl">⚽ Custom Bola</span>
        <span class="val" style="color:#c084fc;">${rupiah(p.total_custom)}</span>
      </div>
      <div class="player-stat divide">
        <span class="lbl">Sisa Cicilan</span>
        <span class="val ${p.lunas ? 'amount-in' : ''}">${p.lunas ? 'LUNAS ✅' : rupiah(p.sisa)}</span>
      </div>
      <div class="progress">
        <div class="progress-fill ${p.lunas ? 'full' : ''}" style="width:${p.persen}%"></div>
      </div>
      <div class="progress-label">
        <span>Progress</span>
        <span>${p.persen.toFixed(0)}% / ${rupiah(p.target)}</span>
      </div>
      ${p.lunas ? '<div style="margin-top:10px;font-size:11px;color:var(--accent);font-weight:700;text-align:center;padding:6px;background:rgba(34,214,122,0.1);border-radius:8px;">💚 Pembayaran berikutnya masuk ke kas iuran</div>' : ''}
    </div>
  `;
}

function renderPemain() {
  const picker = document.getElementById('pemainPicker');
  const wrap = document.getElementById('playerPickerWrap');
  const prev = selectedPemainId || picker.value;

  picker.innerHTML = '<option value="">-- Pilih pemain --</option>' +
    DATA.statistikPemain.map(p =>
      `<option value="${p.id}">${p.nama}${p.lunas ? ' ✅ Lunas' : ''}</option>`
    ).join('');

  const masihAda = DATA.statistikPemain.some(p => String(p.id) === String(prev));
  picker.value = masihAda ? String(prev) : '';
  selectedPemainId = picker.value;
  wrap.style.display = DATA.statistikPemain.length ? 'block' : 'none';
  renderPemainCard();
}

function pilihPemainDariDaftar() {
  selectedPemainId = document.getElementById('pemainPicker').value;
  renderPemainCard();
}

function renderPemainCard() {
  const grid = document.getElementById('playerGrid');
  const empty = document.getElementById('emptyPlayer');
  const id = selectedPemainId || document.getElementById('pemainPicker').value;

  if (DATA.statistikPemain.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = '📭 Belum ada pemain. Tambah dulu di tab Setelan.';
    return;
  }

  if (!id) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = '👆 Pilih nama pemain di dropdown untuk melihat kartunya.';
    return;
  }

  const p = DATA.statistikPemain.find(s => String(s.id) === String(id));
  if (!p) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = 'Pemain tidak ditemukan.';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = playerCardHtml(p);
}

function renderPengaturan() {
  document.getElementById('setIuran').value = DATA.pengaturan.iuran;
  document.getElementById('setTargetCustom').value = DATA.pengaturan.targetCustom;

  const list = document.getElementById('listPemain');
  if (DATA.pemain.length === 0) {
    list.innerHTML = '<div class="empty">Belum ada pemain.</div>';
  } else {
    list.innerHTML = DATA.pemain.map(p => {
      const stat = DATA.statistikPemain.find(s => s.id === p.id) || {};
      return `
        <div class="list-item">
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="avatar">${inisial(p.nama)}</div>
            <div>
              <div class="name">${p.nama} ${stat.lunas ? '✅' : ''}</div>
              <div class="sub">Terkumpul: ${rupiah(stat.total_custom || 0)} / ${rupiah(DATA.pengaturan.targetCustom)}</div>
            </div>
          </div>
          <button class="del-btn" onclick="hapusPemain(${p.id})">Hapus</button>
        </div>
      `;
    }).join('');
  }
}

function renderStatInfo() {
  const grid = document.getElementById('statInfoGrid');
  const s = DATA.statistik;
  grid.innerHTML = `
    <div class="stat-info-item"><div class="lbl">📋 Transaksi</div><div class="val">${s.totalTransaksi || 0}</div></div>
    <div class="stat-info-item"><div class="lbl">👥 Pemain</div><div class="val">${s.totalPemain || 0}</div></div>
    <div class="stat-info-item"><div class="lbl">💰 Masuk</div><div class="val green">${rupiah(s.totalMasuk)}</div></div>
    <div class="stat-info-item"><div class="lbl">💸 Keluar</div><div class="val" style="color:var(--red);">${rupiah(s.totalKeluar)}</div></div>
    <div class="stat-info-item"><div class="lbl">⚽ Custom</div><div class="val purple">${rupiah(s.totalCustom)}</div></div>
    <div class="stat-info-item"><div class="lbl">💾 Server</div><div class="val blue">SQLite</div></div>
  `;
}

// ================== NAVIGASI ==================
document.querySelectorAll('.nav-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const page = btn.dataset.page;
    ['pageTransaksi','pagePemain','pageRekap','pageTagih','pageLaporan','pageSetelan'].forEach(id => {
      document.getElementById(id).style.display = id === page ? 'block' : 'none';
    });
    document.body.classList.toggle('tab-kas', page === 'pageTransaksi');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'pagePemain') renderPemain();
    if (page === 'pageRekap') { renderChart(); renderRekapLatihan(); }
    if (page === 'pageTagih') renderWaTargets();
    if (page === 'pageSetelan') { renderPengaturan(); renderStatInfo(); }
  });
});

// ================== QUICK & PREVIEW ==================
function setQuick(btn, amount) {
  document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('jumlahBayar').value = amount;
  updatePreview();
}

function lunaskan(btn) {
  const pemainId = document.getElementById('pemainSelect').value;
  if (!pemainId) { toast('⚠️ Pilih pemain dulu!', true); return; }
  const stat = DATA.statistikPemain.find(s => s.id == pemainId);
  if (!stat || stat.lunas) { toast('✅ Pemain ini sudah LUNAS!', true); return; }
  const nominal = stat.sisa + DATA.pengaturan.iuran;
  document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('jumlahBayar').value = nominal;
  updatePreview();
}

function hitungBreakdown(jumlah, statPemain) {
  const iuranFlat = DATA.pengaturan.iuran;
  const target = DATA.pengaturan.targetCustom;
  const sisaCustom = statPemain ? Math.max(0, target - statPemain.total_custom) : 0;

  if (sisaCustom <= 0) {
    return { iuran: jumlah, custom: 0, lunasSebelumnya: true };
  }

  let iuranPart, customPart;
  if (jumlah <= iuranFlat) {
    iuranPart = jumlah;
    customPart = 0;
  } else {
    const sisaSetelah = jumlah - iuranFlat;
    if (sisaSetelah <= sisaCustom) {
      iuranPart = iuranFlat;
      customPart = sisaSetelah;
    } else {
      customPart = sisaCustom;
      iuranPart = jumlah - customPart;
    }
  }
  return { iuran: iuranPart, custom: customPart, lunasSebelumnya: false };
}

function updatePreview() {
  const val = parseFloat(document.getElementById('jumlahBayar').value) || 0;
  const box = document.getElementById('previewBox');
  const pemainId = document.getElementById('pemainSelect').value;
  const noticeEl = document.getElementById('prevNotice');
  noticeEl.innerHTML = '';

  if (val <= 0) { box.classList.remove('show'); return; }

  const stat = pemainId ? DATA.statistikPemain.find(s => s.id == pemainId) : null;
  const b = hitungBreakdown(val, stat);

  document.getElementById('prevIuran').textContent = rupiah(b.iuran);
  document.getElementById('prevCustom').textContent = rupiah(b.custom);
  document.getElementById('prevTotal').textContent = rupiah(val);
  box.classList.add('show');

  const sisaEl = document.getElementById('prevSisa');
  if (stat) {
    if (b.lunasSebelumnya) {
      sisaEl.innerHTML = `✅ Pemain sudah <strong style="color:var(--accent);">LUNAS</strong> — seluruh pembayaran masuk ke iuran.`;
    } else if (b.custom === 0 && b.iuran === val) {
      sisaEl.innerHTML = `ℹ️ Nominal ≤ Rp${DATA.pengaturan.iuran.toLocaleString('id-ID')} → hanya masuk iuran.`;
    } else {
      const sisaBaru = Math.max(0, stat.sisa - b.custom);
      if (sisaBaru <= 0) sisaEl.innerHTML = `🎉 <strong style="color:var(--accent);">LUNAS setelah pembayaran ini!</strong>`;
      else sisaEl.innerHTML = `💰 Sisa cicilan custom: <strong>${rupiah(sisaBaru)}</strong>`;
    }
    const kelebihan = val - DATA.pengaturan.iuran - b.custom;
    if (!b.lunasSebelumnya && kelebihan > 0) {
      noticeEl.innerHTML = `<div class="notice">⚠️ Kelebihan ${rupiah(kelebihan)} dialihkan ke iuran</div>`;
    }
  } else {
    sisaEl.innerHTML = '';
  }
}

document.getElementById('pemainSelect').addEventListener('change', updatePreview);

// ================== SIMPAN ==================
async function simpanPembayaranPemain() {
  const btn = document.getElementById('btnSimpanBayar');
  const tanggal = document.getElementById('tanggal').value;
  const pemainId = document.getElementById('pemainSelect').value;
  const jumlah = parseFloat(document.getElementById('jumlahBayar').value);
  const ket = document.getElementById('keteranganBayar').value.trim();

  if (!tanggal || !pemainId || !jumlah || jumlah <= 0) {
    toast('⚠️ Lengkapi data!', true); return;
  }

  const pemain = DATA.pemain.find(p => p.id == pemainId);
  const stat = DATA.statistikPemain.find(s => s.id == pemainId);
  const b = hitungBreakdown(jumlah, stat);

  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Menyimpan...';

  try {
    await api('/api/transaksi', {
      method: 'POST',
      body: JSON.stringify({
        tanggal, jenis: 'masuk',
        pemain_id: pemain.id, pemain_nama: pemain.nama,
        jumlah, iuran_part: b.iuran, custom_part: b.custom,
        keterangan: ket || `Pembayaran ${pemain.nama}`,
        tipe: 'pemain',
        lunas_sebelumnya: b.lunasSebelumnya
      })
    });

    toast(`✅ ${pemain.nama}: ${rupiah(jumlah)} tersimpan`);
    resetFormPemain();
    await loadAll();
  } catch (err) {
    toast('Gagal simpan: ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '💾 Simpan Pembayaran';
  }
}

function resetFormPemain() {
  document.getElementById('jumlahBayar').value = '';
  document.getElementById('keteranganBayar').value = '';
  document.getElementById('tanggal').valueAsDate = new Date();
  document.getElementById('pemainSelect').value = '';
  document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('previewBox').classList.remove('show');
}

async function simpanTransaksiUmum() {
  const tanggal = document.getElementById('tanggalUmum').value;
  const jenis = document.getElementById('jenisUmum').value;
  const kategori = document.getElementById('kategoriUmum').value;
  const jumlah = parseFloat(document.getElementById('jumlahUmum').value);
  const ket = document.getElementById('keteranganUmum').value.trim();

  if (!tanggal || !jumlah || jumlah <= 0) { toast('⚠️ Lengkapi data!', true); return; }

  try {
    await api('/api/transaksi', {
      method: 'POST',
      body: JSON.stringify({
        tanggal, jenis, kategori, jumlah,
        keterangan: ket || kategori,
        tipe: 'umum'
      })
    });
    toast('✅ Transaksi tersimpan');
    document.getElementById('jumlahUmum').value = '';
    document.getElementById('keteranganUmum').value = '';
    await loadAll();
  } catch (err) {
    toast('Gagal: ' + err.message, true);
  }
}

// ================== HAPUS ==================
async function hapusTransaksi(id) {
  if (!confirm('Hapus transaksi ini?')) return;
  try {
    await api('/api/transaksi/' + id, { method: 'DELETE' });
    toast('✅ Dihapus');
    await loadAll();
  } catch (err) {
    toast('Gagal: ' + err.message, true);
  }
}

async function hapusSemuaTransaksi() {
  if (!confirm('⚠️ Hapus SEMUA transaksi?')) return;
  if (!confirm('Konfirmasi sekali lagi.')) return;
  try {
    await api('/api/transaksi', { method: 'DELETE' });
    toast('✅ Semua transaksi dihapus');
    await loadAll();
  } catch (err) {
    toast('Gagal: ' + err.message, true);
  }
}

// ================== PEMAIN ==================
async function tambahPemain() {
  const nama = document.getElementById('namaPemainBaru').value.trim();
  if (!nama) { toast('Masukkan nama!', true); return; }
  try {
    await api('/api/pemain', { method: 'POST', body: JSON.stringify({ nama }) });
    document.getElementById('namaPemainBaru').value = '';
    toast(`✅ "${nama}" ditambahkan`);
    await loadAll();
  } catch (err) {
    toast('Gagal: ' + err.message, true);
  }
}

async function hapusPemain(id) {
  if (!confirm('Hapus pemain ini?')) return;
  try {
    await api('/api/pemain/' + id, { method: 'DELETE' });
    toast('✅ Pemain dihapus');
    await loadAll();
  } catch (err) {
    toast('Gagal: ' + err.message, true);
  }
}

function lihatDetailPemain(id) {
  const p = DATA.pemain.find(x => String(x.id) === String(id));
  const stat = DATA.statistikPemain.find(s => String(s.id) === String(id));
  if (!p || !stat) return;

  const listTrx = DATA.transaksi.filter(t => String(t.pemain_id) === String(id));

  document.getElementById('modalTitle').innerHTML = `<div class="avatar" style="width:28px;height:28px;font-size:12px;">${inisial(p.nama)}</div> ${p.nama}`;

  let html = `
    <div class="stat-box">
      <div class="row"><span class="lbl">Total Bayar (${stat.jumlah_trx}x)</span><span class="val">${rupiah(stat.total_bayar)}</span></div>
      <div class="row"><span class="lbl">🏦 Iuran Terkumpul</span><span class="val" style="color:#60a5fa;">${rupiah(stat.total_iuran)}</span></div>
      <div class="row"><span class="lbl">⚽ Cicilan Custom</span><span class="val" style="color:#c084fc;">${rupiah(stat.total_custom)}</span></div>
      <div class="row divider"><span class="lbl">🎯 Target Custom</span><span class="val">${rupiah(stat.target)}</span></div>
      <div class="row"><span class="lbl">💰 Sisa Cicilan</span><span class="val" style="color:${stat.lunas ? 'var(--accent)' : 'var(--red)'};">${stat.lunas ? 'LUNAS ✅' : rupiah(stat.sisa)}</span></div>
    </div>
    ${stat.lunas ? '<div class="info-box green" style="margin-bottom:12px;font-size:12px;">💚 Pemain sudah lunas. Pembayaran berikutnya otomatis masuk kas iuran.</div>' : ''}
    <h4 style="font-size:13px;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">📜 Riwayat</h4>
  `;

  if (listTrx.length === 0) html += '<div class="empty">Belum ada pembayaran.</div>';
  else {
    html += '<div class="trx-list">';
    listTrx.forEach(t => {
      html += `
        <div class="trx-item">
          <div class="head">
            <span class="date">📅 ${tglSingkat(t.tanggal)}${t.lunas_sebelumnya ? ' <span style="color:var(--accent);font-size:11px;">(sudah lunas)</span>' : ''}</span>
            <span class="amt">+${rupiah(t.jumlah)}</span>
          </div>
          <div class="bd">
            <span class="badge iuran">🏦 ${rupiah(t.iuran_part || 0)}</span>
            <span class="badge custom">⚽ ${rupiah(t.custom_part || 0)}</span>
          </div>
        </div>
      `;
    });
    html += '</div>';
  }
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalPemain').classList.add('active');
}
function tutupModal() { document.getElementById('modalPemain').classList.remove('active'); }
document.getElementById('modalPemain').addEventListener('click', (e) => {
  if (e.target.id === 'modalPemain') tutupModal();
});

// ================== CHART ==================
function renderChart() {
  const wrap = document.getElementById('chartWrap');
  const today = new Date();
  today.setHours(0,0,0,0);
  const buckets = [];
  for (let i = 3; i >= 0; i--) {
    const start = new Date(today); start.setDate(start.getDate() - (i*7+6));
    const end = new Date(today); end.setDate(end.getDate() - (i*7));
    buckets.push({ start, end, masuk: 0, keluar: 0, label: `M-${i===0?'ini':i}` });
  }

  DATA.transaksi.forEach(t => {
    const d = new Date(t.tanggal); d.setHours(0,0,0,0);
    for (const b of buckets) {
      if (d >= b.start && d <= b.end) {
        if (t.jenis === 'masuk') b.masuk += t.jumlah;
        else b.keluar += t.jumlah;
        break;
      }
    }
  });

  const maxVal = Math.max(...buckets.map(b => Math.max(b.masuk, b.keluar)), 1);
  wrap.innerHTML = buckets.map(b => `
    <div class="chart-col">
      <div class="chart-bars">
        <div class="chart-bar masuk" style="height:${(b.masuk/maxVal)*100}%" title="${rupiah(b.masuk)}"></div>
        <div class="chart-bar keluar" style="height:${(b.keluar/maxVal)*100}%" title="${rupiah(b.keluar)}"></div>
      </div>
      <div class="chart-label">${b.label}</div>
    </div>
  `).join('');
}

function renderRekapLatihan() {
  const wrap = document.getElementById('rekapLatihan');
  const groups = {};
  DATA.transaksi.forEach(t => {
    if (t.tipe !== 'pemain') return;
    if (!groups[t.tanggal]) groups[t.tanggal] = [];
    groups[t.tanggal].push(t);
  });

  const keys = Object.keys(groups).sort((a,b) => new Date(b) - new Date(a));
  if (keys.length === 0) { wrap.innerHTML = '<div class="empty">📭 Belum ada pembayaran.</div>'; return; }

  wrap.innerHTML = keys.slice(0, 10).map(tgl => {
    const items = groups[tgl];
    const total = items.reduce((s,t) => s + t.jumlah, 0);
    const totalIuran = items.reduce((s,t) => s + (t.iuran_part||0), 0);
    const totalCustom = items.reduce((s,t) => s + (t.custom_part||0), 0);
    return `
      <div class="latihan-card">
        <div class="latihan-header">
          <div class="latihan-date">📅 ${tglIndo(tgl)}</div>
          <div class="latihan-total">
            ${new Set(items.map(t => t.pemain_id || t.pemain_nama)).size} pemain • Total <strong>${rupiah(total)}</strong>
            <span style="color:#60a5fa;">(🏦 ${rupiah(totalIuran)})</span>
            <span style="color:#c084fc;">(⚽ ${rupiah(totalCustom)})</span>
          </div>
        </div>
        <div class="pay-list">
          ${items.map(t => `<div class="pay-chip">${t.pemain_nama} <small>+${rupiah(t.jumlah)}</small></div>`).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// ================== TAGIH WA ==================
function renderWaTargets() {
  const wrap = document.getElementById('waTargets');
  const empty = document.getElementById('waEmpty');

  const belumLunas = DATA.statistikPemain.filter(s => !s.lunas).sort((a,b) => b.sisa - a.sisa);

  if (belumLunas.length === 0) {
    wrap.innerHTML = ''; empty.style.display = 'block'; return;
  }
  empty.style.display = 'none';

  wrap.innerHTML = belumLunas.map(x => `
    <div class="wa-target">
      <div>
        <div class="name">
          <div class="avatar" style="width:26px;height:26px;font-size:11px;">${inisial(x.nama)}</div>
          ${x.nama}
        </div>
        <div class="meta">
          Sudah ${rupiah(x.total_custom)} • <span style="color:#fbbf24;font-weight:700;">Sisa ${rupiah(x.sisa)}</span>
        </div>
      </div>
      <button class="btn btn-wa btn-sm" onclick="tagihPemain(${x.id})">📱 Tagih WA</button>
    </div>
  `).join('');
}

function tagihPemain(id) {
  const p = DATA.pemain.find(x => String(x.id) === String(id));
  const s = DATA.statistikPemain.find(x => String(x.id) === String(id));
  if (!p || !s) return;

  const pesan = `Halo *${p.nama}* 👋

Kami dari bendahara tim sepak bola RT mau mengingatkan:

⚽ *Cicilan Custom Bola*
• Sudah dibayar: *${rupiah(s.total_custom)}*
• Sisa cicilan: *${rupiah(s.sisa)}*
• Target total: ${rupiah(s.target)}

💡 Bisa dicicil berapa saja, minimal Rp${DATA.pengaturan.iuran.toLocaleString('id-ID')} sudah termasuk iuran kas.

Kalau sudah bisa bayar, kabari ya. Terima kasih! 🙏⚽`;

  navigator.clipboard.writeText(pesan).then(() => {
    window.open(`https://wa.me/?text=${encodeURIComponent(pesan)}`, '_blank');
    toast(`✅ Pesan ${p.nama} di-copy`);
  }).catch(() => prompt('Copy pesan:', pesan));
}

// ================== LAPORAN ==================
function toggleModeLaporan() {
  const m = document.getElementById('laporanMode').value;
  document.getElementById('modeSingle').style.display = m === 'single' ? 'block' : 'none';
  document.getElementById('modeRange').style.display = m === 'range' ? 'block' : 'none';
}

function generateLaporan() {
  const mode = document.getElementById('laporanMode').value;
  if (mode === 'single') generateSingle();
  else generateRange();
}

function hitungBulan(y, m) {
  const list = DATA.transaksi.filter(t => {
    const d = new Date(t.tanggal);
    return d.getFullYear() === y && (d.getMonth()+1) === m;
  });
  let masuk = 0, keluar = 0, iuran = 0, custom = 0;
  const katKeluar = {}, pemainBayar = {};
  list.forEach(t => {
    if (t.jenis === 'masuk') {
      masuk += t.jumlah;
      if (t.iuran_part) iuran += t.iuran_part;
      if (t.custom_part) custom += t.custom_part;
      if (t.pemain_nama) pemainBayar[t.pemain_nama] = (pemainBayar[t.pemain_nama]||0) + t.jumlah;
    } else {
      keluar += t.jumlah;
      const k = t.kategori || 'Lainnya';
      katKeluar[k] = (katKeluar[k]||0) + t.jumlah;
    }
  });
  return { list, masuk, keluar, iuran, custom, katKeluar, pemainBayar, jumlahTrx: list.length };
}

function getSaldoAwal(y, m) {
  let saldo = 0;
  DATA.transaksi.forEach(t => {
    const d = new Date(t.tanggal);
    if (d.getFullYear() < y || (d.getFullYear() === y && (d.getMonth()+1) < m)) {
      saldo += (t.jenis === 'masuk' ? t.jumlah : -t.jumlah);
    }
  });
  return saldo;
}

function generateSingle() {
  const bulan = document.getElementById('laporanBulan').value;
  if (!bulan) { toast('Pilih bulan!', true); return; }
  const [y, m] = bulan.split('-').map(Number);
  const namaBulan = new Date(y, m-1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const h = hitungBulan(y, m);
  const saldoAwal = getSaldoAwal(y, m);
  const saldoAkhir = saldoAwal + h.masuk - h.keluar;

  let teks = `📊 *LAPORAN KEUANGAN TIM RT*\nPeriode: *${namaBulan}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  teks += `💼 *SALDO AWAL:* ${rupiah(saldoAwal)}\n\n`;
  teks += `💰 *PEMASUKAN:* ${rupiah(h.masuk)}\n`;
  if (h.iuran) teks += `   • 🏦 Iuran: ${rupiah(h.iuran)}\n`;
  if (h.custom) teks += `   • ⚽ Custom: ${rupiah(h.custom)}\n`;
  teks += `\n💸 *PENGELUARAN:* ${rupiah(h.keluar)}\n`;
  Object.entries(h.katKeluar).forEach(([k,v]) => teks += `   • ${k}: ${rupiah(v)}\n`);
  teks += `\n━━━━━━━━━━━━━━━━━━━━\n💼 *SALDO AKHIR:* ${rupiah(saldoAkhir)}\n📝 Total: ${h.jumlahTrx} transaksi\n`;

  if (Object.keys(h.pemainBayar).length) {
    teks += `\n👥 *PEMBAYARAN (${Object.keys(h.pemainBayar).length} orang):*\n`;
    Object.entries(h.pemainBayar).sort((a,b)=>b[1]-a[1]).forEach(([n,v]) => teks += `   • ${n}: ${rupiah(v)}\n`);
  }

  window._laporanTeks = teks;
  document.getElementById('laporanPreview').innerHTML = `<pre>${teks.replace(/</g,'&lt;')}</pre>`;
  toast('✅ Laporan digenerate');
}

function generateRange() {
  const dari = document.getElementById('laporanDari').value;
  const sampai = document.getElementById('laporanSampai').value;
  if (!dari || !sampai) { toast('Pilih bulan!', true); return; }
  if (dari > sampai) { toast('Bulan awal harus sebelum akhir!', true); return; }

  const [y1, m1] = dari.split('-').map(Number);
  const [y2, m2] = sampai.split('-').map(Number);
  const months = [];
  let y = y1, m = m1;
  while (y < y2 || (y === y2 && m <= m2)) {
    months.push({ y, m }); m++;
    if (m > 12) { m = 1; y++; }
  }

  let tMasuk = 0, tKeluar = 0, tIuran = 0, tCustom = 0, tTrx = 0;
  const bl = [];
  months.forEach(({ y, m }) => {
    const h = hitungBulan(y, m);
    tMasuk += h.masuk; tKeluar += h.keluar; tIuran += h.iuran; tCustom += h.custom; tTrx += h.jumlahTrx;
    bl.push({ y, m, ...h });
  });

  const namaPeriode = `${new Date(y1,m1-1,1).toLocaleDateString('id-ID',{month:'short',year:'numeric'})} - ${new Date(y2,m2-1,1).toLocaleDateString('id-ID',{month:'short',year:'numeric'})}`;
  const saldoAwal = getSaldoAwal(y1, m1);
  const saldoAkhir = saldoAwal + tMasuk - tKeluar;

  let teks = `📊 *LAPORAN RANGE*\nPeriode: *${namaPeriode}* (${months.length} bulan)\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  teks += `💼 *SALDO AWAL:* ${rupiah(saldoAwal)}\n`;
  teks += `💰 *MASUK:* ${rupiah(tMasuk)}\n`;
  teks += `💸 *KELUAR:* ${rupiah(tKeluar)}\n`;
  teks += `━━━━━━━━━━━━━━━━━━━━\n💼 *SALDO AKHIR:* ${rupiah(saldoAkhir)}\n\n`;
  teks += `📅 *RINCIAN PER BULAN:*\n\n`;

  let prevMasuk = 0;
  bl.forEach((b, i) => {
    const nb = new Date(b.y, b.m-1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    teks += `*${nb}*\n   💰 ${rupiah(b.masuk)} | 💸 ${rupiah(b.keluar)} | Net ${rupiah(b.masuk-b.keluar)}\n`;
    if (i > 0) {
      const d = b.masuk - prevMasuk;
      teks += `   ${d >= 0 ? '📈' : '📉'} vs bulan lalu: ${d >= 0 ? '+' : ''}${rupiah(d)}\n`;
    }
    prevMasuk = b.masuk;
  });

  teks += `\n📊 *RATA-RATA:*\n   Masuk: ${rupiah(tMasuk/months.length)}\n   Keluar: ${rupiah(tKeluar/months.length)}`;

  window._laporanTeks = teks;
  document.getElementById('laporanPreview').innerHTML = `<pre>${teks.replace(/</g,'&lt;')}</pre>`;
  toast('✅ Laporan range digenerate');
}

function copyLaporan() {
  if (!window._laporanTeks) { toast('Generate dulu!', true); return; }
  navigator.clipboard.writeText(window._laporanTeks).then(() => toast('✅ Copy!'));
}
function shareLaporan() {
  if (!window._laporanTeks) { toast('Generate dulu!', true); return; }
  window.open(`https://wa.me/?text=${encodeURIComponent(window._laporanTeks)}`, '_blank');
}
function printLaporan() {
  if (!window._laporanTeks) { toast('Generate dulu!', true); return; }
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Laporan</title><style>body{font-family:monospace;padding:40px;line-height:1.6}pre{white-space:pre-wrap;font-size:14px}</style></head><body><pre>${window._laporanTeks.replace(/</g,'&lt;')}</pre></body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

// ================== SETELAN ==================
async function simpanIuran() {
  const iuran = parseFloat(document.getElementById('setIuran').value) || 0;
  if (iuran < 0) { toast('Tidak boleh negatif', true); return; }
  try {
    await api('/api/pengaturan', { method: 'PUT', body: JSON.stringify({ iuran: String(iuran) }) });
    toast(`✅ Iuran: ${rupiah(iuran)}`);
    await loadAll();
    updatePreview();
  } catch (err) { toast('Gagal: ' + err.message, true); }
}

async function simpanTargetCustom() {
  const target = parseFloat(document.getElementById('setTargetCustom').value) || 0;
  if (target <= 0) { toast('Harus > 0', true); return; }
  try {
    await api('/api/pengaturan', { method: 'PUT', body: JSON.stringify({ targetCustom: String(target) }) });
    toast(`✅ Target: ${rupiah(target)}`);
    await loadAll();
  } catch (err) { toast('Gagal: ' + err.message, true); }
}

// ================== BACKUP & RESTORE ==================
async function downloadBackup() {
  try {
    const backup = await api('/api/backup');
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const tgl = new Date().toISOString().split('T')[0];
    const jam = new Date().toTimeString().slice(0,5).replace(':','');
    link.href = URL.createObjectURL(blob);
    link.download = `backup-keuangan-tim-${tgl}-${jam}.json`;
    link.click();
    toast('✅ Backup di-download');
  } catch (err) { toast('Gagal: ' + err.message, true); }
}

async function restoreBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!confirm('⚠️ Data saat ini akan DIGANTI. Lanjut?')) { event.target.value = ''; return; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const payload = parsed.data || parsed;
      await api('/api/restore', { method: 'POST', body: JSON.stringify(payload) });
      toast('✅ Restore berhasil');
      await loadAll();
    } catch (err) {
      toast('❌ Gagal restore: ' + err.message, true);
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

// ================== RESET ==================
async function resetTransaksi() {
  if (!confirm('⚠️ Hapus SEMUA transaksi? Pemain tetap aman.')) return;
  if (!confirm('Konfirmasi sekali lagi.')) return;
  try {
    await api('/api/transaksi', { method: 'DELETE' });
    toast('✅ Semua transaksi dihapus');
    await loadAll();
  } catch (err) { toast('Gagal: ' + err.message, true); }
}

async function resetPemain() {
  if (!confirm('⚠️ Hapus SEMUA pemain?')) return;
  if (!confirm('Konfirmasi.')) return;
  for (const p of DATA.pemain) {
    try { await api('/api/pemain/' + p.id, { method: 'DELETE' }); } catch(e) {}
  }
  toast('✅ Semua pemain dihapus');
  await loadAll();
}

// ================== CONTOH DATA ==================
async function isiContoh() {
  if (DATA.pemain.length === 0) {
    const names = ['Andre','Budi','Candra','Dedi','Eko','Fajar','Gilang','Hendra'];
    for (const n of names) {
      try { await api('/api/pemain', { method: 'POST', body: JSON.stringify({ nama: n }) }); } catch(e) {}
    }
    await loadAll();
  }

  const hariIni = new Date();
  const tgl = (o) => { const d = new Date(hariIni); d.setDate(d.getDate() - o); return d.toISOString().split('T')[0]; };

  const contoh = [
    { hari: 20, nama: 'Andre', jumlah: 50000 },
    { hari: 18, nama: 'Andre', jumlah: 40000 },
    { hari: 15, nama: 'Andre', jumlah: 60000 },
    { hari: 12, nama: 'Andre', jumlah: 10000 },
    { hari: 5,  nama: 'Andre', jumlah: 15000 },
    { hari: 1,  nama: 'Andre', jumlah: 20000 },
    { hari: 14, nama: 'Budi', jumlah: 15000 },
    { hari: 14, nama: 'Candra', jumlah: 50000 },
    { hari: 10, nama: 'Dedi', jumlah: 25000 },
    { hari: 10, nama: 'Eko', jumlah: 5000 },
    { hari: 7,  nama: 'Fajar', jumlah: 30000 },
    { hari: 7,  nama: 'Gilang', jumlah: 2000 },
    { hari: 3,  nama: 'Candra', jumlah: 50000 },
    { hari: 3,  nama: 'Hendra', jumlah: 20000 },
  ];

  for (const b of contoh) {
    const p = DATA.pemain.find(x => x.nama === b.nama);
    if (!p) continue;
    const stat = DATA.statistikPemain.find(s => s.id === p.id);
    const br = hitungBreakdown(b.jumlah, stat);
    try {
      await api('/api/transaksi', {
        method: 'POST',
        body: JSON.stringify({
          tanggal: tgl(b.hari), jenis: 'masuk',
          pemain_id: p.id, pemain_nama: p.nama, jumlah: b.jumlah,
          iuran_part: br.iuran, custom_part: br.custom,
          keterangan: `Pembayaran ${p.nama}`,
          tipe: 'pemain',
          lunas_sebelumnya: br.lunasSebelumnya
        })
      });
      await loadAll(); // refresh untuk update sisa
    } catch(e) { console.error(e); }
  }

  try {
    await api('/api/transaksi', { method: 'POST', body: JSON.stringify({
      tanggal: tgl(4), jenis: 'keluar', kategori: 'Pembelian Bola',
      jumlah: 900000, keterangan: 'DP Custom Bola tim', tipe: 'umum'
    })});
    await api('/api/transaksi', { method: 'POST', body: JSON.stringify({
      tanggal: tgl(7), jenis: 'keluar', kategori: 'Sewa Lapangan',
      jumlah: 200000, keterangan: 'Sewa lapangan 2 jam', tipe: 'umum'
    })});
  } catch(e) {}

  toast('✅ Contoh data ditambahkan!');
  await loadAll();
}

// ================== EXPORT CSV ==================
function exportCSV() {
  if (DATA.transaksi.length === 0) { toast('Belum ada data', true); return; }
  const header = ['Tanggal','Pemain','Kategori','Keterangan','Jenis','Iuran','Custom','Jumlah'];
  const rows = DATA.transaksi.map(t => [
    t.tanggal, t.pemain_nama || '-', t.kategori || '-',
    t.keterangan || '-', t.jenis,
    t.iuran_part || 0, t.custom_part || 0, t.jumlah
  ]);
  const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `keuangan-tim-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  toast('✅ CSV di-download');
}

// ================== INIT ==================
document.getElementById('tanggal').valueAsDate = new Date();
document.getElementById('tanggalUmum').valueAsDate = new Date();
const bulanIni = new Date().toISOString().slice(0,7);
document.getElementById('laporanBulan').value = bulanIni;
document.getElementById('laporanDari').value = bulanIni;
document.getElementById('laporanSampai').value = bulanIni;

loadAll();
setInterval(loadAll, 30000); // auto-refresh tiap 30 detik