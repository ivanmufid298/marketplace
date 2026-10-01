# Progress

Status pengerjaan terhadap scope MVP di [PRD.md](PRD.md) bagian 18. File ini diperbarui setiap ada perubahan status, sedangkan [README.md](README.md) hanya berisi gambaran umum dan cara menjalankan.

**Pembaruan terakhir:** 1 Oktober 2026

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
| Pembatalan order | UI sebagian | Admin bisa membatalkan pesanan dengan alasan wajib sampai pembeli menandai selesai, dan mencatat refund untuk pesanan yang sudah dibayar. Pembeli belum bisa membatalkan sendiri sebelum upload bukti. |
| Histori dan tracking order buyer | UI sebagian | Menu "Pesanan saya" (ikon paket di header, tab "Pesanan" di navigasi bawah mobile) menampilkan pesanan pembeli dengan status Menunggu pembayaran, Barang sedang dikirim, Selesai, atau Dibatalkan. Checkout membuat pesanan baru, dan tombol "Pesanan selesai" (dengan konfirmasi) muncul saat barang sedang dikirim. Belum ada halaman `/orders` dan `/orders/[orderNumber]`, dan pembeli belum bisa membatalkan pesanan. |
| Admin: produk, varian, PO, order, pembayaran, zona ongkir | UI sebagian | Produk, pesanan, pembayaran, dan ongkir ada. Belum ada batch PO dan varian. Tolak pembayaran belum meminta alasan. Pembayaran dan Pesanan memakai data yang sama: menerima pembayaran mengubah status pesanan menjadi "Barang sedang dikirim". |
| Promo, voucher, banner, popup, scheduler dasar | UI sebagian | Layar admin dan form scheduler ada, tetapi form belum menyimpan. Storefront belum menampilkan banner, popup, atau input voucher. |
| Widget chat buyer dan menu admin Interactions | UI | Chat storefront dan inbox admin berjalan, tetapi belum terhubung satu sama lain. |
| Rating/review dan moderasi di admin | UI sebagian | Moderasi di admin ada. Pembeli bisa menulis dan mengubah ulasan (rating 1–5 dan teks) dari "Pesanan saya", hanya untuk item di pesanan berstatus Selesai. Ulasan baru tersimpan di memori browser dan belum muncul di admin maupun detail produk, yang masih placeholder yang sama untuk semua produk. |
| Statistik bulanan/tahunan | UI | Grafik dan angka masih statis. |
| Analitik kunjungan dan jumlah dilihat per produk | UI | Grafik "Statistik pengunjung" (bulanan/tahunan) dan kartu "Kunjungan toko" (total kunjungan dan sebaran perangkat) di dashboard dan jumlah dilihat (ikon mata) per produk di etalase admin. Angkanya data contoh. Belum ada pencatatan di storefront, sesi anonim, deteksi tipe perangkat, dan filter bot. |
| RLS dan audit log | Belum | |

## Selesai sejauh ini

- Status pesanan disederhanakan jadi tiga langkah otomatis: **Pending** → **Barang sedang dikirim** (saat admin menerima pembayaran) → **Selesai** (saat pembeli menekan "Pesanan selesai"), ditambah **Dibatalkan**. Halaman admin Pesanan (`/admin/orders`) menampilkan satu kolom Status, tanpa kolom pembayaran, dengan detail berisi stepper tiga langkah, barang, riwayat, serta tombol batalkan (alasan wajib) dan catat refund untuk pesanan yang sudah dibayar. Halaman Pembayaran, Pesanan, dan "Pesanan saya" membaca data yang sama lewat `lib/orders-store.ts`, dan checkout pembeli membuat pesanan baru di sana.
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

1. Supabase Auth, profile, role buyer/admin, dan proteksi `/admin`.
2. Skema database: kategori, produk, varian, foto, batch PO.
3. Cart, reservasi stok/kuota, order expiry, dan checkout yang menyimpan pesanan ke database (fulfillment group per kelompok pengiriman ditunda).
4. Pembayaran manual, riwayat bukti transfer, dan penyimpanan privat di R2.
5. Batch PO di admin, serta menyambungkan order, interaction, review, promo, voucher, banner, popup, dan scheduler ke database.
6. RLS, audit log, rate limiting, dan automated testing.
7. Deploy ke Cloudflare Workers.

Utang teknis yang sudah diketahui:

- Pesanan disimpan di `localStorage` lewat `lib/orders-store.ts` agar storefront dan admin berbagi data saat demo. Ganti dengan query database. Ada tombol "Reset data contoh" di sidebar admin untuk mengembalikan data awal.
- Status order MVP hanya tiga langkah. Status pengiriman per kelompok dan alur PO yang rinci dari PRD ditunda sampai dibutuhkan.
- Konversi CSS prototype ke utility Tailwind, komponen demi komponen.
- Gabungkan `Button` dan `AdminButton` (serta atom lain yang terpisah per konteks) setelah CSS dikonversi ke Tailwind.
- Nama toko berbeda per produk di data contoh (`shop`) tidak sesuai dengan model single seller.
- Kategori contoh (Rumah, Elektronik) belum mencerminkan fokus aksesori dan barang bergaya feminin.
- Project Vercel perlu Framework Preset diubah ke Next.js dan Output Directory dikosongkan.
