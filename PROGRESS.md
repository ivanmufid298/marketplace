# Progress

Status pengerjaan terhadap scope MVP di [PRD.md](PRD.md) bagian 18. File ini diperbarui setiap ada perubahan status, sedangkan [README.md](README.md) hanya berisi gambaran umum dan cara menjalankan.

**Pembaruan terakhir:** 12 Oktober 2026

## Legenda

| Status | Arti |
|---|---|
| Belum | Belum ada UI maupun logika. |
| UI sebagian | Layar sudah ada dengan data contoh di memori, tetapi sebagian alur PRD belum tercakup. |
| UI | Seluruh alur layar sudah ada dengan data contoh. Belum terhubung ke backend. |
| Selesai | UI dan backend berjalan serta lolos acceptance criteria. |

Belum ada item yang berstatus Selesai karena backend (Supabase, R2) belum dikerjakan.

## Scope MVP

| Item PRD | Status | Keterangan |
|---|---|---|
| Katalog ready stock/PO dengan pencarian dan filter | UI sebagian | Katalog, pencarian, filter kategori, dan sort harga ada. Belum ada tipe ready stock vs PO. Sort "Terpopuler" belum mengurutkan apa pun. |
| Detail produk, varian, dan batch PO | UI sebagian | Detail produk ada. Varian warna/ukuran dan batch PO (deadline, kuota, ETA) belum ada. |
| Auth buyer/admin | UI sebagian | **Sudah ada:** dialog masuk/daftar dengan validasi; guest bisa menjelajah, memakai wishlist, dan melihat widget chat, sedangkan keranjang, checkout, chat, dan Pesanan saya meminta login lalu aksinya dilanjutkan; menu akun di header; adapter Supabase Auth; tabel `profiles` dengan kolom `role` yang tidak bisa diubah pemiliknya (migrasi SQL); guard `/admin` berlapis (`proxy.ts` dan layout panel) yang memverifikasi sesi ke server Auth dan role ke database; halaman `/admin/login` khusus; tombol Keluar admin; mode demo yang tertutup di production (allowlist). **Belum ada:** pengujian daftar lewat form dan konfirmasi email di project Supabase sungguhan (hak akses, RLS, trigger, dan guard `/admin` sudah diuji di project dev), UI profil (telepon, alamat), policy admin untuk membaca semua profil, lupa kata sandi, rate limiting, dan RLS untuk tabel lain karena tabel lainnya belum ada. |
| Cart per akun, checkout, alamat | UI sebagian | Menambah ke cart dan membuka cart butuh login; produk yang dipilih otomatis masuk setelah berhasil masuk. Cart dengan quantity dan batas stok tersimpan di `localStorage` per akun, bertahan setelah reload dan kembali saat akun yang sama login lagi. Checkout 3 langkah ada. Belum ada alamat tersimpan di akun dan cart belum di database. |
| Ongkir manual berbasis zona | Belum | Checkout memakai 3 opsi flat yang di-hardcode. Halaman ongkir admin belum mengenal zona kota/provinsi. |
| Reservasi stok/kuota dan order expiry | Belum | Aturan 2 jam dan batas upload ulang 2 jam belum diimplementasikan. |
| Transfer manual dan upload bukti | UI | Simulasi saja: cek ukuran 5 MB, file tidak tersimpan, MIME type belum divalidasi. |
| Pembatalan order | UI sebagian | Admin bisa membatalkan pesanan dengan alasan wajib sampai pembeli menandai selesai, dan mencatat refund untuk pesanan yang sudah dibayar. Pembeli belum bisa membatalkan sendiri sebelum upload bukti. |
| Histori dan tracking order buyer | UI sebagian | Menu "Pesanan saya" (ikon paket di header, tab "Pesanan" di navigasi bawah mobile) menampilkan pesanan pembeli dengan status Menunggu pembayaran, Barang sedang dikirim, Selesai, atau Dibatalkan. Checkout membuat pesanan baru, dan tombol "Pesanan selesai" (dengan konfirmasi) muncul saat barang sedang dikirim. Belum ada halaman `/orders` dan `/orders/[orderNumber]`, dan pembeli belum bisa membatalkan pesanan. |
| Admin: produk, varian, PO, order, pembayaran, zona ongkir | UI sebagian | Produk, pesanan, pembayaran, dan ongkir ada. Belum ada batch PO dan varian. Tolak pembayaran belum meminta alasan. Pembayaran dan Pesanan memakai data yang sama: menerima pembayaran mengubah status pesanan menjadi "Barang sedang dikirim". |
| Promo, voucher, banner, popup, scheduler dasar | UI sebagian | Layar admin dan form scheduler ada, tetapi form belum menyimpan. Storefront belum menampilkan banner, popup, atau input voucher. |
| Widget chat buyer dan menu admin Interactions | UI sebagian | Widget selalu tampil. Guest melihat ajakan login sebagai ganti kolom pesan, buyer yang login bisa mengirim pesan. Inbox admin berjalan, tetapi chat storefront dan inbox admin belum terhubung satu sama lain. |
| Rating/review dan moderasi di admin | UI sebagian | Moderasi di admin ada. Pembeli bisa menulis dan mengubah ulasan (rating 1–5 dan teks) dari "Pesanan saya", hanya untuk item di pesanan berstatus Selesai. Ulasan baru tersimpan di memori browser dan belum muncul di admin maupun detail produk, yang masih placeholder yang sama untuk semua produk. |
| Statistik bulanan/tahunan | UI | Grafik dan angka masih statis. |
| Analitik kunjungan dan jumlah dilihat per produk | UI | Grafik "Statistik pengunjung" (bulanan/tahunan) dan kartu "Kunjungan toko" (total kunjungan dan sebaran perangkat) di dashboard dan jumlah dilihat (ikon mata) per produk di etalase admin. Angkanya data contoh. Belum ada pencatatan di storefront, sesi anonim, deteksi tipe perangkat, dan filter bot. |
| RLS dan audit log | Belum | |

## Selesai sejauh ini

- **Role admin dan guard `/admin`.** Role disimpan hanya di `profiles` (`supabase/migrations/20261012000000_profiles_and_roles.sql`): pendaftaran selalu menjadi `buyer`, kolom `role` tidak bisa diubah lewat API (column privilege, bukan hanya RLS), dan `is_admin()` dibuat `SECURITY DEFINER` dengan `search_path` kosong. `/admin` dijaga `proxy.ts` (verifikasi `getUser()` ke server Auth dan `is_admin()` ke database) dan layout `(panel)`. Halaman `/admin/login` khusus dengan validasi `next=`. Gagal atau tidak jelas selalu berarti ditolak.
- **Mode demo tertutup di production.** `lib/auth/config.ts` memakai allowlist: demo hanya di `next dev`, atau di Vercel Preview dengan `NEXT_PUBLIC_DEMO_MODE=1` (`VERCEL_ENV` diteruskan lewat `next.config.ts`). Tanpa itu dan tanpa env Supabase, hasilnya "terkunci": login mati, `/admin` terkunci, storefront tetap bisa dijelajahi. Admin dalam mode demo menampilkan banner.

- Status pesanan disederhanakan jadi tiga langkah otomatis: **Pending** → **Barang sedang dikirim** (saat admin menerima pembayaran) → **Selesai** (saat pembeli menekan "Pesanan selesai"), ditambah **Dibatalkan**. Halaman admin Pesanan (`/admin/orders`) menampilkan satu kolom Status, tanpa kolom pembayaran, dengan detail berisi stepper tiga langkah, barang, riwayat, serta tombol batalkan (alasan wajib) dan catat refund untuk pesanan yang sudah dibayar. Halaman Pembayaran, Pesanan, dan "Pesanan saya" membaca data yang sama lewat `lib/orders-store.ts`, dan checkout pembeli membuat pesanan baru di sana.
- Login wajib untuk menambah ke keranjang, checkout, chat, dan Pesanan saya, sementara guest tetap bisa menjelajah dan memakai wishlist. Widget chat tetap tampil. Lapisan auth dibuat sebagai adapter (`lib/auth/`): Supabase Auth jika variabel lingkungan diisi, login demo jika kosong. Keranjang disimpan per akun di `localStorage`, jadi bertahan setelah reload dan kembali saat akun yang sama login.
- Menu "Pesanan saya" di storefront (header desktop dan navigasi bawah mobile) dengan form ulasan untuk pesanan yang selesai. Tab navigasi bawah menyala sesuai panel yang terbuka.
- Ikon chat diganti ke bentuk bubble standar (storefront dan menu Interactions di admin). Tombol "Tandai selesai" di inbox admin versi mobile kini memakai ikon ceklis saat thread terbuka dan ikon undo saat thread sudah selesai.
- Keputusan produk MVP difinalkan di PRD v0.3.
- Prototype HTML statis dimigrasikan ke Next.js App Router (storefront di `/`, admin di `/admin/*`). Prototype asli disimpan di `prototype/`.
- Tailwind CSS v4 terpasang dengan token warna. Tampilan masih memakai CSS prototype yang di-scope ke `.store` dan `.admin`.
- Komponen disusun ulang dengan atomic design (atoms, molecules, organisms, templates). Hasil render HTML diverifikasi identik dengan sebelum refactor.
- UI analitik kunjungan di dashboard admin (grafik statistik pengunjung, total kunjungan, sebaran perangkat) dan jumlah dilihat per produk di etalase (data contoh). Grafik penjualan dan pengunjung memakai komponen `LineChart` yang sama, dihitung dari deret angka. Aturan pencatatan ditulis di PRD v0.4.
- Seluruh teks UI dipindahkan ke `content/id.json` dan dipanggil lewat `t("key")` dengan key yang diperiksa TypeScript. Data contoh dipisah ke `lib/mock/`.

## Sedang dan berikutnya

Urutan mengikuti dependensi teknis:

1. Menyelesaikan uji Supabase Auth di project sungguhan yang tersisa (daftar lewat form, konfirmasi email, klik di browser; checklist di README), menindaklanjuti temuan advisors, lalu menambah lupa kata sandi dan UI profil.
2. Skema database: kategori, produk, varian, foto, batch PO.
3. Cart, reservasi stok/kuota, order expiry, dan checkout yang menyimpan pesanan ke database (fulfillment group per kelompok pengiriman ditunda).
4. Pembayaran manual, riwayat bukti transfer, dan penyimpanan privat di R2.
5. Batch PO di admin, serta menyambungkan order, interaction, review, promo, voucher, banner, popup, dan scheduler ke database.
6. RLS, audit log, rate limiting, dan automated testing.
7. Deploy ke Cloudflare Workers.

Utang teknis yang sudah diketahui:

- **Status pengujian auth dan admin.** *Sudah diuji, otomatis:* pemilihan mode untuk 19 kombinasi env, validasi `next=`, keputusan akses admin termasuk semua jalur gagal (64 tes, `npm test`); migrasi SQL di Postgres sungguhan lewat PGlite, mencakup idempotensi, backfill, trigger sign-up, hak akses buyer/admin/anon, dan tidak bisa mengubah role sendiri (40 pengecekan, `npm run test:sql`); build per mode (production tanpa env, flag tanpa `VERCEL_ENV`, production + flag, preview tanpa flag, preview + flag, dev) dan alur browser terhadap **server Supabase tiruan** yang dibuat sendiri: pengunjung anonim, pembeli ditolak, cookie dengan role palsu, token admin palsu, `next=` berbahaya, Auth 503, dan server mati (46 pengecekan). *Sudah diuji, terhadap project Supabase dev sungguhan (`vancy-kithz`, 12 Oktober 2026):* migrasi `profiles_and_roles` dijalankan lewat MCP Supabase, isinya identik dengan file (md5 sama), dan dijalankan ulang tanpa error. Hak akses di Postgres Supabase (peran `authenticated` dan `anon` disimulasikan dengan `SET ROLE` dan klaim JWT, di dalam transaksi yang dibatalkan): 19 pengecekan lolos, yaitu user biasa tidak bisa mengubah `role` (termasuk `set role = role` dan `id`) tetapi bisa mengubah `full_name` dan `phone` sendiri, tidak bisa mengubah, menambah, atau menghapus profil orang lain, sign-up dengan metadata `role=admin` tetap `buyer`, `anon` tidak bisa membaca `profiles` atau memanggil `is_admin()`, dan `is_admin()` benar setelah dipromosikan lewat SQL. Alur HTTP penuh terhadap build production lokal dengan **login sungguhan** (user uji dibuat lewat SQL, dihapus setelahnya): 32 pengecekan lolos, yaitu pengunjung anonim ditolak, kata sandi salah ditolak Supabase, pembeli ditolak di `/admin`, admin diterima, `next=` valid dan 5 variasi berbahaya, cookie sesi palsu, dan lewat PostgREST: RPC `is_admin` untuk buyer, admin, dan anon, serta `PATCH role`, `INSERT`, `DELETE` oleh pembeli ditolak. *Belum diuji:* **daftar lewat form** (trigger sign-up baru diuji dengan INSERT langsung ke `auth.users`, bukan lewat GoTrue), **konfirmasi email**, klik-klik di browser sungguhan (dialog login storefront dan `/admin/login`), dan deploy di Vercel. Uji manual yang tersisa ada di checklist README (bagian Autentikasi dan akses admin).
- **Temuan advisors Supabase pada project dev (12 Oktober 2026), belum ditindaklanjuti.** Level WARN semuanya. (1) `public.rls_auto_enable()` (fungsi bawaan project) bisa dieksekusi oleh `anon` dan `authenticated` sebagai SECURITY DEFINER ([0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)); usulan: migrasi baru yang mencabut `EXECUTE` dari `public, anon, authenticated` setelah dipastikan fungsi itu hanya dipanggil lewat event trigger. (2) `public.is_admin()` bisa dieksekusi oleh `authenticated` ([0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)); ini disengaja karena `proxy.ts` memanggilnya lewat RPC dan hasilnya hanya "apakah saya admin", jadi diterima. Kalau guard nanti membaca `profiles` langsung, pindahkan fungsinya ke schema non-publik. Advisor performance: tidak ada temuan.
- **Versi migrasi tidak sama.** Supabase mencatat migrasi di project dev dengan versi `20261012061023`, sedangkan berkas lokal bernama `20261012000000_profiles_and_roles.sql`. Samakan nama berkas (atau `supabase migration repair`) sebelum memakai Supabase CLI atau `db push`.
- **Keputusan fail-closed.** Tanpa env Supabase, production tidak memakai login demo: hasilnya login mati dan `/admin` terkunci. Demo hanya boleh jika `NODE_ENV === "development"`, atau `NEXT_PUBLIC_DEMO_MODE=1` **dan** `VERCEL_ENV === "preview"`. `NODE_ENV` yang kosong atau tidak dikenal juga terkunci (lebih ketat daripada sekadar "bukan production"). Dipilih allowlist karena host selain Vercel tidak punya `VERCEL_ENV`; denylist akan meloloskan flag demo di sana. Dampak: **deploy Vercel tanpa env Supabase hanya bisa dijelajahi.** Flag demo hanya boleh diisi di environment Preview.
- **Risiko: `proxy.ts` di OpenNext/Cloudflare belum diverifikasi.** PRD menargetkan Cloudflare lewat `@opennextjs/cloudflare`, dan belum dipastikan apakah `proxy.ts` (runtime Node di Next 16) didukung di sana. Cek saat langkah deploy Cloudflare. Sampai itu jelas, guard di layout `(panel)` dan RLS adalah perlindungan yang tidak bergantung pada proxy.
- **Guard layout bukan guard per navigasi.** Layout tidak dirender ulang saat pindah halaman di browser. Saat data admin pindah ke database, setiap query dan Route Handler wajib dilindungi RLS dan pengecekan `is_admin()` sendiri.
- **Pecah `StoreProvider` sebelum katalog dan pesanan pindah ke database.** `components/providers/store-provider.tsx` sudah 430 baris dan memegang banyak domain (katalog, keranjang, checkout, chat, ulasan, panel, akun). Pecah menjadi beberapa provider atau hook per domain sebagai tugas tersendiri **sebelum** data dipindah ke Supabase. Tidak disentuh pada tugas auth.
- **Rate limiting login** belum ada (PRD bagian 16). Supabase Auth punya batas bawaan; tambahkan batas sendiri untuk login, pembuatan order, dan upload pada langkah berikutnya.
- **Pesanan contoh (`buyerId` seperti "nadia") tidak cocok dengan UUID Supabase.** Itu wajar dan sengaja tidak diubah: akun Supabase mulai tanpa pesanan, sedangkan mode demo tetap menampilkan pesanan contoh.
- **Dependensi dengan advisory keamanan (audit 12 Oktober 2026).** `next@16.3.7` kena beberapa advisory tingkat tinggi (di antaranya cache poisoning SSG/ISR pada hosting sendiri dan SSRF pada optimasi gambar), diperbaiki di 16.3.8; `source-map-js` juga ditandai. Perbarui `next` ke versi terbaru dan jalankan ulang build serta tes sebagai tugas tersendiri.
- Pesanan, ulasan, dan chat masih di browser dan belum terikat ke akun Supabase (`buyerId` memakai id pengguna, tetapi data belum di database).
- Pesanan disimpan di `localStorage` lewat `lib/orders-store.ts` agar storefront dan admin berbagi data saat demo. Ganti dengan query database. Ada tombol "Reset data contoh" di sidebar admin untuk mengembalikan data awal.
- Status order MVP hanya tiga langkah. Status pengiriman per kelompok dan alur PO yang rinci dari PRD ditunda sampai dibutuhkan.
- Konversi CSS prototype ke utility Tailwind, komponen demi komponen.
- Gabungkan `Button` dan `AdminButton` (serta atom lain yang terpisah per konteks) setelah CSS dikonversi ke Tailwind.
- Nama toko berbeda per produk di data contoh (`shop`) tidak sesuai dengan model single seller.
- Kategori contoh (Rumah, Elektronik) belum mencerminkan fokus aksesori dan barang bergaya feminin.
- Project Vercel perlu Framework Preset diubah ke Next.js dan Output Directory dikosongkan.
