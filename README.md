# Keuangan Tim Sepak Bola RT

Sistem keuangan tim dengan database SQLite bawaan Node.js.

## Fitur

- Pembayaran pemain dapat dialokasikan ke iuran saja, Custom Bola saja, atau keduanya.
- Riwayat transaksi dapat difilter menurut tanggal, jenis, dan pemain.
- Data baju bola mencatat pemain, nama cetak, nomor punggung, dan ukuran. Status lunas otomatis mengikuti pembayaran Custom Bola dibanding target per pemain.
- Data baju bola termasuk dalam file backup dan restore.
- Login admin dapat mengelola semua data. Login user dapat melihat seluruh data dan hanya menambah, mengubah, atau menghapus data baju bola.

## Login

Saat pertama kali menjalankan aplikasi, atur environment variables `AUTH_ADMIN_PASSWORD` dan `AUTH_USER_PASSWORD`. Keduanya harus minimal 8 karakter. Akun tetap memakai username `admin` dan `user`; password disimpan sebagai hash bersalt di database SQLite dan tidak perlu dimasukkan lagi setelah akun dibuat.

Di PowerShell, isi keduanya sebelum menjalankan server pertama kali:

```powershell
$env:AUTH_ADMIN_PASSWORD = Read-Host "Password akun admin"
$env:AUTH_USER_PASSWORD = Read-Host "Password akun user"
npm start
```

Jangan masukkan password ke source code atau commit ke Git. Untuk hosting, atur kedua environment variables tersebut di pengaturan layanan sebelum deploy pertama. Gunakan HTTPS untuk aplikasi yang dapat diakses melalui internet.

## Cara menjalankan di komputer

1. Install [Node.js 22+](https://nodejs.org) (sudah termasuk npm).
2. Di folder project, jalankan:

```bash
npm install
npm start
```

3. Buka browser: [http://localhost:3000](http://localhost:3000)

Jika belum ada akun, jalankan server dengan kedua environment variables tersebut tersedia di terminal. Setelah akun dibuat, password hash tersimpan di `database.db`; jangan menghapus atau mengganti database jika ingin mempertahankan akun.

Di HP yang **satu Wi-Fi**, pakai alamat jaringan yang muncul di terminal (contoh `http://192.168.x.x:3000`).

## Buka di HP tanpa Wi-Fi yang sama (deploy)

Kalau HP memakai data seluler atau Wi-Fi berbeda, `localhost` dan IP `192.168.x.x` **tidak bisa** dipakai. Aplikasi harus dipasang di internet (punya alamat `https://...`).

Aplikasi ini butuh **Node.js + file database**, jadi jangan pakai GitHub Pages / Netlify (itu hanya untuk file HTML statis).

### Opsi paling mudah: Railway

1. Buat akun di [railway.app](https://railway.app) (bisa login dengan GitHub).
2. Upload project ke GitHub (atau pakai Railway CLI).
3. Di Railway: **New Project** → **Deploy from GitHub repo**.
4. Di pengaturan service, tambahkan **Volume** dengan mount path `/data`.
5. Tambahkan variables berikut di tab **Variables**:
   - `DATABASE_PATH=/data/database.db`
   - `AUTH_ADMIN_PASSWORD` = password awal admin
   - `AUTH_USER_PASSWORD` = password awal user
6. Railway otomatis menjalankan `npm start` dan memakai `PORT` dari environment. Database dan akun dibuat pertama kali di volume; jangan hapus volume agar data tetap ada.
7. Setelah deploy selesai, buka **Settings → Networking → Generate Domain**.
8. Link itu (contoh `https://keuangan-tim-xxxx.up.railway.app`) bisa dibuka di HP dari mana saja.

#### Memindahkan data lokal ke Railway

1. Login sebagai admin di aplikasi lokal, lalu buka **Setelan → Download Backup** untuk mengunduh file JSON.
2. Setelah Railway selesai deploy, buka domain Railway dan login sebagai admin dengan password yang disetel di variables.
3. Buka **Setelan → Restore dari File**, pilih JSON backup tadi, lalu konfirmasi. Pemain, transaksi, pengaturan, dan data baju akan dimasukkan ke database pada volume Railway. Akun login Railway tetap memakai password dari variables.

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
