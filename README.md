# Marketplace Pink & Ivory

Prototype UI/UX toko online **single seller** untuk produk ready stock, jastip, dan pre-order barang impor. Repository ini memuat halaman customer serta dashboard admin dengan tampilan responsif untuk mobile dan desktop.

> Status saat ini: UI sudah dimigrasikan ke **Next.js App Router** (roadmap langkah 1), tetapi masih memakai data contoh di memori browser yang kembali ke kondisi awal saat halaman dimuat ulang. Belum ada backend, autentikasi, database, object storage, maupun proses pembayaran sungguhan. Prototype HTML statis yang asli disimpan di folder `prototype/` sebagai referensi visual.

## Fitur prototype

### Customer

- Homepage, hero banner, kategori, Hot Promo, pencarian, dan sorting produk.
- Detail produk, informasi stok terbatas, rating, dan daftar review.
- Wishlist dan keranjang belanja lokal.
- Checkout tiga tahap: alamat, pengiriman, dan transfer manual.
- Upload bukti pembayaran maksimal 5 MB sebagai simulasi UI.
- Widget chat untuk menghubungi admin.
- Navigasi responsif untuk mobile dan desktop.

### Admin

- Dashboard dan statistik penjualan bulanan/tahunan.
- Pengelolaan etalase produk.
- Verifikasi dan perubahan status pembayaran.
- Interactions: daftar percakapan, thread chat, balasan admin, dan status penanganan.
- Moderasi review berdasarkan rating dan status tampil.
- Pengelolaan promo dan voucher beserta scheduler.
- Pengelolaan banner dan popup campaign.
- Pengaturan layanan dan tarif ongkir.
- Form dan dropdown custom yang responsif.

Interaksi seperti menyimpan form, mengunggah file, mengubah pembayaran, membalas chat, serta memoderasi review masih berupa simulasi di memori browser.

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
    └── page.tsx, products/, payments/, interactions/, reviews/,
        promos/, vouchers/, content/, shipping/
components/
├── store/                # header, hero, produk, cart, checkout, chat, dll.
└── admin/                # shell, modal, select, switch, provider
lib/                      # data contoh dan helper format
public/assets/            # sprite foto produk demo
prototype/                # prototype HTML statis asli (referensi visual)
```

### Catatan styling

Tailwind CSS v4 sudah terpasang dan token warna tersedia lewat `@theme` di `app/globals.css`, tetapi Preflight sengaja tidak dimuat. Tampilan saat ini masih memakai CSS prototype yang di-scope ke `.store` dan `.admin` (`app/(store)/store.css`, `app/admin/admin.css`) agar hasilnya identik dengan prototype. Konversi ke utility class Tailwind dilakukan bertahap, komponen demi komponen.

### State contoh

Keranjang, wishlist, checkout, chat, pembayaran, interactions, dan review disimpan di React context (`StoreProvider` dan `AdminProvider`). Saat backend tersedia, ganti context ini dengan data dari Supabase melalui Server Component, Route Handler, atau Server Action.

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

1. ~~Migrasikan design system dan UI ke Next.js serta Tailwind.~~ UI sudah dimigrasikan ke Next.js. Konversi CSS prototype ke utility Tailwind masih bertahap.
2. Implementasikan Supabase Auth, profile, role buyer/admin, dan proteksi route.
3. Implementasikan kategori, produk, varian, foto produk, dan batch PO.
4. Implementasikan cart, reservasi stok/kuota, order expiry, checkout, dan fulfillment group.
5. Implementasikan pembayaran manual, riwayat bukti transfer, serta penyimpanan privat di R2.
6. Implementasikan order management, interaction, review, promo, voucher, banner, popup, dan scheduler.
7. Terapkan RLS, audit log, rate limiting, observability, serta automated testing.
8. Deploy production melalui Cloudflare Workers.

## Ketentuan keamanan minimum

- Lindungi seluruh route `/admin` dengan autentikasi dan pengecekan role di server.
- Aktifkan RLS agar buyer hanya dapat mengakses data miliknya.
- Simpan Supabase service role key dan credential R2 hanya di server.
- Jangan menyimpan bukti transfer sebagai URL publik permanen; gunakan signed URL berumur pendek.
- Validasi MIME type, ukuran file, quantity, stok, kuota PO, promo, voucher, dan total order di server.
- Gunakan transaksi atau fungsi Postgres atomik untuk reservasi stok dan pembuatan order.
- Jangan merender input chat atau review menggunakan `dangerouslySetInnerHTML`.

## Dokumen produk

Aturan bisnis, scope MVP, state machine, data model awal, dan acceptance criteria tersedia di [PRD.md](PRD.md).
