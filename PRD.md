# PRD — Toko Online Jastip & Barang Impor

**Status:** Draft untuk diskusi  
**Versi:** 0.4  
**Pembaruan:** 30 September 2026

## 1. Ringkasan Produk

Web commerce **single seller** untuk barang jastip dan impor, dengan fokus awal pada aksesori, produk lifestyle, dan barang bergaya feminin yang sulit atau mahal ditemukan di pasar lokal.

Produk ini bukan marketplace multi-seller. MVP tidak mencakup onboarding seller, komisi, split payment, atau settlement ke banyak seller.

### Tujuan MVP

- Buyer dapat menemukan produk ready stock dan pre-order (PO).
- Buyer dapat checkout, transfer manual, dan mengunggah bukti pembayaran.
- Buyer dapat memantau status pesanan secara jelas.
- Admin dapat mengelola katalog, PO, pembayaran, fulfillment, ongkir, dan materi promosi tanpa mengubah kode.
- Buyer dapat menghubungi admin melalui widget chat dan setiap percakapan tercatat sebagai interaction.

### Di luar MVP

- Multi-seller.
- Payment gateway dan ongkir otomatis.
- Notifikasi WhatsApp/email otomatis.
- Wishlist tersimpan lintas perangkat.
- Sistem deposit/cicilan PO.
- Refund otomatis, advanced analytics, dan export laporan.

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

- Guest dapat melihat katalog, menggunakan chat, dan menyimpan cart secara lokal.
- Checkout membutuhkan login agar histori dan tracking konsisten.
- Cart lokal guest dapat dipindahkan ke akun setelah login dan tetap divalidasi ulang.
- Route `/admin` dilindungi autentikasi dan pengecekan role di server.
- RLS memastikan buyer hanya dapat mengakses data miliknya.

## 6. Sistem Produk

### Ready stock

- Memiliki stok fisik.
- Tidak dapat ditambahkan ke cart jika stok habis.
- Pengurangan stok memakai reservasi dan transaksi database agar tidak oversold.

### Varian

- Varian sederhana seperti warna atau ukuran termasuk MVP.
- Setiap varian dapat memiliki SKU, harga override, stok, urutan, dan status aktif.
- Jika produk memakai varian, stok ready stock dikelola pada varian, bukan digandakan pada produk.
- Item dengan produk dan varian yang sama digabung menjadi satu baris cart.

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
- Cart belum menahan stok atau kuota. Reservasi baru dibuat secara atomik saat order berhasil dibuat.
- Stok/kuota ditahan selama **2 jam** setelah order dibuat.
- Tanpa bukti pembayaran dalam dua jam, order kedaluwarsa dan reservasi dilepas.
- Setelah bukti diunggah, reservasi bertahan sampai admin menerima/menolak pembayaran.
- Jika pembayaran ditolak, reservasi tetap ditahan selama **2 jam** sejak penolakan agar buyer dapat mengunggah ulang.
- Tanpa unggahan ulang sampai batas tersebut, order menjadi `expired` dan reservasi dilepas otomatis.
- Kuantitas divalidasi ulang ketika checkout.
- Penambahan quantity tidak boleh melewati stok atau kuota aktif yang tersedia saat validasi.

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
10. Buyer menunggu verifikasi serta memantau status order dari menu **Pesanan Saya** (header pada desktop, navigasi bawah pada mobile).
11. Setelah pesanan diterima (`delivered`), buyer menulis rating dan ulasan untuk tiap item dari menu Pesanan Saya.

## 9. Pembayaran Manual

1. Order dibuat dengan payment status `awaiting_payment`.
2. Buyer mentransfer nominal tepat.
3. Buyer mengunggah bukti; status menjadi `under_review`.
4. Admin menerima atau menolak bukti.
5. Jika diterima, status menjadi `paid` dan fulfillment dimulai.
6. Jika ditolak, buyer melihat alasan dan dapat mengunggah ulang dalam **2 jam** sejak penolakan.
7. Jika buyer mengunggah ulang sebelum batas waktu, status kembali menjadi `under_review`.
8. Jika tidak ada unggahan ulang sampai batas waktu, status menjadi `expired` dan reservasi dilepas.
9. Admin tetap dapat membatalkan order secara manual dengan alasan pada tahap mana pun sebelum fulfillment dikirim.

Keputusan MVP:

- Produk ready stock dan PO dibayar penuh dalam satu transaksi.
- Deposit atau pembayaran bertahap PO tidak termasuk MVP.

Aturan upload:

- JPG, PNG, atau PDF; maksimal awal 5 MB.
- Simpan waktu upload, pemeriksa, waktu verifikasi, dan catatan.
- Upload ulang tidak menimpa file lama; simpan sebagai riwayat.
- Bukti transfer bersifat privat dan dibuka lewat signed URL singkat.
- Rekening pembayaran dikelola admin, bukan ditulis langsung di source code.

## 10. Ongkir MVP

MVP memakai zona dan tarif yang dikelola manual oleh admin:

- Admin membuat zona pengiriman yang berisi satu atau beberapa kota/provinsi.
- Setiap zona dapat memiliki beberapa layanan dan tarif.
- Estimasi pengiriman.
- Minimal belanja gratis ongkir.
- Status aktif/nonaktif.

Jika alamat tidak cocok dengan zona aktif, buyer tidak dapat menyelesaikan checkout dan diarahkan menghubungi admin.

Ongkir disalin ke order saat checkout. Perubahan tarif berikutnya tidak boleh mengubah histori order. Integrasi Biteship/RajaOngkir masuk fase berikutnya.

## 11. Dashboard Admin MVP

### Dashboard dan laporan

- Ringkasan penjualan, order, pembayaran menunggu verifikasi, dan produk aktif.
- Statistik penjualan bulanan/tahunan.
- Analitik kunjungan: total kunjungan, sebaran tipe perangkat, dan grafik statistik pengunjung bulanan/tahunan.
- Jumlah dilihat per produk (pembukaan detail produk) pada halaman etalase admin, ditampilkan sebagai angka dengan ikon mata.
- Pembayaran terbaru dan aksi cepat.

### Aturan analitik kunjungan

- Satu kunjungan dihitung per sesi anonim (cookie sesi), bukan per muat ulang halaman.
- Hanya **tipe perangkat** (`mobile`, `desktop`, `tablet`) yang disimpan, diturunkan dari User-Agent atau Client Hints di server. User-Agent mentah, alamat IP, dan fingerprint perangkat tidak disimpan.
- Trafik bot dan crawler dikeluarkan dari hitungan berdasarkan User-Agent.
- Produk dihitung "dilihat" saat buyer membuka detail produk, satu kali per sesi per produk dalam jendela waktu singkat agar tidak terinflasi oleh pembukaan berulang. Sebaran perangkat hanya ditampilkan untuk kunjungan toko, tidak per produk.
- Halaman `/admin` tidak ikut dihitung sebagai kunjungan.
- Data bersifat agregat untuk admin dan tidak terhubung ke identitas buyer.

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

### Interactions

- Widget chat tersedia pada halaman buyer.
- Pesan pertama membuat interaction baru dengan nomor unik.
- Setiap interaction memiliki buyer/session reference, status, waktu dibuat, waktu pesan terakhir, unread count, dan assignee opsional.
- Admin dapat mencari, membuka thread, membalas, serta mengubah status interaction menjadi `open` atau `handled`.
- Cara menentukan apakah beberapa chat berasal dari device/session yang sama ditangani pada backend dan tidak menjadi aturan UI.
- Guest memakai session reference anonim. Setelah login, backend boleh mengaitkan interaction dengan buyer tanpa menggabungkan thread secara otomatis.
- Riwayat pesan tidak dihapus ketika interaction selesai.

### Reviews

- Buyer yang order-nya sudah `delivered` dapat memberi rating 1–5 dan ulasan teks.
- Rating wajib dipilih dan teks ulasan wajib diisi. Ulasan ditulis dari menu Pesanan Saya pada item order yang sudah `delivered`.
- Satu `OrderItem` hanya dapat memiliki satu review, tetapi buyer boleh mengeditnya.
- Detail produk menampilkan rating rata-rata, jumlah review, distribusi bintang, dan daftar ulasan.
- Review diberi penanda pembelian terverifikasi.
- Admin dapat memfilter berdasarkan rating/status dan menampilkan atau menyembunyikan review.
- Review yang disembunyikan tetap disimpan untuk audit dan tidak ikut dalam rating publik.

## 12. State Machine

Pisahkan status pembayaran dan fulfillment.

### Payment

```text
awaiting_payment → under_review → paid
                         ↘ rejected → under_review
                                    ↘ expired (2 jam tanpa upload ulang)
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

### Status ringkas order

Untuk tampilan buyer, sistem menurunkan status ringkas dari payment dan seluruh fulfillment group:

`pending_payment`, `payment_review`, `processing`, `partially_shipped`, `completed`, atau `cancelled`.

Status ringkas bukan sumber kebenaran baru dan tidak boleh menggantikan payment status maupun fulfillment status.

### Pembatalan

- Buyer boleh membatalkan order sebelum bukti pembayaran diunggah.
- Order `awaiting_payment` otomatis dibatalkan ketika reservasi kedaluwarsa.
- Setelah bukti diunggah, pembatalan diproses admin dan wajib memiliki catatan.
- Order `paid` yang dibatalkan masuk ke `refund_pending`, lalu `refunded` setelah pengembalian dana dicatat.
- Fulfillment yang sudah dikirim tidak dapat dibatalkan melalui alur pembatalan biasa.

## 13. Perhitungan Harga

Urutan usulan:

1. Subtotal dari snapshot harga `OrderItem`.
2. Diskon produk/promo.
3. Diskon voucher.
4. Ongkir.
5. Diskon ongkir.
6. Total akhir.

Order menyimpan snapshot subtotal, diskon, ongkir, dan total. Perubahan harga atau promo setelah checkout tidak mengubah order lama.

### Aturan stacking MVP

- Satu order menerima maksimal satu promo otomatis dan satu voucher.
- Voucher memiliki flag `stackable_with_promotion`.
- Jika beberapa promo otomatis valid, sistem memilih satu promo yang paling menguntungkan buyer.
- Validasi promo dan voucher dijalankan ulang ketika order dibuat.

## 14. Data Model Awal

### Identity

- `Profile`: user, role, nama, telepon, timestamps.
- `Address`: buyer, label, penerima, telepon, detail alamat, kota, provinsi, kode pos, default flag.

### Catalog

- `Category`: nama, slug, status, urutan.
- `Product`: nama, slug, deskripsi, tipe, status, harga dasar, ready stock.
- `ProductImage`: product, object key, URL, alt text, urutan.
- `ProductVariant`: product, nama, SKU, harga override, stok, urutan, status.
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

- `ShippingZone`, `ShippingZoneArea`, `ShippingMethod`, `ShippingRate`.
- `Promotion` dan aturan target.
- `Voucher`, `VoucherRedemption`.
- `Banner`, `PopupCampaign`.
- `Interaction`: buyer/session reference, channel, status, assignee, first/last message time, metadata.
- `InteractionMessage`: interaction, sender type, sender reference, message body, sent/read time.
- `ProductReview`: order item, product, buyer, rating, review body, moderation status, timestamps.
- `SiteVisit`: session reference anonim, tipe perangkat, path, waktu.
- `ProductView`: product, session reference anonim, waktu.
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
- [ ] Detail produk, varian warna/ukuran, dan batch PO.
- [ ] Auth buyer/admin.
- [ ] Cart lokal guest, pemindahan cart setelah login, checkout, dan alamat.
- [ ] Ongkir manual berbasis zona (kota/provinsi).
- [ ] Reservasi stok/kuota dan order expiry.
- [ ] Transfer manual dan upload bukti.
- [ ] Pembatalan order sesuai aturan (buyer sebelum upload bukti, admin sesudahnya).
- [ ] Histori/tracking order buyer dengan status ringkas.
- [ ] Admin produk, varian, PO, order, pembayaran, dan zona ongkir.
- [ ] Promo, voucher, banner, popup, dan scheduler dasar sebagai bagian MVP.
- [ ] Widget chat buyer dan menu admin Interactions.
- [ ] Rating/review pada detail produk dan moderasi review di admin.
- [ ] Statistik bulanan/tahunan.
- [ ] Analitik kunjungan (dengan sebaran tipe perangkat) dan jumlah dilihat per produk.
- [ ] RLS dan audit log.

### Fase berikutnya

- Payment gateway.
- Integrasi ongkir.
- Notifikasi WhatsApp/email otomatis.
- Wishlist tersimpan lintas perangkat.
- Sistem deposit/cicilan PO.
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

## 20. Keputusan Produk MVP

1. Guest boleh browsing, chat, dan memakai cart lokal, tetapi wajib login sebelum membuat order.
2. Varian sederhana warna/ukuran masuk MVP.
3. Ongkir dikelola admin berdasarkan zona yang berisi kota/provinsi.
4. Produk PO dibayar penuh; deposit tidak masuk MVP.
5. Buyer hanya dapat membatalkan sebelum bukti pembayaran diunggah. Tahap berikutnya memerlukan proses admin.
6. Maksimal satu promo otomatis dan satu voucher dapat dipakai jika voucher mengizinkan stacking.
7. Notifikasi dalam aplikasi cukup untuk MVP; WhatsApp/email masuk fase berikutnya.

---

Dokumen ini adalah living document dan diperbarui setelah keputusan produk disepakati.
