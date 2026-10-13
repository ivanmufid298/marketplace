# Marketplace Pink & Ivory

Prototype UI/UX toko online **single seller** untuk produk ready stock, jastip, dan pre-order barang impor. Repository ini memuat halaman customer serta dashboard admin dengan tampilan responsif untuk mobile dan desktop.

> Status saat ini: UI sudah dimigrasikan ke **Next.js App Router** (roadmap langkah 1), tetapi masih memakai data contoh di memori browser yang kembali ke kondisi awal saat halaman dimuat ulang. Belum ada database, object storage, maupun proses pembayaran sungguhan. Autentikasi memakai Supabase Auth jika variabel lingkungan diisi (lihat bagian Autentikasi), atau login demo jika kosong. Pengecualian: pesanan disimpan di `localStorage` browser dan dibaca bersama oleh storefront dan admin, jadi alur pembayaran diterima → barang dikirim → pesanan selesai bisa dicoba dari awal sampai akhir. Tombol "Reset data contoh" di sidebar admin mengembalikan data awal. Prototype HTML statis yang asli disimpan di folder `prototype/` sebagai referensi visual.

## Fitur prototype

### Customer

- Homepage, hero banner, kategori, Hot Promo, pencarian, dan sorting produk.
- Detail produk, informasi stok terbatas, rating, dan daftar review.
- Wishlist lokal dan keranjang belanja (keranjang per akun, butuh login).
- Checkout tiga tahap: alamat, pengiriman, dan transfer manual. Checkout membuat pesanan baru dengan status Pending.
- Upload bukti pembayaran maksimal 5 MB sebagai simulasi UI.
- Menu **Pesanan saya** (ikon paket di header, tab Pesanan di navigasi bawah mobile): status pesanan, tombol "Pesanan selesai" saat barang sedang dikirim, dan form ulasan (rating dan teks) untuk pesanan yang selesai.
- Widget chat untuk menghubungi admin. Widget selalu tampil, tetapi mengirim pesan memerlukan login.
- Guest bisa menjelajah dan memakai wishlist. Menambah ke keranjang, checkout, chat, dan Pesanan saya meminta login (dialog masuk/daftar), lalu aksinya dilanjutkan otomatis. Produk yang dipilih langsung masuk ke keranjang setelah berhasil masuk.
- Navigasi responsif untuk mobile dan desktop.

### Admin

- Halaman login admin khusus (`/admin/login`) dengan tampilan dua panel yang responsif.
- Dashboard: statistik penjualan, statistik pengunjung, total kunjungan, dan sebaran perangkat, bulanan/tahunan.
- Pengelolaan etalase produk, dengan jumlah dilihat per produk.
- Pesanan: daftar dengan cari dan filter status, detail, riwayat, batalkan pesanan, dan catat refund.
- Verifikasi pembayaran. Menerima pembayaran mengubah status pesanan menjadi "Barang sedang dikirim" secara otomatis.
- Interactions: daftar percakapan, thread chat, balasan admin, dan status penanganan.
- Moderasi review berdasarkan rating dan status tampil.
- Pengelolaan promo dan voucher beserta scheduler.
- Pengelolaan banner dan popup campaign.
- Pengaturan layanan dan tarif ongkir.
- Form dan dropdown custom yang responsif.

Interaksi seperti menyimpan form, mengunggah file, membalas chat, serta memoderasi review masih berupa simulasi di memori browser. Pesanan dan pembayaran adalah pengecualian: keduanya memakai penyimpanan bersama di `localStorage` (lihat status di atas).

## Menjalankan secara lokal

Membutuhkan Node.js 20 atau lebih baru.

```bash
npm install
npm run dev      # http://localhost:3000
```

Tanpa konfigurasi apa pun, `npm run dev` memakai login demo dan membuka `/admin` dengan banner. Untuk memakai Supabase Auth dan memahami mode lainnya, lihat [Autentikasi dan akses admin](#autentikasi-dan-akses-admin).

Perintah lain:

```bash
npm run build    # production build
npm run start    # jalankan hasil build
npm run lint     # type check (tsc --noEmit)
npm test         # tes logika (auth, akses admin, batas modul) lalu tes state storefront (vitest)
npm run test:ui  # hanya tes state storefront dan komponen (vitest + jsdom)
npm run test:sql # tes migrasi SQL di Postgres sungguhan (PGlite)
```

- Marketplace: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin`

## Struktur project

> Kode sedang dipecah per fitur (modul). `features/auth` sudah pindah; sisanya masih per lapisan di `components/` dan `lib/`. Rencana, aturan batas impor, dan status tiap modul ada di [ARCHITECTURE.md](ARCHITECTURE.md).

```text
app/
├── layout.tsx            # root layout + globals.css (Tailwind theme)
├── globals.css
├── (store)/              # storefront customer
│   ├── layout.tsx
│   ├── page.tsx
│   └── store.css
└── admin/                # dashboard admin
    ├── layout.tsx        # CSS dan pembungkus .admin (dipakai halaman login dan panel)
    ├── admin.css
    ├── login/            # /admin/login (di luar guard); tampilannya di features/auth/components/admin-login-view(.module.css)
    └── (panel)/          # semua halaman panel, dilindungi
        ├── layout.tsx    # pengecekan akses admin di server (lapisan kedua)
        └── page.tsx, products/, orders/, payments/, interactions/,
            reviews/, promos/, vouchers/, content/, shipping/
proxy.ts                  # guard /admin di setiap request + refresh sesi (pengganti middleware.ts di Next 16)
features/                 # modul per fitur; kode luar hanya boleh mengimpor index.ts atau server.ts sebuah modul
├── auth/                 # login, daftar, lupa kata sandi, guard admin, adapter Supabase/demo, tes
│   ├── index.ts          # API publik untuk kode klien (AuthProvider, useAuth, LoginDialog, ...)
│   ├── server.ts         # API publik untuk kode server (guard admin, authMode, safeAdminNext); tanpa React
│   ├── auth-provider.tsx
│   ├── components/       # LoginDialog, ForgotPasswordView, ResetPasswordView, AdminLoginView
│   └── lib/              # config.ts (pemilihan mode), adapter Supabase/demo, admin-guard.ts, safe-next.ts, tes
└── architecture.test.mts # tes yang menjaga aturan batas impor antar modul
supabase/
├── migrations/           # SQL: profiles, role, RLS, is_admin(), pencabutan EXECUTE rls_auto_enable(); katalog (kategori, produk, foto) dan bucket product-images
└── tests/                # tes migrasi di Postgres sungguhan (PGlite)
components/               # atomic design
├── atoms/                # Icon, Button, Chip, Switch, Toast, badge, dll.
├── molecules/            # ProductCard, CartRow, Field, Select, PaymentRow, dll.
├── organisms/
│   ├── store/            # Header, Hero, ProductSection, CartDrawer, CheckoutFlow, dll.
│   └── admin/            # Sidebar, Topbar, SalesChart, AdminModal, InteractionInbox, dll.
├── templates/            # StoreTemplate, AdminTemplate (kerangka halaman)
└── providers/            # StoreProvider, AdminProvider (state contoh)
content/
└── id.json               # seluruh teks UI (Bahasa Indonesia)
lib/
├── i18n.ts               # t("store.cart.title", { ... })
├── supabase/             # klien Supabase untuk Server Component
├── mock/                 # data contoh (pengganti database sementara)
├── orders-store.ts       # penyimpanan pesanan bersama (localStorage) untuk storefront dan admin
├── order-flow.ts         # status pesanan (pending, shipping, completed, cancelled) dan total
└── format.ts, admin-nav.ts
public/assets/            # sprite foto produk demo
prototype/                # prototype HTML statis asli (referensi visual)
```

### Konvensi komponen (atomic design)

| Lapisan | Isi | Aturan |
|---|---|---|
| atoms | elemen terkecil: tombol, ikon, badge, switch | Tidak mengimpor teks. Semua teks datang lewat props atau children. |
| molecules | gabungan atom dengan satu fungsi: kartu produk, baris keranjang, field form | Boleh memakai `t()` untuk teks bawaannya. Tidak membaca state global, aksi datang lewat props. |
| organisms | bagian halaman yang utuh: header, keranjang, tabel pembayaran | Boleh membaca context (`useStore`, `useAdmin`) dan memakai `t()`. |
| templates | kerangka halaman dan provider | Menyusun organisms, tanpa logika bisnis. |
| `app/` | route | Tipis: hanya menyusun organisms dan template. |

Catatan: `Button` dan `AdminButton` dipisah karena CSS lama storefront dan admin memakai nama class berbeda. Keduanya bisa digabung setelah CSS dikonversi ke Tailwind.

### Teks UI (`content/id.json`)

Teks tidak ditulis langsung di komponen. Semua label, placeholder, pesan toast, dan metadata halaman ada di [content/id.json](content/id.json) dan dipanggil lewat key:

```tsx
import { t } from "@/lib/i18n";

t("store.cart.title");                       // "Keranjang"
t("store.cart.subtotal", { count: 3 });      // "Subtotal · 3 barang"
```

- Key diperiksa saat compile: key yang salah akan membuat `tsc` gagal, dan editor memberi autocomplete.
- Placeholder memakai format `{nama}`.
- Yang **bukan** teks UI tidak masuk JSON: data produk, review, nomor rekening, dan kampanye. Itu data bisnis yang nanti berasal dari database, sekarang ada di `lib/mock/`. Nomor rekening tidak boleh disimpan di source code (PRD bagian 9).
- Untuk menambah bahasa (mis. Inggris), buat `content/en.json` dengan struktur yang sama lalu pilih berdasarkan locale. Saat itu pertimbangkan `next-intl`.

### Catatan styling

Tailwind CSS v4 sudah terpasang dan token warna tersedia lewat `@theme` di `app/globals.css`, tetapi Preflight sengaja tidak dimuat. Tampilan saat ini masih memakai CSS prototype yang di-scope ke `.store` dan `.admin` (`app/(store)/store.css`, `app/admin/admin.css`) agar hasilnya identik dengan prototype. Konversi ke utility class Tailwind dilakukan bertahap, komponen demi komponen. Halaman login admin sudah memakai CSS Module (`admin-login-view.module.css`); komponen baru sebaiknya memakai Tailwind atau CSS Module, bukan menambah CSS prototype.

### Autentikasi dan akses admin

Login memakai Supabase Auth (email dan kata sandi). Aplikasi memilih satu dari tiga **mode** saat build (`features/auth/lib/config.ts`):

| Mode | Kapan | Perilaku |
|---|---|---|
| **supabase** | `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` terisi, di environment mana pun | Akun nyata. `/admin` hanya untuk admin. |
| **demo** | Tanpa env Supabase **dan** (`next dev`, atau build di **Vercel Preview** dengan `NEXT_PUBLIC_DEMO_MODE=1`) | Login menerima email dan kata sandi apa saja, `/admin` terbuka, dan admin menampilkan banner "Mode demo". |
| **terkunci** | Tanpa env Supabase, dalam kondisi lain apa pun | Login tidak bisa dipakai dan `/admin` terkunci. Storefront tetap bisa dijelajahi. |

Aturannya **allowlist**: demo hanya menyala dalam dua kondisi di atas, dan semua yang tidak dikenal menjadi "terkunci". `NEXT_PUBLIC_DEMO_MODE=1` hanya berlaku jika build berjalan di Vercel Preview (`VERCEL_ENV=preview`, diteruskan ke build lewat `next.config.ts`). Di Vercel Production, di Cloudflare, atau saat `npm start` di laptop, flag itu diabaikan. **Jangan mengisi `NEXT_PUBLIC_DEMO_MODE` di Production.** Kode menolaknya, tetapi jangan mengandalkan itu saja.

Konsekuensinya: **tanpa env Supabase, situs live hanya bisa dijelajahi.** Tombol Akun menampilkan "Login belum siap dipakai", menambah ke keranjang, checkout, chat, dan Pesanan saya tidak bisa dilanjutkan, dan `/admin` mengarah ke halaman yang menjelaskan bahwa login belum dikonfigurasi.

Mencoba demo dalam bentuk production di laptop (karena `npm start` bukan `development`):

```bash
VERCEL_ENV=preview NEXT_PUBLIC_DEMO_MODE=1 npm run build && npm start
```

Dengan mode demo, masuk dengan `nadia@demo.test` (kata sandi apa saja, min. 8 karakter) agar pesanan contoh muncul di Pesanan saya.

#### Cara kerja perlindungan `/admin`

- **Role disimpan hanya di tabel `profiles`**, tidak di `user_metadata` (yang bisa diubah pengguna dari browser). Pendaftaran lewat form selalu menghasilkan `buyer`. Admin pertama dibuat manual lewat SQL.
- **`proxy.ts`** (di Next.js 16 menggantikan `middleware.ts`) berjalan di setiap request ke `/admin`. Ia memverifikasi sesi ke server Auth dengan `getUser()` (bukan `getSession()`, yang hanya membaca cookie) lalu menanyakan `is_admin()` ke database. Gagal, error, atau tidak jelas selalu berarti ditolak.
- **`app/admin/(panel)/layout.tsx`** memeriksa lagi saat halaman dirender di server, sebagai lapisan kedua jika proxy terlewat atau matcher salah.
- **`/admin/login`** adalah halaman login admin. Pembeli yang login tetapi bukan admin mendapat pesan "Akun ini bukan admin", bukan halaman kosong. Parameter `next=` hanya menerima path `^/admin(/[a-zA-Z0-9/_-]*)?$`, selain itu diabaikan.
- Layout tidak dirender ulang saat berpindah halaman di browser, jadi **perlindungan data sesungguhnya tetap harus datang dari RLS dan Route Handler** begitu data admin berpindah ke database.

#### Urutan rilis yang aman

1. Buat project Supabase untuk development (disarankan project terpisah untuk production).
2. **Authentication → Providers → Email**: pastikan aktif. Matikan "Confirm email" jika ingin daftar langsung masuk; jika dibiarkan aktif, pembeli diminta membuka email konfirmasi dulu.
3. **Authentication → URL Configuration**: isi **Site URL** dan tambahkan ke **Redirect URLs** alamat lokal (`http://localhost:3000`) serta domain situs. Langkah 2 dan 3 juga bisa dijalankan lewat Supabase CLI: `supabase login`, `supabase link --project-ref <ref>`, ubah nilainya di `supabase/config.toml`, lalu `supabase config diff` untuk pratinjau dan `supabase config push` untuk menerapkan. `config.toml` sengaja hanya mendeklarasikan tiga setelan Auth (`site_url`, `additional_redirect_urls`, `email.enable_confirmations`); `config push` membiarkan setelan yang tidak dideklarasikan. Nilai di berkas itu untuk project **dev**: untuk production pakai domain produksi dan aktifkan `enable_confirmations`.
4. Salin **Project URL** dan **anon/publishable key** dari **Project Settings → API**. Lokal: salin `.env.example` menjadi `.env.local` dan isi. Vercel: **Settings → Environment Variables**, isi dua variabel itu untuk **Production dan Preview**. Jangan mengisi `NEXT_PUBLIC_DEMO_MODE` di Production.
5. **Jalankan migrasi**: buka **SQL Editor**, tempel isi semua berkas di `supabase/migrations/` berurutan (`20261012061023_profiles_and_roles.sql`, `20261012065146_revoke_rls_auto_enable_execute.sql`, `20261013030000_catalog_products.sql`, `20261013030100_product_images_bucket.sql`, lalu `20261013080000_product_reviews.sql`), lalu Run. Migrasi katalog memakai `is_admin()` dan `set_updated_at()` dari migrasi `profiles`, jadi urutannya penting. Aman dijalankan berulang. (Atau `supabase db push` jika memakai Supabase CLI.)
6. **Buat user admin**: **Authentication → Users → Add user** (centang *Auto Confirm User*), atau daftar lewat storefront.
7. **Jadikan user itu admin** di SQL Editor (ganti emailnya):

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'admin@example.com');
   ```

8. **Baru deploy** (atau redeploy) agar env terbaca. Lanjutkan dengan checklist uji di bawah. Jangan men-deploy sebelum langkah 4 sampai 7 selesai: tanpa env, situs live hanya bisa dijelajahi.

   Status 12 Oktober 2026: deploy awal sudah berjalan di Vercel (`market-by-kith`) dengan env project dev. `/admin` anonim diarahkan ke `/admin/login`. Karena **SSO Protection Vercel** aktif, domain `*.vercel.app` meminta login Vercel; matikan atau pakai custom domain sebelum dibuka ke publik. Tambahkan domain Vercel ke langkah 3 (Site URL dan Redirect URLs) agar login dan tautan email berfungsi.

Jangan pernah memakai service role key di kode browser atau variabel `NEXT_PUBLIC_*`. Saat ini aplikasi tidak membutuhkannya.

#### Pengujian

Otomatis (tanpa Supabase sungguhan):

```bash
npm test          # logika keamanan, batas modul (82 tes, node:test) lalu tes state storefront (44 tes, vitest)
npm run test:sql  # menjalankan migrasi di Postgres sungguhan (PGlite): hak akses, RLS, trigger, constraint (44 pengecekan profiles + 64 katalog + 38 ulasan)
```

`test:sql` meniru Supabase dengan schema `auth` buatan sendiri. Ia membuktikan SQL dan hak aksesnya benar, **bukan** bahwa project Supabase-mu terkonfigurasi benar. Lakukan checklist di bawah pada project sungguhan.

Pada 12 Oktober 2026 hak akses database dan guard `/admin` sudah diuji otomatis terhadap project Supabase dev: 19 pengecekan SQL (peran disimulasikan dengan `SET ROLE`, di dalam transaksi yang dibatalkan) dan 32 pengecekan HTTP dengan login sungguhan (butir 7 sampai 11 di bawah terbukti di tingkat HTTP, yaitu status dan arah redirect, ditambah `PATCH`, `INSERT`, dan `DELETE` ke PostgREST oleh pembeli; Supabase menolak kata sandi salah (butir 4) tetapi teks pesan di UI belum dilihat). Uji manual di browser pada hari yang sama: login admin dan Keluar berhasil, login pembeli berhasil, dan pembeli yang belum dikonfirmasi ditolak. Yang **belum** pernah dijalankan: butir 1 sampai 3, 5, 6, dan 12 (daftar lewat form yang berhasil, konfirmasi email lewat link), pembeli ditolak di `/admin` lewat browser (butir 8), serta tampilan banner demo.

> **Tips uji:** sesi login disimpan di cookie, jadi satu browser hanya bisa satu akun sekaligus (login di tab lain menggantikan sesi, Keluar menutup semuanya). Pakai jendela Incognito atau browser lain untuk akun kedua. Selama "Confirm email" aktif, layanan email bawaan Supabase hanya mengizinkan beberapa pendaftaran per jam (galat `over_email_send_rate_limit`); matikan "Confirm email" di dev atau buat user lewat dashboard dengan *Auto Confirm User*. Checklist uji manual pada project Supabase sungguhan:

*Akun pembeli*
1. Buka dialog login. Peringatan "Mode demo" harus hilang.
2. Daftar dengan akun baru. Jika "Confirm email" aktif, muncul pesan untuk membuka email konfirmasi, lalu masuk setelah mengonfirmasi. Jika mati, langsung masuk.
3. **Authentication → Users**: pengguna baru muncul dan `full_name` tersimpan di user metadata.
4. Masuk dengan kata sandi salah: muncul "Email atau kata sandi salah."
5. Tambah produk ke keranjang, keluar, masuk lagi dengan akun yang sama: keranjang kembali.
6. Tanpa login, "Tambah ke keranjang", chat, checkout, dan Pesanan saya meminta login.

*Admin dan role*
7. Tanpa login, buka `/admin`: diarahkan ke `/admin/login?next=%2Fadmin`.
8. Masuk di `/admin/login` dengan akun **pembeli**: muncul "Akun ini bukan admin", `/admin` dan `/admin/orders` tetap tertutup.
9. Masuk dengan akun **admin**: panel terbuka tanpa banner demo, dan sidebar punya tombol Keluar.
10. Sebagai admin, buka `/admin/login`: langsung masuk ke panel. Klik Keluar: `/admin` tertutup lagi.
11. Buka `/admin/login?next=https://example.com`, masuk sebagai admin: mendarat di `/admin`, bukan di situs lain.
12. Daftar akun baru lewat form, lalu `select role from public.profiles order by created_at desc limit 1;`: harus `buyer`.
13. **Lupa kata sandi**: di dialog login toko klik "Lupa kata sandi?" (halaman `/admin/login` sengaja tidak punya tautan ini), isi email akun uji, lalu buka email yang masuk **di browser yang sama**. Tautan membuka `/reset-password`; isi kata sandi baru dua kali, lalu masuk ulang dengan kata sandi baru. Tautan yang sudah dipakai atau kedaluwarsa menampilkan "Tautan tidak berlaku" dengan tombol minta tautan baru. Layanan email bawaan Supabase membatasi jumlah email per jam, jadi jangan menguji berulang-ulang.
14. **Produk (admin)**: masuk sebagai admin, buka `/admin/products`. Awalnya kosong. Klik **Kelola kategori** dan buat kategori dulu, lalu dari form **Tambah produk** isi nama, harga (boleh `89.000`), stok, berat dalam gram, dan tambahkan 2 foto berukuran besar (minimal 800 px). Setelah disimpan, produk muncul dengan sampul foto pertama. Di **Storage → product-images** harus ada 6 file (3 ukuran per foto: `-400`, `-800`, `-1600`), dan di tabel `products` serta `product_images` ada barisnya.
15. **Ubah dan urutkan foto**: buka produk itu lagi lewat **Ubah**, geser foto kedua ke depan, hapus satu foto, lalu simpan. Sampul berganti, dan file foto yang dihapus hilang dari Storage (3 file per foto).
16. **Aktif dan draf**: klik **Nonaktifkan** pada produk. Statusnya menjadi Draf dan ia tidak terbaca pengunjung anonim (`select` ke `products` tanpa login tidak mengembalikannya). Klik **Aktifkan** untuk mengembalikan.
17. **Pembeli tidak bisa**: masuk sebagai pembeli di jendela Incognito lalu buka `/admin/products`; harus ditolak dengan "Akun ini bukan admin".
18. **Kelola kategori**: di `/admin/products` klik **Kelola kategori**. Tambah kategori, ubah namanya (kartu produk ikut berganti nama), nonaktifkan lalu cek bahwa ia hilang dari pilihan di **Tambah produk**, dan coba hapus kategori yang masih dipakai produk (tombol Hapus harus mati). Kategori tanpa produk bisa dihapus setelah konfirmasi.
19. **Toko membaca database**: buka halaman toko (`/`) di Incognito (tanpa login). Produk berstatus Aktif tampil dengan foto aslinya, dan chip kategori hanya berisi kategori yang punya produk. Nonaktifkan produknya di admin lalu muat ulang toko: produk hilang. Nonaktifkan kategorinya: kategori dan produknya hilang dari toko. Di Network tab, foto yang dimuat harus berukuran 400 atau 800 px (`-400.webp`/`-800.webp`), bukan 1600 px, di layar biasa.
20. **Halaman produk dan SEO**: di HP (lebar 500 px atau kurang) mengetuk produk langsung membuka halamannya; di desktop mengklik produk membuka panel samping, lalu klik **Buka halaman produk** (atau buka `/produk/<slug>` langsung). Coba juga mengecilkan jendela desktop sampai selebar HP lalu klik produk: harus pindah ke halamannya tanpa refresh. Halaman menampilkan foto, harga, dan tombol keranjang; ganti foto lewat thumbnail. Lihat sumber halaman (View Source): ada `<title>` berisi nama produk, `og:image`, dan blok `application/ld+json`. Buka `/produk/tidak-ada`: harus 404. Nonaktifkan produknya di admin lalu muat ulang halamannya: 404. Buka `/sitemap.xml` dan `/robots.txt`: alamat di sitemap harus alamat situs yang benar, bukan `localhost`; kalau `localhost`, isi `NEXT_PUBLIC_SITE_URL` di Vercel.
21. **Ulasan (data uji dev)**: isi dulu data uji dengan `supabase db query --linked -f supabase/dev-data/reviews.sql` (hanya untuk project dev). Buka halaman produknya (`/produk/<slug>`): skor 3,8 dari 5 ulasan, lima batang bintang, ulasan terbaru di atas dengan waktu relatif, dan penanda "Pembelian terverifikasi" hanya pada sebagian. Ulasan "Tes Tersembunyi" tidak boleh tampil. Di panel detail (desktop) ulasannya sama. Produk tanpa ulasan menampilkan "Belum ada ulasan", bukan ulasan contoh. Hapus data uji dengan `supabase/dev-data/reviews-remove.sql`.

*Hak akses database (SQL Editor, mensimulasikan pembeli; ganti `<uuid-buyer>`)*

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<uuid-buyer>","role":"authenticated"}', true);
select public.is_admin();                                                   -- false
update public.profiles set full_name = 'Uji' where id = '<uuid-buyer>';     -- berhasil
update public.profiles set role = 'admin' where id = '<uuid-buyer>';        -- harus ERROR: permission denied for table profiles
rollback;
```

### State contoh

Wishlist, checkout, chat, interactions, dan review disimpan di React context (`StoreProvider` dan `AdminProvider` di `components/providers/`). Pesanan dan pembayaran disimpan di `lib/orders-store.ts` (`localStorage`) agar storefront dan admin membaca data yang sama. Keranjang disimpan di `localStorage` per akun (kunci `marketplace-cart-v2:<id pengguna>`), sehingga bertahan setelah reload dan kembali saat akun yang sama login lagi. Guest tidak punya keranjang. Saat backend tersedia, ganti context ini dengan data dari Supabase melalui Server Component, Route Handler, atau Server Action.

## Target implementasi

- **Frontend dan server logic:** Next.js App Router.
- **Styling:** Tailwind CSS.
- **Database dan Auth:** Supabase Postgres, Auth, dan RLS.
- **File storage:** Cloudflare R2.
- **Hosting:** Cloudflare Workers melalui `@opennextjs/cloudflare`.
- **Repository dan CI:** GitHub.

Prototype ini menjadi referensi visual ketika UI dipindahkan ke komponen Next.js. Data contoh dan fungsi mutasi di dalam HTML tidak digunakan sebagai arsitektur production.

## Rencana route Next.js

```text
app/
├── page.tsx
├── products/[slug]/page.tsx
├── cart/page.tsx
├── checkout/page.tsx
├── orders/page.tsx
├── orders/[orderNumber]/page.tsx
├── account/page.tsx
└── admin/
    ├── page.tsx
    ├── products/page.tsx
    ├── preorder-batches/page.tsx
    ├── orders/page.tsx
    ├── payments/page.tsx
    ├── interactions/page.tsx
    ├── reviews/page.tsx
    ├── promos/page.tsx
    ├── vouchers/page.tsx
    ├── content/page.tsx
    └── shipping/page.tsx
```

## Rencana API/server actions

Daftar berikut adalah kontrak awal dan dapat diimplementasikan sebagai Route Handler atau Server Action sesuai kebutuhan:

```text
GET/POST/PUT/DELETE /api/products
GET/POST/PUT/DELETE /api/product-variants
GET/POST/PUT/DELETE /api/categories
GET/POST/PUT/DELETE /api/preorder-batches

GET/POST              /api/orders
GET                   /api/orders/{id}
POST                  /api/orders/{id}/cancel
GET/PUT               /api/orders/{id}/fulfillments
POST                  /api/orders/{id}/payment-proofs
GET/PUT               /api/payments

GET/POST/PUT/DELETE   /api/shipping-zones
GET/POST/PUT/DELETE   /api/shipping-methods
GET/POST/PUT/DELETE   /api/promos
GET/POST/PUT/DELETE   /api/vouchers
GET/POST/PUT/DELETE   /api/banners
GET/POST/PUT/DELETE   /api/popups

GET/POST              /api/interactions
GET/POST              /api/interactions/{id}/messages
GET/POST/PUT          /api/reviews
GET                   /api/statistics?period=monthly|yearly
```

Nama endpoint masih dapat berubah. Aturan bisnis penting seperti pembuatan order, reservasi stok, penggunaan voucher, dan perubahan status wajib dijalankan serta divalidasi di server.

## Roadmap implementasi

Urutan pengerjaan dan status tiap item MVP dicatat di [PROGRESS.md](PROGRESS.md).

## Ketentuan keamanan minimum

- Login wajib untuk keranjang, checkout, chat, dan Pesanan saya. Pengecekan di UI saat ini hanya kenyamanan; validasi sesungguhnya harus dilakukan di server (RLS dan Route Handler) saat backend tersambung.
- Lindungi seluruh route `/admin` dengan autentikasi dan pengecekan role di server.
- Aktifkan RLS agar buyer hanya dapat mengakses data miliknya.
- Simpan Supabase service role key dan credential R2 hanya di server.
- Jangan menyimpan bukti transfer sebagai URL publik permanen; gunakan signed URL berumur pendek.
- Validasi MIME type, ukuran file, quantity, stok, kuota PO, promo, voucher, dan total order di server.
- Gunakan transaksi atau fungsi Postgres atomik untuk reservasi stok dan pembuatan order.
- Jangan merender input chat atau review menggunakan `dangerouslySetInnerHTML`.

## Dokumen produk

Aturan bisnis, scope MVP, state machine, data model awal, dan acceptance criteria tersedia di [PRD.md](PRD.md). Status pengerjaan ada di [PROGRESS.md](PROGRESS.md).
