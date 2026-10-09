# Keuangan Tim Sepak Bola RT

Sistem keuangan tim dengan database SQLite bawaan Node.js.

## Fitur

- Pembayaran pemain dapat dialokasikan ke iuran saja, Custom Bola saja, atau keduanya.
- Riwayat transaksi dapat difilter menurut tanggal, jenis, dan pemain.
- Data baju bola mencatat pemain, nama cetak, nomor punggung, dan ukuran. Status lunas otomatis mengikuti pembayaran Custom Bola dibanding target per pemain.
- Data baju bola termasuk dalam file backup dan restore.

## Cara menjalankan di komputer

1. Install [Node.js 22+](https://nodejs.org) (sudah termasuk npm).
2. Di folder project, jalankan:

```bash
npm install
npm start
```

3. Buka browser: [http://localhost:3000](http://localhost:3000)

Di HP yang **satu Wi-Fi**, pakai alamat jaringan yang muncul di terminal (contoh `http://192.168.x.x:3000`).

## Buka di HP tanpa Wi-Fi yang sama (deploy)

Kalau HP memakai data seluler atau Wi-Fi berbeda, `localhost` dan IP `192.168.x.x` **tidak bisa** dipakai. Aplikasi harus dipasang di internet (punya alamat `https://...`).

Aplikasi ini butuh **Node.js + file database**, jadi jangan pakai GitHub Pages / Netlify (itu hanya untuk file HTML statis).

### Opsi paling mudah: Railway

1. Buat akun di [railway.app](https://railway.app) (bisa login dengan GitHub).
2. Upload project ke GitHub (atau pakai Railway CLI).
3. Di Railway: **New Project** → **Deploy from GitHub repo**.
4. Railway otomatis menjalankan `npm start` dan memakai `PORT` dari environment.
5. Tambahkan **Volume** (disk) yang di-mount ke folder project, supaya `database.db` tidak hilang saat restart.
6. Setelah deploy selesai, buka **Settings → Networking → Generate Domain**.
7. Link itu (contoh `https://keuangan-tim-xxxx.up.railway.app`) bisa dibuka di HP dari mana saja.

### Opsi lain: Render

1. Buat akun di [render.com](https://render.com).
2. **New → Web Service**, pilih repo GitHub.
3. Runtime: Node. Start command: `npm start`.
4. Pasang **Disk** untuk file `database.db` (plan gratis disk-nya sementara/bisa hilang — untuk data kas, lebih aman pakai Railway + volume atau VPS).
5. Setelah live, pakai URL `https://....onrender.com` di HP.

### Penting

- Pakai **Node 22 atau lebih baru** (database memakai `node:sqlite`).
- Backup rutin dari menu **Setelan → Download Backup**.
- Setelah punya URL publik, bookmark di HP. Bisa juga **Add to Home Screen** di Safari/Chrome supaya terasa seperti aplikasi.
