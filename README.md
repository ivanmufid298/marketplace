# Marketplace Pink & Ivory

Prototype UI/UX toko online **single seller** untuk produk ready stock, jastip, dan pre-order barang impor. Repository ini memuat halaman customer serta dashboard admin dengan tampilan responsif untuk mobile dan desktop.

> Status saat ini: UI sudah dimigrasikan ke **Next.js App Router** (roadmap langkah 1), tetapi masih memakai data contoh di memori browser yang kembali ke kondisi awal saat halaman dimuat ulang. Belum ada backend, autentikasi, database, object storage, maupun proses pembayaran sungguhan. Pengecualian: pesanan disimpan di `localStorage` browser dan dibaca bersama oleh storefront dan admin, jadi alur pembayaran diterima → barang dikirim → pesanan selesai bisa dicoba dari awal sampai akhir. Tombol "Reset data contoh" di sidebar admin mengembalikan data awal. Prototype HTML statis yang asli disimpan di folder `prototype/` sebagai referensi visual.

## Fitur prototype

### Customer

- Homepage, hero banner, kategori, Hot Promo, pencarian, dan sorting produk.
- Detail produk, informasi stok terbatas, rating, dan daftar review.
- Wishlist dan keranjang belanja lokal.
- Checkout tiga tahap: alamat, pengiriman, dan transfer manual. Checkout membuat pesanan baru dengan status Pending.
- Upload bukti pembayaran maksimal 5 MB sebagai simulasi UI.
- Menu **Pesanan saya** (ikon paket di header, tab Pesanan di navigasi bawah mobile): status pesanan, tombol "Pesanan selesai" saat barang sedang dikirim, dan form ulasan (rating dan teks) untuk pesanan yang selesai.
- Widget chat untuk menghubungi admin.
- Navigasi responsif untuk mobile dan desktop.

### Admin

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

Perintah lain:

```bash
npm run build    # production build
npm run start    # jalankan hasil build
npm run lint     # type check (tsc --noEmit)
```

- Marketplace: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin`

## Struktur project

```text
app/
├── layout.tsx            # root layout + globals.css (Tailwind theme)
├── globals.css
├── (store)/              # storefront customer
│   ├── layout.tsx
│   ├── page.tsx
│   └── store.css
└── admin/                # dashboard admin (satu route per menu)
    ├── layout.tsx
    ├── admin.css
    └── page.tsx, products/, orders/, payments/, interactions/,
        reviews/, promos/, vouchers/, content/, shipping/
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

Tailwind CSS v4 sudah terpasang dan token warna tersedia lewat `@theme` di `app/globals.css`, tetapi Preflight sengaja tidak dimuat. Tampilan saat ini masih memakai CSS prototype yang di-scope ke `.store` dan `.admin` (`app/(store)/store.css`, `app/admin/admin.css`) agar hasilnya identik dengan prototype. Konversi ke utility class Tailwind dilakukan bertahap, komponen demi komponen.

### State contoh

Keranjang, wishlist, checkout, chat, interactions, dan review disimpan di React context (`StoreProvider` dan `AdminProvider` di `components/providers/`). Pesanan dan pembayaran disimpan di `lib/orders-store.ts` (`localStorage`) agar storefront dan admin membaca data yang sama. Saat backend tersedia, ganti context ini dengan data dari Supabase melalui Server Component, Route Handler, atau Server Action.

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

- Lindungi seluruh route `/admin` dengan autentikasi dan pengecekan role di server.
- Aktifkan RLS agar buyer hanya dapat mengakses data miliknya.
- Simpan Supabase service role key dan credential R2 hanya di server.
- Jangan menyimpan bukti transfer sebagai URL publik permanen; gunakan signed URL berumur pendek.
- Validasi MIME type, ukuran file, quantity, stok, kuota PO, promo, voucher, dan total order di server.
- Gunakan transaksi atau fungsi Postgres atomik untuk reservasi stok dan pembuatan order.
- Jangan merender input chat atau review menggunakan `dangerouslySetInnerHTML`.

## Dokumen produk

Aturan bisnis, scope MVP, state machine, data model awal, dan acceptance criteria tersedia di [PRD.md](PRD.md). Status pengerjaan ada di [PROGRESS.md](PROGRESS.md).
