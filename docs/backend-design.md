# FinKasTra — Draf Desain Teknis Backend

**Status:** Draft untuk ditinjau  
**Tanggal:** 27 Oktober 2026  
**Dasar audit:** `Fahry12-max/FinTrack.gihub.io`, branch `main`

## 1. Rekomendasi arsitektur

Pertahankan frontend HTML/CSS/JavaScript yang ada dan hubungkan ke Supabase Auth serta PostgreSQL. **Supabase dipilih sebagai backend awal.** Kesesuaiannya berasal dari kebutuhan akun pengguna, PostgreSQL, dan kebijakan Row Level Security (RLS) yang membatasi baris data dengan `auth.uid()`. Semua tabel milik pengguna harus memakai RLS; kunci `service_role` tidak boleh dikirim ke browser. [Dokumentasi RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

Perhitungan uang tetap dijalankan di database untuk operasi yang mengubah transaksi. Browser mengirim permintaan melalui fungsi database (RPC), sehingga validasi, pemeriksaan saldo, pencegahan duplikasi, dan penyimpanan berlangsung atomik. Supabase mendukung pemanggilan fungsi database melalui RPC. [Dokumentasi database functions](https://supabase.com/docs/guides/database/functions)

## 2. Model data usulan

Semua nominal menggunakan bilangan bulat rupiah (`bigint`), bukan floating-point. Ini sesuai dengan nominal IDR tanpa pecahan dalam aplikasi dan mencegah pembulatan pecahan. PostgreSQL menyediakan tipe `bigint`; dokumentasi Supabase juga menyarankan `numeric` untuk nilai pecahan yang harus presisi. [Tipe data tabel](https://supabase.com/docs/guides/database/tables)

### `profiles`

- `user_id uuid primary key references auth.users(id)`
- `display_name text null`
- `created_at timestamptz`

Profil dibuat saat pendaftaran atau pertama kali login. Kredensial dan sesi dikelola oleh layanan autentikasi.

### `accounts`

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `name text not null`
- `type`: `cash`, `ewallet`, `bank`, atau `investment`
- `opening_balance bigint not null check (opening_balance >= 0)`
- `created_at`, `updated_at timestamptz`
- Unique `(user_id, id)` untuk mendukung foreign key transaksi yang memastikan akun milik pengguna yang sama.
- Unique case-insensitive `(user_id, lower(name))` agar nama akun tidak berulang untuk satu pengguna.

### `transactions`

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `kind`: `income`, `expense`, atau `transfer`
- `occurred_on date not null`
- `amount bigint not null check (amount > 0)`
- `from_account_id uuid null`, `to_account_id uuid null`
- `category text not null`, `note text null`
- `idempotency_key uuid not null`
- `created_at`, `updated_at timestamptz`
- Foreign key komposit `(user_id, from_account_id)` dan `(user_id, to_account_id)` ke `accounts(user_id, id)` untuk mencegah transaksi lintas pemilik.
- `income`: akun tujuan wajib, akun sumber kosong.
- `expense`: akun sumber wajib, akun tujuan kosong.
- `transfer`: kedua akun wajib dan harus berbeda.
- Unique `(user_id, idempotency_key)` untuk menolak pengiriman ulang permintaan yang sama.

Investasi bukan jenis arus kas keempat. Investasi dicatat sebagai `transfer` dari akun uang ke akun berjenis `investment`, dengan kategori `Investasi` dan subkategori opsional seperti saham atau emas. Ini membuat saldo kedua akun dan total aset mengikuti satu aturan transfer yang sama.

Saldo akun dihitung dari saldo awal, pemasukan yang masuk, pengeluaran yang keluar, dan transfer masuk/keluar. Transfer investasi tidak mengubah total aset. Indeks awal: `(user_id, occurred_on)` dan indeks pada kedua kolom akun transaksi.

### `goals`

- `id uuid primary key`, `user_id uuid not null`
- `name text not null`, `target_amount bigint not null check (target_amount > 0)`
- `period`: `weekly`, `monthly`, atau `one_time`
- `start_date date`, `end_date date null`, `active boolean`
- `created_at`, `updated_at timestamptz`

Progress target dihitung dari transfer masuk ke akun investasi dalam periode target. Target tidak dibuat otomatis. Rp30.000/minggu hanya contoh visual dan tidak boleh dianggap sebagai target milik pengguna. Pengguna membuat target sendiri jika ingin memakai fitur target.

## 3. Aturan akses dan integritas

1. Pengguna hanya dapat membaca profil, akun, transaksi, dan target dengan `user_id = auth.uid()`.
2. Aktifkan RLS pada seluruh tabel pengguna. Buat kebijakan terpisah untuk operasi baca, tambah, ubah, dan hapus; jangan mengandalkan filter frontend.
3. Operasi mutasi transaksi memakai RPC atomik. Fungsi mengambil identitas dari sesi terverifikasi, memeriksa kepemilikan akun, mengunci baris akun sumber saat memeriksa saldo, menolak saldo negatif, lalu menulis transaksi. Penguncian akun sumber mencegah dua permintaan bersamaan memakai saldo yang sama.
4. Batasi eksekusi RPC untuk pengguna terautentikasi. Jika fungsi memakai `SECURITY DEFINER`, gunakan `search_path` tetap, jangan menerima `user_id` bebas dari klien, periksa `auth.uid()` secara eksplisit, dan tetap uji RLS. Fungsi database dapat memiliki hak yang melewati RLS, sehingga batas ini harus diperiksa saat implementasi. [RLS dan fungsi database](https://supabase.com/docs/guides/database/postgres/row-level-security)
5. Penghapusan atau perubahan transaksi harus memeriksa ulang saldo hasilnya. Jika koreksi membuat saldo negatif, sistem menolak koreksi dan meminta pengguna mencatat transaksi penyeimbang atau memperbaiki riwayat yang salah.
6. Kegagalan jaringan boleh dicoba ulang dengan `idempotency_key`; aplikasi tidak membuat transaksi ganda akibat retry.

## 4. Migrasi data browser

1. Setelah login, tampilkan pilihan **Impor data dari browser ini**. Tidak memindahkan data tanpa tindakan eksplisit pengguna.
2. Jika `finkastra_v2_data` valid, gunakan itu sebagai sumber utama. Gunakan `fintrack_tx` hanya bila data V2 tidak ada; jangan mengimpor keduanya karena kunci legacy juga disinkronkan oleh aplikasi.
3. Tampilkan pratinjau jumlah akun/transaksi, saldo hasil hitung, transaksi tidak valid, dan kemungkinan duplikasi sebelum menyimpan.
4. Ubah transaksi investasi V1 menjadi transfer dari akun uang ke akun investasi. Simpan pemetaan ID lokal ke UUID server agar proses bisa dilanjutkan dengan aman.
5. Jalankan impor dalam satu operasi database dengan `migration_id` unik per pengguna dan sumber data. Retry dengan ID sama tidak boleh menggandakan data.
6. Pertahankan `localStorage` dan sediakan ekspor JSON sampai pengguna melihat data cloud berhasil dimuat ulang setelah login ulang.
7. Saldo awal bawaan Rp356.000 dan Rp149.000 sudah dikonfirmasi sebagai contoh. Akun bawaan baru harus mulai dari Rp0. Saat migrasi, kenali nilai seed bawaan itu dan ubah menjadi Rp0; pertahankan saldo awal akun tambahan yang dimasukkan pengguna. Pratinjau migrasi harus menunjukkan perubahan saldo dan menandai akun yang menjadi negatif setelah seed dihapus agar pengguna dapat merekonsiliasi sebelum impor.

## 5. Tahapan implementasi dan verifikasi

1. **Fondasi:** buat proyek dan skema database development, kebijakan RLS, migrasi SQL yang tersimpan di repo, serta konfigurasi frontend tanpa rahasia server.
2. **Autentikasi dan isolasi:** registrasi, login, logout, pemulihan sesi, dan uji dua akun yang tidak dapat membaca data silang.
3. **Akun dan transaksi:** baca/tambah/ubah/hapus melalui API/RPC; validasi saldo dan transfer atomik.
4. **Target dan ringkasan:** simpan target per pengguna, hitung progress dari transaksi yang sama, dan samakan angka dashboard dengan saldo akun.
5. **Migrasi:** pratinjau, impor idempoten, login ulang, dan ekspor/pemulihan.
6. **Rilis:** verifikasi regresi V2, backup dan pemulihan, HTTPS, pengukuran API p95, lalu deployment setelah persetujuan pemilik produk.

## Status fondasi development

- Proyek Supabase `finkastra-dev` aktif di organisasi Zenith, region `ap-southeast-1` (Singapura), project ref `vxixcxxulclgtyfrwhnp`.
- Migrasi `20261027135638 / finkastra_initial_schema` sudah diterapkan pada database development.
- Tabel `profiles`, `accounts`, `transactions`, dan `goals` sudah dibuat dengan RLS aktif serta kebijakan kepemilikan per `auth.uid()`.
- Grant Data API diberikan eksplisit kepada role `authenticated`; tidak ada grant tabel untuk `anon`. Tabel transaksi saat ini hanya dapat dibaca; penulisan menunggu RPC/validasi saldo atomik.
- Belum ada pengguna atau data keuangan di database. Belum ada integrasi frontend, autentikasi aplikasi, atau migrasi data lokal.
- Pemeriksaan Supabase Security Advisor tidak menemukan lint. Performance Advisor hanya menandai indeks baru yang belum terpakai; basis data belum menerima trafik.
- Perubahan skema ada di riwayat migrasi proyek, tetapi belum dicatat sebagai file migrasi di repo GitHub.

### Kriteria penerimaan tahap desain

- Semua entitas pengguna memiliki pemilik eksplisit dan kebijakan RLS.
- Rumus saldo tunggal mencakup pemasukan, pengeluaran, transfer, dan investasi.
- Aturan saldo negatif, edit/hapus transaksi, target mingguan, dan saldo awal disepakati.
- Migrasi bisa dipratinjau, diulang tanpa duplikasi, dan data lokal tetap tersedia sampai verifikasi selesai.
- Backend yang dipilih dan batas biaya/hosting disetujui sebelum fondasi dibuat.

## 6. Keputusan yang sudah disepakati

- Supabase menjadi backend awal.
- Saldo bawaan Rp356.000 dan Rp149.000 hanya contoh; akun baru dimulai dari Rp0 dan angka seed tersebut tidak dihitung sebagai aset saat migrasi.
- Target Rp30.000/minggu hanya contoh; pengguna tidak memperoleh target otomatis.

Sebelum migrasi diluncurkan, pratinjau harus memperlihatkan saldo sebelum dan sesudah penghapusan saldo contoh serta memberi kesempatan pengguna memperbaiki saldo awal. Jika transaksi historis bergantung pada saldo contoh, sistem tidak boleh menyembunyikan hasil saldo negatif atau mengubah transaksi secara diam-diam.

Dokumen ini tetap menjadi draf desain untuk implementasi. Skema awal sudah diterapkan pada proyek development; autentikasi aplikasi, RPC transaksi, integrasi frontend, dan migrasi data belum diterapkan.

