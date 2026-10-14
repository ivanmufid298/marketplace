# Arsitektur modul

Dokumen ini menjelaskan bagaimana kode dipecah per fitur (modul), aturan yang menjaganya, dan cara menambah modul baru. Langkah migrasi dari struktur lama ada di [PROGRESS.md](PROGRESS.md) bagian "Sedang dan berikutnya". Status modul mana yang sudah pindah dicatat di tabel "Status migrasi" di bawah.

## Kenapa per modul

Kode lama disusun per lapisan (`components/atoms`, `molecules`, `organisms`, `providers`). Itu cukup untuk prototype, tetapi fitur sudah banyak dan database akan datang per fitur. Dua masalah yang terlihat:

- `components/providers/store-provider.tsx` dulu (430 baris, sekitar 20 state) memegang katalog, keranjang, checkout, chat, ulasan, panel, dan toast sekaligus dan dipakai 16 berkas lewat `useStore()`. **Sudah dihapus (14 Okt 2026)**: tiap bagiannya kini modul sendiri, dan komponen membaca hook modulnya langsung.
- Satu fitur tersebar di banyak folder (komponen di `organisms`, data di `lib/mock`, teks di `content/id.json`), jadi sulit tahu apa yang ikut berubah.

Tujuannya: **satu fitur, satu folder**, yang memegang komponen, state, data contoh, dan nanti kueri serta migrasi database-nya sendiri. Ini hanya folder dengan aturan batas impor. Bukan monorepo, bukan package terpisah.

## Peta modul

```
features/
  auth/        login, daftar, lupa kata sandi, guard admin, adapter Supabase dan demo
  catalog/     produk, kategori, cari, urut, wishlist, promo
  cart/        keranjang (reservasi stok/kuota menyusul)
  checkout/    alamat, pengiriman, bukti transfer, pembuatan pesanan
  orders/      "Pesanan saya", status pesanan, order-flow
  reviews/     ulasan pembeli dan moderasi
  chat/        chat pembeli dan inbox admin (interactions)
  admin/       shell admin (sidebar, topbar, modal) dan panel per modul
shared/
  ui/          atoms dan molecules (atomic design hanya berlaku di sini)
  ui-state/    UiProvider: panel yang terbuka, toast, kunci scroll, tombol Escape
  lib/         format, i18n, chart
app/           route tipis: hanya merakit modul, tanpa logika
```

Alias path `@/*` sudah menunjuk ke root (`tsconfig.json`), jadi impor berbentuk `@/features/cart` dan `@/shared/ui/button`.

## Isi sebuah modul

```
features/<nama>/
  index.ts          API publik untuk kode klien: satu-satunya pintu masuk dari luar
  server.ts         API publik untuk kode server (proxy.ts, layout). Opsional; hanya jika modul punya logika server
  components/       komponen khusus modul
  <nama>-provider.tsx   state modul (jika perlu)
  lib/              logika murni (bisa dites tanpa browser)
  mock/             data contoh
  README.md         apa yang dimiliki, API publik, tabel database (ditulis saat modul sudah ada)
```

## Aturan

1. **Impor lewat pintu publik.** Kode di luar modul hanya boleh mengimpor `@/features/<nama>` atau `@/features/<nama>/server`, tidak boleh `@/features/<nama>/components/...`.
   - `server.ts` ada karena `index.ts` mengekspor komponen React dan hook. Kode seperti `proxy.ts` tidak boleh ikut membawa itu.
2. **Arah dependensi satu arah:** `auth` dan `catalog` paling bawah; lalu `cart`; lalu `checkout`; lalu `orders`. `reviews` dan `chat` bergantung pada `auth`. `admin` boleh membaca modul lain lewat API publiknya. Modul bawah tidak boleh mengimpor modul di atasnya.
3. **`shared` tidak mengimpor `features`.**
4. **State lintas modul** (panel yang terbuka, toast) ada di satu provider kecil di `shared`, bukan di salah satu modul.
5. **Kebutuhan database** ditulis sebagai migrasi di `supabase/migrations/` dan disebut di README modul pemiliknya. Satu tabel punya satu modul pemilik.
6. Aturan 1 sampai 3, ditambah larangan `server.ts` menjangkau React atau berkas `"use client"`, dijaga oleh `features/architecture.test.mts` (jalan di `npm test`). Tes itu membaca pernyataan impor dan punya contoh pelanggaran sendiri supaya terbukti bisa menangkapnya. Proyek ini belum memakai ESLint. Setiap modul baru ditambahkan ke tabel `ALLOWED` di tes itu.

## Cara memindahkan atau menambah modul

1. Buat folder dan `index.ts` yang hanya mengekspor yang dipakai luar.
2. Pindahkan berkas dengan `git mv` agar riwayat tetap terbaca. Perbarui impor.
3. Jalankan `npm test`, `npx tsc --noEmit`, dan `npm run build`.
4. Bandingkan HTML hasil render halaman terkait sebelum dan sesudah. Hasilnya harus identik, karena ini refactor tanpa perubahan perilaku. HTML hanya membuktikan render awal; perilaku state (keranjang, checkout, chat, ulasan) dibuktikan oleh tes `npm run test:ui` yang memakai hook publik tiap modul (dan `components/providers/storefront-test-support.tsx` untuk tes yang melihat semuanya bersama), sehingga tetap berlaku saat state berpindah antar modul.
5. Satu modul per commit. Catat di tabel di bawah dan di PROGRESS.md.

Fitur baru dibuat langsung sebagai modul. Skema produk, misalnya, menjadi `features/catalog` lengkap dengan migrasinya.

## Status migrasi

| Modul | Status | Catatan |
| --- | --- | --- |
| `auth` | **selesai** (12 Okt 2026) | Pilot. Dependensi ke modul lain: tidak ada. Dialog login tidak lagi memakai `useStore()`; ia menerima `onSignedIn`, dan `StoreLoginDialog` di storefront yang menyambungkannya ke toast. HTML render enam halaman identik sebelum dan sesudah. |
| `catalog` | **selesai** sisi klien (12 Okt 2026) | `CatalogProvider` dan `useCatalog()`: `products`, `getProduct`, filter, cari, urut, wishlist, produk terpilih, `showSaved`, `showAll`, `scrollToProducts`. Satu-satunya pembaca daftar produk mock; cart dan checkout memakai `getProduct`. Sumber data: database bila ada kredensial Supabase, produk contoh bila tidak; hanya modul ini yang tahu bedanya. Skema database katalog sudah ditulis, dites, dan diterapkan ke project dev (13 Okt 2026); Lapisan data dan layar admin produk (CRUD produk, foto, dan kelola kategori) sudah ada (13 Okt 2026); storefront membaca dari database sudah ada (13 Okt 2026): `CatalogProvider` memuat lewat `storefront-repository` bila ada kredensial Supabase, kalau tidak memakai produk contoh. Halaman produk `/produk/[slug]`, sitemap, dan metadata SEO membaca lewat `features/catalog/server.ts` (tanpa React). Aturan itu dijaga `architecture.test.mts` (kecuali satu berkas admin lama). |
| `reviews` | **selesai** (baca dan tulis, 14 Okt 2026) | `features/reviews`: ulasan terbit satu produk dari database, ringkasan skor dan batang bintang, waktu relatif, dan komponen untuk halaman produk serta panel detail; `server.ts` untuk halaman produk (termasuk `aggregateRating`). Sisi tulis: `useMyReviews()` (pembeli menulis dan mengubah ulasan barang pesanan yang sudah selesai lewat `submit_review`) dan `useAdminReviews()` (daftar dan sembunyikan/tampilkan). Bergantung pada tidak ada modul lain; `useOrderActions` (di `components/organisms/store`) dan `AdminProvider` yang memakainya. |
| `chat` | **selesai** (14 Okt 2026) | `features/chat`: `ChatProvider` dan `useChat()` (`messages`, `send`): pesan sambutan, tamu diminta masuk dulu, balasan otomatis dengan nomor tiket yang tetap, dan panel chat terbuka lagi setelah masuk untuk chat. Bergantung pada `auth` dan `shared/ui-state`. Dipasang di `StoreTemplate` di dalam `OrdersProvider`. Tesnya dipindah dari `store-provider.test.tsx` ke `features/chat/chat-provider.test.tsx` dengan assertion yang sama. |
| `cart` | **selesai** (14 Okt 2026) | `features/cart`: `CartProvider` dan `useCart()` (`cart`, `cartCount`, `subtotal`, `loaded`, `addToCart`, `changeQty`, `removeFromCart`, `clearCart`). Keranjang per akun di `localStorage` (`marketplace-cart-v2:<id>`), dicocokkan dengan katalog setelah katalog selesai dimuat, tamu diminta masuk dulu dan produk pilihannya ditambahkan sesudah masuk (menunggu keranjang tersimpan akun itu terbaca). Bergantung pada `auth` dan `catalog`. Komponen membaca `useCart()` langsung. |
| `checkout` | **selesai** (14 Okt 2026) | `features/checkout`: `CheckoutProvider` dan `useCheckout()` (langkah, alamat, pengiriman dan ongkir, bukti transfer, `placeOrder`, `finishOrder`, draf checkout per akun, pengingat `pendingCheckout` dan `resumeCheckout`). Bergantung pada `auth`, `catalog`, `cart`, dan `orders`. Di `orders` ditambah `useOrderErrorText()` (kata-kata untuk galat pesanan) yang dipakai checkout dan `useOrderActions`. Dipasang di `StoreTemplate` di dalam `CartProvider`. |
| `StoreProvider` | **dihapus** (14 Okt 2026) | Sisanya dibagi: `NotificationsProvider`/`useBuyerNotifications()` di `features/notifications` (dibaca lonceng dan panel); `useOrderActions()` di `components/organisms/store` (konfirmasi terima, kirim bukti belakangan, ulasan saya; dipakai Pesanan saya); navigasi bawah ada di `MobileNav`; penutupan dialog masuk dan "masuk untuk Pesanan saya" ada di `StoreLoginDialog`. |
| `notifications` | **selesai** sisi pembeli (14 Okt 2026) | `features/notifications`: `useNotifications(userId)` membaca notifikasi pembeli dari database (otomatis tiap menit selama tab di depan, dan saat tab kembali), menandai dibaca, dan menjelaskan tiap jenis dalam kata-kata (`describeNotification`). Bergantung pada `auth`; `NotificationsProvider` dipasang di `StoreTemplate` dan UI-nya (lonceng dan panel) ada di `components/organisms/store`. Notifikasi dibuat hanya oleh fungsi pesanan di database. Sisi admin selesai (14 Okt 2026): notifikasi `payment_submitted` dibuat trigger di tabel pesanan; `AdminNotificationBell` (di `components/organisms/admin`) membacanya lewat `useMyNotifications()`, dan template admin memasang `NotificationsProvider`. |
| `orders` | **selesai** (pembeli dan admin, 13 Okt 2026) | `features/orders`: `OrdersProvider`/`useBuyerOrders()` untuk pesanan pembeli, tarif ongkir, membuat pesanan (`place_order`), dan mengirim bukti (`submit_payment_proof`); database bila ada kredensial Supabase, penyimpanan lokal (`lib/orders-store.ts`) bila tidak. Bergantung pada `auth` dan `catalog`. Sisi admin juga selesai (13 Okt 2026): `useAdminOrders()` untuk daftar pesanan, terima/tolak bukti (dengan alasan), batal, refund, dan tautan bukti bertanda tangan; `AdminProvider` memakainya. `lib/order-flow.ts` masih di luar modul. |
| `admin` | belum | Dipindah saat disentuh, tidak sekaligus. |
| `shared/ui-state` | **selesai** (12 Okt 2026) | `UiProvider` dan `useUi()`: panel, toast, kunci scroll, Escape. Dipakai langsung oleh modul dan komponen (`StoreToast`, `StoreLoginDialog`, `AccountMenu`, dan seterusnya). Dipasang di `StoreTemplate` tepat di bawah `AuthProvider`. |
| `shared/ui`, `shared/lib` | belum | `ui` (atoms, molecules), `lib` (format, i18n, chart). |

Teks `content/id.json` bisa dipecah per modul belakangan tanpa mengubah key-nya (`t("store.cart.title")` tetap sama).
