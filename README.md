# Gragon Store — Marketplace Akun Game & Digital

Frontend statis (HTML/CSS/vanilla JS) + backend Supabase (database, auth, realtime, storage).
Deploy ke Vercel tanpa build step. Pembelian berjalan **manual via WhatsApp admin**.

```
Browser → Supabase (PostgreSQL · Auth · Realtime · Storage)
```

## 1. Setup Supabase
1. Buat project di [supabase.com](https://supabase.com), ambil **Project URL** dan **anon/publishable key**.
2. Isi keduanya di `public/js/supabase-client.js`. Jangan pernah memasukkan `service_role` key.
3. Buka **SQL Editor** lalu jalankan:
   - **Database baru** → `supabase/schema.sql` (satu file, semua sudah termasuk).
   - **Database lama (PT Gondam)** → jalankan `supabase/schema.sql`, lalu `supabase/upgrade-from-gondam.sql`.
     Data tetap aman; kode akun `ARZ-xxxxxx` otomatis menjadi `GRG-xxxxxx`.
4. Buat admin pertama: Authentication → Add user, lalu
   ```sql
   update public.profiles set role = 'admin' where id = 'UUID_USER_TADI';
   ```
5. Login admin di `/masuk`, dashboard di `/dashboard`.

## 2. Alur pembelian
1. Pembeli klik **Beli** → isi nama & WhatsApp.
2. RPC `create_whatsapp_order` mengunci akun (`RESERVED`), menghitung harga final di server, dan membuat nomor pesanan `GS-YYYYMMDD-XXXXXX` (maks. 3 pesanan aktif per nomor).
3. Browser membuka WhatsApp admin dengan pesan siap kirim.
4. Admin → Dashboard → **Transaksi** → **Approve** (akun jadi `SOLD`, data login terbuka untuk pembeli) atau **Tolak** (akun kembali `AVAILABLE`).
5. Pembeli memantau di `/pesanan?invoice=...` atau `/lacak-pesanan`.
6. Pesanan yang melewati masa tahan (default 120 menit, atur di Admin → Pengaturan) otomatis kedaluwarsa.

Nomor admin ada di satu tempat: `ADMIN_WA` di `public/js/app.js`.

## 3. Struktur & URL bersih
Tanpa `.html` di alamat (`cleanUrls` di `vercel.json`). Link lama otomatis diarahkan ke yang baru.

| URL | File | Fungsi |
|---|---|---|
| `/` | `home.html` | Beranda |
| `/katalog` | `katalog.html` | Daftar & filter akun |
| `/akun?id=...` | `akun.html` | Detail akun, beli, tawar |
| `/jual-akun` | `jual-akun.html` | Pengajuan jual akun |
| `/kalkulator` | `kalkulator.html` | Kalkulator harga Free Fire |
| `/pesanan?invoice=...` | `pesanan.html` | Status pesanan pembeli |
| `/lacak-pesanan` | `lacak-pesanan.html` | Cari pesanan via nomor |
| `/cara-kerja` · `/bantuan` | `cara-kerja.html` · `bantuan.html` | Panduan & FAQ |
| `/masuk` | `masuk.html` | Login admin |
| `/dashboard` | `dashboard.html` | Panel admin |

```
public/  css/ (style · marketplace · calculator · admin · gragon)  js/  img/
supabase/  schema.sql · upgrade-from-gondam.sql
vercel.json  # cleanUrls + redirect dari nama lama
```

## 4. Ganti tampilan
Warna ada di `:root` pada `public/css/style.css` (`--accent`, `--gradient-brand`, dst.).
Logo: ganti `public/img/logo-full.png` (hero) dan `logo-mark.png` (navbar/footer, rasio 1:1).

## 5. Catatan
- Tabel admin otomatis tampil sebagai kartu di HP (`js/table-responsive.js`).
- Edge Function Telegram, QRIS/DANA, dan upload bukti bayar sudah dihapus karena tidak dipakai alur WhatsApp.
- Setelah upgrade, hapus bucket `payment-proofs` dan `payment-assets` secara manual lewat Supabase → Storage.
