# Progress

Status pengerjaan terhadap scope MVP di [PRD.md](PRD.md) bagian 18. File ini diperbarui setiap ada perubahan status, sedangkan [README.md](README.md) hanya berisi gambaran umum dan cara menjalankan.

**Pembaruan terakhir:** 30 September 2026

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
| Auth buyer/admin | Belum | Tombol Akun belum berfungsi dan `/admin` belum dilindungi. |
| Cart lokal, pemindahan cart setelah login, checkout, alamat | UI sebagian | Cart dengan quantity dan batas stok, serta checkout 3 langkah ada. Cart belum tersimpan di browser dan belum ada alamat tersimpan. |
| Ongkir manual berbasis zona | Belum | Checkout memakai 3 opsi flat yang di-hardcode. Halaman ongkir admin belum mengenal zona kota/provinsi. |
| Reservasi stok/kuota dan order expiry | Belum | Aturan 2 jam dan batas upload ulang 2 jam belum diimplementasikan. |
| Transfer manual dan upload bukti | UI | Simulasi saja: cek ukuran 5 MB, file tidak tersimpan, MIME type belum divalidasi. |
| Pembatalan order | Belum | |
| Histori dan tracking order buyer | Belum | Belum ada halaman `/orders`. |
| Admin: produk, varian, PO, order, pembayaran, zona ongkir | UI sebagian | Produk, pembayaran (terima/tolak), dan ongkir ada. Belum ada halaman order, batch PO, dan varian. Tolak pembayaran belum meminta alasan. |
| Promo, voucher, banner, popup, scheduler dasar | UI sebagian | Layar admin dan form scheduler ada, tetapi form belum menyimpan. Storefront belum menampilkan banner, popup, atau input voucher. |
| Widget chat buyer dan menu admin Interactions | UI | Chat storefront dan inbox admin berjalan, tetapi belum terhubung satu sama lain. |
| Rating/review dan moderasi di admin | UI sebagian | Moderasi di admin ada. Review di detail produk masih placeholder yang sama untuk semua produk, dan buyer belum bisa menulis review. |
| Statistik bulanan/tahunan | UI | Grafik dan angka masih statis. |
| RLS dan audit log | Belum | |

## Selesai sejauh ini

- Keputusan produk MVP difinalkan di PRD v0.3.
- Prototype HTML statis dimigrasikan ke Next.js App Router (storefront di `/`, admin di `/admin/*`). Prototype asli disimpan di `prototype/`.
- Tailwind CSS v4 terpasang dengan token warna. Tampilan masih memakai CSS prototype yang di-scope ke `.store` dan `.admin`.

## Sedang dan berikutnya

Urutan mengikuti dependensi teknis:

1. Supabase Auth, profile, role buyer/admin, dan proteksi `/admin`.
2. Skema database: kategori, produk, varian, foto, batch PO.
3. Cart, reservasi stok/kuota, order expiry, checkout, dan fulfillment group.
4. Pembayaran manual, riwayat bukti transfer, dan penyimpanan privat di R2.
5. Halaman order di admin, batch PO, interaction, review, promo, voucher, banner, popup, dan scheduler.
6. RLS, audit log, rate limiting, dan automated testing.
7. Deploy ke Cloudflare Workers.

Utang teknis yang sudah diketahui:

- Konversi CSS prototype ke utility Tailwind, komponen demi komponen.
- Nama toko berbeda per produk di data contoh (`shop`) tidak sesuai dengan model single seller.
- Kategori contoh (Rumah, Elektronik) belum mencerminkan fokus aksesori dan barang bergaya feminin.
- Project Vercel perlu Framework Preset diubah ke Next.js dan Output Directory dikosongkan.
