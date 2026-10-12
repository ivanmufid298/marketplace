# Arsitektur modul

Dokumen ini menjelaskan bagaimana kode dipecah per fitur (modul), aturan yang menjaganya, dan cara menambah modul baru. Langkah migrasi dari struktur lama ada di [PROGRESS.md](PROGRESS.md) bagian "Sedang dan berikutnya". Status modul mana yang sudah pindah dicatat di tabel "Status migrasi" di bawah.

## Kenapa per modul

Kode lama disusun per lapisan (`components/atoms`, `molecules`, `organisms`, `providers`). Itu cukup untuk prototype, tetapi fitur sudah banyak dan database akan datang per fitur. Dua masalah yang terlihat:

- `components/providers/store-provider.tsx` (430 baris, sekitar 20 state) memegang katalog, keranjang, checkout, chat, ulasan, panel, dan toast sekaligus, dan dipakai 16 berkas lewat `useStore()`.
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
4. Bandingkan HTML hasil render halaman terkait sebelum dan sesudah. Hasilnya harus identik, karena ini refactor tanpa perubahan perilaku. HTML hanya membuktikan render awal; perilaku state (keranjang, checkout, chat, ulasan) dibuktikan oleh `components/providers/store-provider.test.tsx` (`npm run test:ui`), yang memakai hook publik `useStore` dan `useAuth` sehingga tetap berlaku saat state berpindah antar modul.
5. Satu modul per commit. Catat di tabel di bawah dan di PROGRESS.md.

Fitur baru dibuat langsung sebagai modul. Skema produk, misalnya, menjadi `features/catalog` lengkap dengan migrasinya.

## Status migrasi

| Modul | Status | Catatan |
| --- | --- | --- |
| `auth` | **selesai** (12 Okt 2026) | Pilot. Dependensi ke modul lain: tidak ada. Dialog login tidak lagi memakai `useStore()`; ia menerima `onSignedIn`, dan `StoreLoginDialog` di storefront yang menyambungkannya ke toast. HTML render enam halaman identik sebelum dan sesudah. |
| `catalog`, `cart`, `checkout`, `chat`, `reviews` | belum | Berasal dari memecah `StoreProvider`. Satu modul per commit. |
| `orders` | belum | Termasuk `lib/orders-store.ts` dan `lib/order-flow.ts`. |
| `admin` | belum | Dipindah saat disentuh, tidak sekaligus. |
| `shared` | belum | `ui` (atoms, molecules), `lib` (format, i18n, chart). |

Teks `content/id.json` bisa dipecah per modul belakangan tanpa mengubah key-nya (`t("store.cart.title")` tetap sama).
