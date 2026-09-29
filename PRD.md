# PRD — Toko Online Jastip & Barang Impor

**Status:** Draft untuk diskusi  
**Versi:** 0.2  
**Pembaruan:** 29 September 2026

## 1. Ringkasan Produk

Web commerce **single seller** untuk barang jastip dan impor, dengan fokus awal pada aksesori, produk lifestyle, dan barang bergaya feminin yang sulit atau mahal ditemukan di pasar lokal.

Produk ini bukan marketplace multi-seller. MVP tidak mencakup onboarding seller, komisi, split payment, atau settlement ke banyak seller.

### Tujuan MVP

- Buyer dapat menemukan produk ready stock dan pre-order (PO).
- Buyer dapat checkout, transfer manual, dan mengunggah bukti pembayaran.
- Buyer dapat memantau status pesanan secara jelas.
- Admin dapat mengelola katalog, PO, pembayaran, fulfillment, ongkir, dan materi promosi tanpa mengubah kode.

### Di luar MVP

- Multi-seller.
- Payment gateway dan ongkir otomatis.
- Chat, rating/review, serta notifikasi WhatsApp otomatis.

## 2. Target Pengguna

### Buyer

- Pembeli barang impor atau jastip.
- Membutuhkan informasi ketersediaan, estimasi PO, harga final, dan status order yang transparan.
- Berpotensi menjadi repeat buyer sehingga membutuhkan akun dan histori order.

### Admin

- Pemilik atau staf internal toko.
- Mengelola seluruh operasi dan konten toko.
- Tidak ada role seller eksternal pada MVP.

## 3. Indikator Keberhasilan

- Buyer dapat menyelesaikan checkout tanpa bantuan admin.
- Tidak terjadi overselling ready stock maupun kuota PO.
- Setiap perubahan pembayaran dan order dapat ditelusuri.
- Admin dapat mengoperasikan toko melalui dashboard.
- Seluruh alur utama nyaman digunakan pada mobile dan desktop.

Target konversi, jumlah order, dan repeat buyer ditentukan setelah baseline traffic tersedia.

## 4. Tech Stack

- **Frontend dan server logic:** Next.js App Router.
- **Styling:** Tailwind CSS.
- **Database dan Auth:** Supabase Postgres, Auth, dan RLS.
- **File storage:** Cloudflare R2 untuk foto produk, banner, popup, dan bukti transfer.
- **Hosting:** Cloudflare Workers melalui `@opennextjs/cloudflare`.
- **Repository/CI:** GitHub.

### Constraint biaya

Target development dan MVP awal adalah biaya nol selama penggunaan masih berada dalam kuota free tier. Sistem tetap membutuhkan monitoring penggunaan dan rencana upgrade. Free tier bukan jaminan biaya nol ketika traffic atau data bertambah.

### Catatan teknis

- Gunakan Node.js runtime dan aktifkan `nodejs_compat` pada Cloudflare.
- Jangan bergantung pada filesystem lokal persisten.
- Simpan file di R2; database hanya menyimpan object key, URL, ukuran, MIME type, dan metadata.

## 5. Role dan Akses

| Role | Akses |
|---|---|
| Guest | Melihat katalog dan detail produk. |
| Buyer | Cart, checkout, bukti pembayaran, histori, dan tracking order miliknya. |
| Admin | Seluruh dashboard dan data operasional toko. |

Keputusan awal:

- Checkout membutuhkan login agar histori dan tracking konsisten.
- Route `/admin` dilindungi autentikasi dan pengecekan role di server.
- RLS memastikan buyer hanya dapat mengakses data miliknya.

## 6. Sistem Produk

### Ready stock

- Memiliki stok fisik.
- Tidak dapat ditambahkan ke cart jika stok habis.
- Pengurangan stok memakai reservasi dan transaksi database agar tidak oversold.

### Pre-order

- Produk dapat memiliki beberapa batch PO sepanjang waktu.
- Batch memiliki waktu buka, deadline, kuota, jumlah reserved/sold, estimasi tiba, dan status.
- Batch otomatis ditutup saat deadline tercapai atau kuota habis.
- Produk PO tanpa batch aktif tidak dapat di-checkout.

### Status produk

`draft`, `active`, `inactive`, `archived`.

Produk yang pernah masuk order tidak dihapus permanen agar histori transaksi tetap utuh.

## 7. Cart dan Reservasi

### Keputusan MVP

- Ready stock dan PO tampil dalam katalog yang sama dan boleh masuk satu checkout.
- Buyer melakukan satu pembayaran untuk seluruh item.
- Sistem memecah order menjadi beberapa kelompok fulfillment/pengiriman berdasarkan tipe barang dan estimasi ketersediaan.
- Ready stock dapat dikirim lebih dulu tanpa menunggu item PO.
- Item PO dapat dikelompokkan lagi jika berasal dari batch atau estimasi tiba yang berbeda.
- Ongkir dihitung per kelompok pengiriman dan seluruh ongkir ditampilkan sebelum buyer mengonfirmasi checkout.
- Stok/kuota ditahan selama **2 jam** setelah order dibuat.
- Tanpa bukti pembayaran dalam dua jam, order kedaluwarsa dan reservasi dilepas.
- Setelah bukti diunggah, reservasi bertahan sampai admin menerima/menolak pembayaran.
- Kuantitas divalidasi ulang ketika checkout.

## 8. Alur Buyer

1. Browse, cari, atau filter katalog.
2. Lihat detail, tipe produk, harga, stok/sisa kuota, deadline, dan estimasi PO.
3. Tambah ke cart atau beli langsung.
4. Login/register jika belum memiliki sesi.
5. Pilih/isi alamat dan layanan untuk setiap kelompok pengiriman.
6. Lihat rincian item, pemisahan pengiriman, ongkir, dan harga final lalu buat order.
7. Sistem mereservasi stok/kuota.
8. Sistem menampilkan rekening, nominal transfer, dan batas waktu pembayaran.
9. Buyer transfer dan mengunggah bukti.
10. Buyer menunggu verifikasi serta memantau status order.

## 9. Pembayaran Manual

1. Order dibuat dengan payment status `awaiting_payment`.
2. Buyer mentransfer nominal tepat.
3. Buyer mengunggah bukti; status menjadi `under_review`.
4. Admin menerima atau menolak bukti.
5. Jika diterima, status menjadi `paid` dan fulfillment dimulai.
6. Jika ditolak, buyer melihat alasan dan dapat mengunggah ulang selama batas waktu yang diizinkan.

Aturan upload:

- JPG, PNG, atau PDF; maksimal awal 5 MB.
- Simpan waktu upload, pemeriksa, waktu verifikasi, dan catatan.
- Upload ulang tidak menimpa file lama; simpan sebagai riwayat.
- Bukti transfer bersifat privat dan dibuka lewat signed URL singkat.
- Rekening pembayaran dikelola admin, bukan ditulis langsung di source code.

## 10. Ongkir MVP

MVP memakai tarif yang dikelola manual oleh admin:

- Nama layanan dan wilayah tujuan.
- Tarif dasar/per wilayah.
- Estimasi pengiriman.
- Minimal belanja gratis ongkir.
- Status aktif/nonaktif.

Ongkir disalin ke order saat checkout. Perubahan tarif berikutnya tidak boleh mengubah histori order. Integrasi Biteship/RajaOngkir masuk fase berikutnya.

## 11. Dashboard Admin MVP

### Dashboard dan laporan

- Ringkasan penjualan, order, pembayaran menunggu verifikasi, dan produk aktif.
- Statistik penjualan bulanan/tahunan.
- Pembayaran terbaru dan aksi cepat.

### Produk dan PO

- Tambah, edit, arsip, aktif/nonaktif produk.
- Upload/urutkan foto; kelola harga, stok, kategori, dan varian.
- Buat/tutup batch PO; atur deadline, kuota, dan estimasi tiba.

### Order dan pembayaran

- Cari/filter order dan lihat detail/bukti transfer.
- Terima/tolak pembayaran dengan catatan.
- Perbarui fulfillment status dan lihat histori status.

### Promo dan voucher

- Diskon nominal, persentase, atau gratis ongkir.
- Target produk/kategori, minimal belanja, kuota, dan limit per buyer.
- Aktivasi langsung atau scheduler mulai–berakhir.
- Aturan stacking promo harus eksplisit.

### Banner dan popup

- Banner: judul, subjudul, CTA, gambar, target URL, urutan, status, dan jadwal.
- Popup: poster, trigger, frekuensi, target halaman, jadwal, status, dan prioritas.
- Trigger awal: saat halaman dibuka atau setelah jeda waktu.
- Frekuensi awal: sekali per sesi, sekali per hari, atau selalu.
- Admin dapat preview sebelum publikasi.

### Ongkir

- CRUD layanan/tarif, aktif/nonaktif, dan gratis ongkir.

## 12. State Machine

Pisahkan status pembayaran dan fulfillment.

### Payment

```text
awaiting_payment → under_review → paid
                         ↘ rejected → under_review
awaiting_payment → expired
```

### Ready stock fulfillment

```text
unfulfilled → processing → packed → shipped → delivered
                         ↘ cancelled
```

### PO fulfillment

```text
unfulfilled → ordered_abroad → shipped_to_indonesia → arrived_at_warehouse
            → packed → shipped_to_buyer → delivered
            ↘ cancelled
```

Jika pembayaran sudah diterima tetapi order dibatalkan, gunakan `refund_pending` dan `refunded`. Semua transisi dicatat dalam histori status.

## 13. Perhitungan Harga

Urutan usulan:

1. Subtotal dari snapshot harga `OrderItem`.
2. Diskon produk/promo.
3. Diskon voucher.
4. Ongkir.
5. Diskon ongkir.
6. Total akhir.

Order menyimpan snapshot subtotal, diskon, ongkir, dan total. Perubahan harga atau promo setelah checkout tidak mengubah order lama.

## 14. Data Model Awal

### Identity

- `Profile`: user, role, nama, telepon, timestamps.
- `Address`: buyer, label, penerima, telepon, detail alamat, kota, provinsi, kode pos, default flag.

### Catalog

- `Category`: nama, slug, status, urutan.
- `Product`: nama, slug, deskripsi, tipe, status, harga dasar, ready stock.
- `ProductImage`: product, object key, URL, alt text, urutan.
- `ProductVariant` (opsional): product, nama, SKU, harga override, stok.
- `PreorderBatch`: product, waktu buka, deadline, kuota, reserved, sold, ETA, status.

### Commerce

- `Cart`, `CartItem` jika cart tersimpan lintas perangkat.
- `Order`: buyer, nomor, payment status, snapshot alamat dan harga, expiry.
- `OrderItem`: referensi produk/varian, snapshot nama/harga, quantity, batch PO.
- `FulfillmentGroup`: order, tipe ready/PO, batch/ETA, shipping method, shipping fee snapshot, fulfillment status.
- `FulfillmentGroupItem`: relasi item order ke kelompok pengiriman.
- `StockReservation`: product/variant/batch, quantity, expiry, status.
- `Payment`: amount, status, submission/verification time, verifier, rejection reason.
- `PaymentProof`: payment, object key, MIME type, ukuran, waktu upload.
- `OrderStatusHistory`: status type, old/new value, actor, note, timestamp.

### Marketing dan operasional

- `ShippingMethod`, `ShippingRate`.
- `Promotion` dan aturan target.
- `Voucher`, `VoucherRedemption`.
- `Banner`, `PopupCampaign`.
- `AdminAuditLog`.

## 15. Scheduler

- Mengaktifkan/menonaktifkan promo, voucher, banner, popup, dan batch PO.
- Waktu disimpan sebagai UTC dan ditampilkan sebagai Asia/Jakarta.
- Job harus idempotent.
- Query publik tetap memeriksa `start_at`, `end_at`, dan status agar campaign kedaluwarsa tidak tampil walaupun scheduler terlambat.

## 16. Keamanan

- Terapkan RLS pada seluruh data buyer.
- Buyer hanya dapat membaca order, payment, alamat, dan bukti miliknya.
- Operasi admin memerlukan sesi valid dan role admin.
- Service role key hanya berada di server.
- Validasi MIME type, ekstensi, dan ukuran upload.
- Terapkan rate limiting pada login, pembuatan order, dan upload.
- Catat aksi penting admin dalam audit log.

## 17. Non-Functional Requirements

- Responsive mobile, tablet, dan desktop.
- Metadata SEO untuk katalog/detail produk.
- Loading, empty, error, dan success state pada alur utama.
- Pembuatan order dan reservasi bersifat idempotent.
- Stok/kuota/order memakai transaksi atau fungsi Postgres atomik.
- Mata uang IDR; zona waktu tampilan Asia/Jakarta.
- Navigasi keyboard, label form, focus state, dan kontras memadai.

## 18. Scope MVP

### Wajib

- [ ] Katalog ready stock/PO dengan pencarian dan filter.
- [ ] Detail produk dan batch PO.
- [ ] Auth buyer/admin.
- [ ] Cart, checkout, alamat, dan ongkir manual.
- [ ] Reservasi stok/kuota dan order expiry.
- [ ] Transfer manual dan upload bukti.
- [ ] Histori/tracking order buyer.
- [ ] Admin produk, PO, order, pembayaran, dan ongkir.
- [ ] Promo, voucher, banner, popup, dan scheduler dasar sebagai bagian MVP.
- [ ] Statistik bulanan/tahunan.
- [ ] RLS dan audit log.

### Fase berikutnya

- Payment gateway.
- Integrasi ongkir.
- Notifikasi WhatsApp/email otomatis.
- Rating/review dan wishlist tersimpan.
- Refund otomatis, advanced analytics, dan export laporan.

## 19. Acceptance Criteria

- Buyer tidak dapat membeli melebihi stok/kuota.
- Order expiry melepaskan reservasi.
- Buyer hanya melihat data miliknya.
- Total order tidak berubah setelah checkout.
- Verifikasi admin langsung terlihat pada tracking buyer.
- Campaign hanya tampil dalam periode dan halaman target.
- Produk arsip tetap muncul pada histori order.
- Perubahan status penting menyimpan waktu dan aktor.

## 20. Keputusan Terbuka

1. Checkout wajib login atau boleh guest?
2. Apakah varian warna/ukuran diperlukan sejak MVP?
3. Ongkir berdasarkan kota/provinsi, zona, atau flat nasional?
4. PO dibayar penuh atau memakai deposit?
5. Siapa boleh membatalkan dan pada tahap apa?
6. Apakah promo otomatis dan voucher boleh ditumpuk?
7. Apakah notifikasi web cukup untuk MVP?

---

Dokumen ini adalah living document dan diperbarui setelah keputusan produk disepakati.
