export type PaymentStatus = "pending" | "success" | "failed";
export type Payment = { id: string; name: string; total: string; time: string; status: PaymentStatus };

export const PAYMENT_STATUS_TEXT: Record<PaymentStatus, string> = {
  pending: "Menunggu",
  success: "Diterima",
  failed: "Ditolak",
};

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

export const adminProducts = [
  { name: "Mug Blush Daily", cat: "Rumah", price: "89.000", stock: "24" },
  { name: "Tote Canvas Everyday", cat: "Fashion", price: "129.000", stock: "18" },
  { name: "Headphone Merlot", cat: "Elektronik", price: "649.000", stock: "9" },
  { name: "Lampu Meja Lumi", cat: "Rumah", price: "329.000", stock: "12" },
  { name: "Sneakers Rosé", cat: "Fashion", price: "459.000", stock: "16" },
  { name: "Dewy Skin Set", cat: "Kecantikan", price: "279.000", stock: "21" },
];

export const CHART_DATA = {
  month: {
    sub: "Januari–Juni 2026",
    points: "0,205 120,166 240,182 360,112 480,130 600,72",
    area: "M0 205 L120 166 L240 182 L360 112 L480 130 L600 72 L600 240 L0 240 Z",
    labels: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun"],
    dots: [[0, 205], [120, 166], [240, 182], [360, 112], [480, 130], [600, 72]],
  },
  year: {
    sub: "2021–2026",
    points: "0,210 120,185 240,150 360,125 480,92 600,50",
    area: "M0 210 L120 185 L240 150 L360 125 L480 92 L600 50 L600 240 L0 240 Z",
    labels: ["2021", "2022", "2023", "2024", "2025", "2026"],
    dots: [[0, 210], [120, 185], [240, 150], [360, 125], [480, 92], [600, 50]],
  },
} as const;

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
