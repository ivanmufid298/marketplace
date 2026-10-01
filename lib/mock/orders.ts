// Placeholder orders shared by the storefront ("Pesanan saya") and the admin (Pesanan, Pembayaran).
// Replaced by database queries once the backend exists. UI copy lives in content/id.json.

export type PaymentState = "pending" | "success" | "failed";

export type OrderItem = { productId: number; qty: number; price: number };

export type HistoryEvent = "created" | "payment_accepted" | "payment_rejected" | "received" | "cancelled" | "refunded";

export type HistoryEntry = { at: string; event: HistoryEvent; actor: string; note?: string };

export type Order = {
  number: string;
  buyerId: string;
  buyer: string;
  phone: string;
  address: string;
  date: string;
  items: OrderItem[];
  shippingMethod: string;
  shippingFee: number;
  payment: PaymentState;
  /** Set when the buyer taps "Pesanan selesai". */
  received: boolean;
  /** Present when the order was cancelled; holds the admin's reason. */
  cancelNote?: string;
  /** Only for cancelled orders that had been paid. */
  refund?: "pending" | "done";
  history: HistoryEntry[];
};

/** The buyer behind the seeded orders. Signing in to the demo login as nadia@anything shows these orders. */
const DEMO_BUYER = { id: "nadia", name: "Nadia Putri", phone: "0811-5550-0312", address: "Jl. Cempaka No. 21, Jakarta Selatan 12140" };

const ADMIN = "Admin";

export const seedOrders: Order[] = [
  {
    number: "837325", buyerId: "aulia", buyer: "Aulia Rahma", phone: "0812-5550-0125", address: "Jl. Kenanga No. 12, Bandung 40123", date: "30 Sep 2026",
    items: [{ productId: 5, qty: 1, price: 459000 }, { productId: 2, qty: 1, price: 129000 }], shippingMethod: "Reguler", shippingFee: 18000,
    payment: "success", received: false,
    history: [
      { at: "30 Sep 2026, 09.12", event: "created", actor: "Aulia Rahma" },
      { at: "30 Sep 2026, 09.40", event: "payment_accepted", actor: ADMIN },
    ],
  },
  {
    number: "837320", buyerId: "bima", buyer: "Bima Akbar", phone: "0813-5550-0320", address: "Jl. Melati Raya No. 8, Surabaya 60111", date: "29 Sep 2026",
    items: [{ productId: 1, qty: 1, price: 89000 }, { productId: 6, qty: 2, price: 279000 }], shippingMethod: "Reguler", shippingFee: 18000,
    payment: "success", received: false,
    history: [
      { at: "29 Sep 2026, 13.20", event: "created", actor: "Bima Akbar" },
      { at: "29 Sep 2026, 13.55", event: "payment_accepted", actor: ADMIN },
    ],
  },
  {
    number: "837315", buyerId: "dinda", buyer: "Dinda Ayu", phone: "0822-5550-0288", address: "Jl. Dahlia No. 3, Malang 65145", date: "30 Sep 2026",
    items: [{ productId: 3, qty: 1, price: 649000 }], shippingMethod: "Express", shippingFee: 32000,
    payment: "pending", received: false,
    history: [{ at: "30 Sep 2026, 12.18", event: "created", actor: "Dinda Ayu" }],
  },
  {
    number: "837312", buyerId: "nadia", buyer: "Nadia Putri", phone: DEMO_BUYER.phone, address: DEMO_BUYER.address, date: "30 Sep 2026",
    items: [{ productId: 1, qty: 2, price: 89000 }], shippingMethod: "Reguler", shippingFee: 18000,
    payment: "pending", received: false,
    history: [{ at: "30 Sep 2026, 14.05", event: "created", actor: "Nadia Putri" }],
  },
  {
    number: "837301", buyerId: "nadia", buyer: "Nadia Putri", phone: DEMO_BUYER.phone, address: DEMO_BUYER.address, date: "29 Sep 2026",
    items: [{ productId: 3, qty: 1, price: 649000 }], shippingMethod: "Express", shippingFee: 32000,
    payment: "pending", received: false,
    history: [{ at: "29 Sep 2026, 18.02", event: "created", actor: "Nadia Putri" }],
  },
  {
    number: "837288", buyerId: "nadia", buyer: "Nadia Putri", phone: DEMO_BUYER.phone, address: DEMO_BUYER.address, date: "27 Sep 2026",
    items: [{ productId: 4, qty: 1, price: 329000 }, { productId: 6, qty: 1, price: 279000 }], shippingMethod: "Reguler", shippingFee: 18000,
    payment: "success", received: false,
    history: [
      { at: "27 Sep 2026, 10.15", event: "created", actor: "Nadia Putri" },
      { at: "27 Sep 2026, 10.50", event: "payment_accepted", actor: ADMIN },
    ],
  },
  {
    number: "837270", buyerId: "nadia", buyer: "Nadia Putri", phone: DEMO_BUYER.phone, address: DEMO_BUYER.address, date: "22 Sep 2026",
    items: [{ productId: 2, qty: 1, price: 129000 }, { productId: 5, qty: 1, price: 459000 }], shippingMethod: "Reguler", shippingFee: 18000,
    payment: "success", received: true,
    history: [
      { at: "22 Sep 2026, 10.30", event: "created", actor: "Nadia Putri" },
      { at: "22 Sep 2026, 11.00", event: "payment_accepted", actor: ADMIN },
      { at: "25 Sep 2026, 14.30", event: "received", actor: "Nadia Putri" },
    ],
  },
  {
    number: "837240", buyerId: "nadia", buyer: "Nadia Putri", phone: DEMO_BUYER.phone, address: DEMO_BUYER.address, date: "15 Sep 2026",
    items: [{ productId: 6, qty: 1, price: 279000 }], shippingMethod: "Reguler", shippingFee: 18000,
    payment: "success", received: true,
    history: [
      { at: "15 Sep 2026, 11.40", event: "created", actor: "Nadia Putri" },
      { at: "15 Sep 2026, 12.00", event: "payment_accepted", actor: ADMIN },
      { at: "19 Sep 2026, 16.00", event: "received", actor: "Nadia Putri" },
    ],
  },
  {
    number: "837199", buyerId: "maya", buyer: "Maya Sari", phone: "0878-5550-0199", address: "Jl. Flamboyan No. 17, Semarang 50134", date: "9 Sep 2026",
    items: [{ productId: 1, qty: 1, price: 89000 }], shippingMethod: "Reguler", shippingFee: 18000,
    payment: "success", received: false, refund: "pending",
    cancelNote: "Barang rusak saat pemeriksaan, pembeli setuju dana dikembalikan.",
    history: [
      { at: "9 Sep 2026, 13.40", event: "created", actor: "Maya Sari" },
      { at: "9 Sep 2026, 14.00", event: "payment_accepted", actor: ADMIN },
      { at: "10 Sep 2026, 09.30", event: "cancelled", actor: ADMIN, note: "Barang rusak saat pemeriksaan, pembeli setuju dana dikembalikan." },
    ],
  },
];

/** A review is one per order item, keyed `${order.number}:${productId}`. */
export type MyReview = { rating: number; text: string };

export const INITIAL_MY_REVIEWS: Record<string, MyReview> = {
  "837240:6": { rating: 5, text: "Teksturnya ringan dan kulit terasa lembap seharian. Packing rapi, pengiriman cepat." },
};
