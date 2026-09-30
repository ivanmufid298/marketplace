// Placeholder domain data for the admin dashboard. Replaced by database queries once the backend exists.
// UI copy (labels, buttons, messages) lives in content/id.json, not here.

export type PaymentStatus = "pending" | "success" | "failed";
export type Payment = { id: string; name: string; total: string; time: string; status: PaymentStatus };

export const initialPayments: Payment[] = [
  { id: "MKP-837291", name: "Nadia Putri", total: "Rp408.000", time: "Hari ini, 14.05", status: "pending" },
  { id: "MKP-837284", name: "Raka Pratama", total: "Rp667.000", time: "Hari ini, 13.42", status: "success" },
  { id: "MKP-837279", name: "Dinda Ayu", total: "Rp218.000", time: "Hari ini, 12.18", status: "pending" },
  { id: "MKP-837265", name: "Bima Akbar", total: "Rp477.000", time: "Hari ini, 10.54", status: "failed" },
  { id: "MKP-837251", name: "Sarah Anjani", total: "Rp347.000", time: "Kemarin, 20.16", status: "success" },
];

export type InteractionStatus = "open" | "handled";
export type InteractionMessage = { from: "customer" | "admin"; text: string; time: string };
export type Interaction = {
  id: string;
  name: string;
  status: InteractionStatus;
  unread: number;
  time: string;
  preview: string;
  messages: InteractionMessage[];
};

export const initialInteractions: Interaction[] = [
  { id: "INT-10492", name: "Nadia Putri", status: "open", unread: 2, time: "14.22", preview: "Kak, barang PO ini kira-kira sampai kapan?", messages: [{ from: "customer", text: "Halo kak, mau tanya soal tote bag PO.", time: "14.20" }, { from: "customer", text: "Kira-kira sampai Indonesianya kapan ya?", time: "14.22" }] },
  { id: "INT-10491", name: "Raka Pratama", status: "open", unread: 1, time: "13.48", preview: "Bisa ganti alamat pengiriman?", messages: [{ from: "customer", text: "Kak, pesanan MKP-837284 bisa ganti alamat?", time: "13.48" }] },
  { id: "INT-10488", name: "Dinda Ayu", status: "open", unread: 1, time: "12.31", preview: "Bukti transfer aku sudah masuk belum?", messages: [{ from: "customer", text: "Bukti transfer aku sudah masuk belum kak?", time: "12.31" }] },
  { id: "INT-10470", name: "Sarah Anjani", status: "handled", unread: 0, time: "Kemarin", preview: "Oke kak, terima kasih.", messages: [{ from: "customer", text: "Pesananku sudah dikirim belum?", time: "Kemarin" }, { from: "admin", text: "Sudah ya kak, nomor resinya JNE123456.", time: "Kemarin" }, { from: "customer", text: "Oke kak, terima kasih.", time: "Kemarin" }] },
];

export type ReviewStatus = "visible" | "hidden";
export type Review = { id: number; buyer: string; product: string; rating: number; text: string; status: ReviewStatus };

export const initialReviews: Review[] = [
  { id: 1, buyer: "Nadia Putri", product: "Tote Canvas Everyday", rating: 5, text: "Produknya sesuai foto, packing rapi dan warnanya cantik banget.", status: "visible" },
  { id: 2, buyer: "Sarah Anjani", product: "Sneakers Rosé", rating: 4, text: "Barang bagus dan admin responsif. Pengiriman sedikit lebih lama.", status: "visible" },
  { id: 3, buyer: "Raka Pratama", product: "Headphone Merlot", rating: 5, text: "Suaranya enak dan barang datang dalam kondisi aman.", status: "visible" },
  { id: 4, buyer: "Dinda Ayu", product: "Dewy Skin Set", rating: 3, text: "Produknya oke, tapi salah satu tutupnya agak longgar.", status: "hidden" },
  { id: 5, buyer: "Maya Sari", product: "Mug Blush Daily", rating: 2, text: "Warna yang datang berbeda dari foto.", status: "visible" },
];

export const REVIEW_STATS = { average: "4.8 ★", count: 382, pending: 7 };

// `views` counts how many times the product detail was opened.
export const adminProducts = [
  { name: "Mug Blush Daily", cat: "Rumah", price: "89.000", stock: "24", views: 1284 },
  { name: "Tote Canvas Everyday", cat: "Fashion", price: "129.000", stock: "18", views: 2046 },
  { name: "Headphone Merlot", cat: "Elektronik", price: "649.000", stock: "9", views: 893 },
  { name: "Lampu Meja Lumi", cat: "Rumah", price: "329.000", stock: "12", views: 467 },
  { name: "Sneakers Rosé", cat: "Fashion", price: "459.000", stock: "16", views: 1710 },
  { name: "Dewy Skin Set", cat: "Kecantikan", price: "279.000", stock: "21", views: 1352 },
];

export type DeviceType = "mobile" | "desktop" | "tablet";

// Visits are counted per anonymous session; bots are excluded and only the coarse device type is kept.
export const VISIT_STATS = {
  visits: 18420,
  trend: "↑ 9,4% dari periode lalu",
  devices: [
    { type: "mobile", pct: 68 },
    { type: "desktop", pct: 27 },
    { type: "tablet", pct: 5 },
  ] satisfies { type: DeviceType; pct: number }[],
};

export const PRODUCT_CATEGORIES = ["Rumah", "Fashion", "Elektronik", "Kecantikan"];

export const DASHBOARD_METRICS = [
  { key: "sales", icon: "rp", value: "Rp128,4 jt", trend: "↑ 12,8% dari bulan lalu", down: false },
  { key: "orders", icon: "bag", value: "1.284", trend: "↑ 8,3% dari bulan lalu", down: false },
  { key: "pending", icon: "clock", value: "18", trend: "Perlu ditinjau admin", down: true },
  { key: "products", icon: "products", value: "246", trend: "↑ 14 produk baru", down: false },
] as const;

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun"];
const YEAR_LABELS = ["2021", "2022", "2023", "2024", "2025", "2026"];

export type ChartPeriod = {
  values: number[];
  labels: string[];
  /** Value at the top of the y axis. */
  max: number;
  /** Y axis labels from bottom to top. */
  axis: string[];
};

export type ChartSeries = { monthly: ChartPeriod; yearly: ChartPeriod };

// Sales in million rupiah.
export const SALES_SERIES: ChartSeries = {
  monthly: { values: [21.9, 46.3, 36.3, 80, 68.8, 105], labels: MONTH_LABELS, max: 150, axis: ["0", "75 jt", "150 jt"] },
  yearly: { values: [18.8, 34, 56.3, 71.9, 92.5, 118.8], labels: YEAR_LABELS, max: 150, axis: ["0", "75 jt", "150 jt"] },
};

// Store visits. The last monthly value matches VISIT_STATS.visits; the last yearly value is the 2026 total so far
// (sum of the six monthly values).
export const VISIT_SERIES: ChartSeries = {
  monthly: { values: [9200, 11800, 10400, 14600, 16100, 18420], labels: MONTH_LABELS, max: 20000, axis: ["0", "10 rb", "20 rb"] },
  yearly: { values: [9000, 21000, 38000, 52000, 66000, 80520], labels: YEAR_LABELS, max: 100000, axis: ["0", "50 rb", "100 rb"] },
};

export const SHIPPING_SERVICES = [
  { name: "Reguler", note: "Estimasi 2–4 hari", base: "18000", free: "300000" },
  { name: "Express", note: "Estimasi 1–2 hari", base: "32000", free: "500000" },
  { name: "Same day", note: "Tiba di hari yang sama", base: "48000", free: "750000" },
];

export const PROMOS = [
  { title: "Weekend Sale", text: "Diskon 15% untuk seluruh produk kategori Fashion.", on: true, label: "Aktif terjadwal", sub: "3 Okt, 00.00 — 5 Okt, 23.59" },
  { title: "Gratis Ongkir", text: "Potongan ongkir maksimal Rp20.000, minimal belanja Rp150.000.", on: true, label: "Aktif sekarang", sub: "Berakhir 30 Okt 2026" },
  { title: "Beauty Flash", text: "Diskon 20% khusus kategori Kecantikan selama 4 jam.", on: false, label: "Nonaktif", sub: "Belum dijadwalkan" },
];

export const VOUCHERS = [
  { code: "WELCOME25", note: "Minimal belanja Rp200.000 · Maksimal diskon Rp50.000", value: "25%", usage: "128 / 500 dipakai" },
  { code: "HEMAT30K", note: "Minimal belanja Rp300.000 · Semua pengguna", value: "Rp30.000", usage: "84 / 200 dipakai" },
];

export const CONTENT_CAMPAIGNS = {
  banner: { headline: "Hal baik, pilihan cantik.", name: "Banner utama", state: "Aktif · Beranda" },
  popup: { headline: "Special Payday 25% OFF", name: "Payday Poster", state: "Terjadwal · 30 Sep, 09.00" },
};
