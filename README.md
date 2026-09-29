# Marketplace Pink & Ivory

Prototype frontend marketplace statis dengan halaman customer dan dashboard admin.

## Halaman

- `/` — marketplace, detail produk, wishlist, keranjang, dan checkout transfer manual.
- `/admin/` — dashboard admin, produk, promo, voucher, pembayaran, ongkir, banner, dan popup campaign.

## Menjalankan lokal

Project ini tidak membutuhkan proses build. Jalankan folder `dist` dengan static web server:

```bash
npx serve dist
```

Alternatif:

```bash
python3 -m http.server 8080 --directory dist
```

Kemudian buka:

- Marketplace: `http://localhost:8080/`
- Admin: `http://localhost:8080/admin/`

## Struktur

```text
dist/
├── index.html          # Marketplace customer
├── admin/
│   └── index.html      # Dashboard admin
└── assets/
    └── products.png    # Sprite foto produk demo
```

## Integrasi backend

Data saat ini masih berada di array JavaScript dalam masing-masing file HTML. Saat implementasi backend, ganti data contoh dan fungsi mutasi dengan pemanggilan API.

Endpoint yang disarankan:

- `GET/POST/PUT/DELETE /api/products`
- `GET/POST/PUT/DELETE /api/promos`
- `GET/POST/PUT/DELETE /api/vouchers`
- `GET/PUT /api/payments`
- `GET/POST/PUT/DELETE /api/shipping-methods`
- `GET/POST/PUT/DELETE /api/banners`
- `GET/POST/PUT/DELETE /api/popups`
- `GET /api/statistics?period=monthly|yearly`
- `POST /api/orders`
- `POST /api/orders/{id}/payment-proof`

Tambahkan autentikasi dan otorisasi pada seluruh route `/admin` dan API admin sebelum digunakan di production.

## Catatan upload

Upload gambar produk, banner, poster popup, serta bukti transfer sebaiknya disimpan di object storage. Database hanya menyimpan URL file dan metadata terkait.
