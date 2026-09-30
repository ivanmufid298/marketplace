// Placeholder admin orders. Replaced by database queries once the backend exists.
// Status vocabulary follows PRD section 12; UI copy lives in content/id.json.

export type OrderPaymentStatus = "awaiting_payment" | "under_review" | "paid" | "rejected" | "expired" | "refund_pending" | "refunded";

export type ReadyStatus = "unfulfilled" | "processing" | "packed" | "shipped" | "delivered" | "cancelled";
export type PoStatus =
  | "unfulfilled"
  | "ordered_abroad"
  | "shipped_to_indonesia"
  | "arrived_at_warehouse"
  | "packed"
  | "shipped_to_buyer"
  | "delivered"
  | "cancelled";
export type FulfillmentStatus = ReadyStatus | PoStatus;
export type FulfillmentKind = "ready" | "po";

export type OrderLine = { name: string; qty: number; price: number };

/** Items shipped together. A ready-stock group ships without waiting for PO items. */
export type FulfillmentGroup = {
  id: string;
  kind: FulfillmentKind;
  /** Estimated arrival, PO groups only. */
  eta?: string;
  shippingMethod: string;
  shippingFee: number;
  status: FulfillmentStatus;
  items: OrderLine[];
};

export type HistoryEntry = {
  at: string;
  /** Which status changed: payment, one fulfillment group, or the order as a whole. */
  scope: "payment" | "fulfillment" | "order";
  from?: string;
  to: string;
  actor: string;
  note?: string;
  /** Group label for fulfillment entries. */
  group?: string;
};

export type AdminOrder = {
  number: string;
  date: string;
  buyer: string;
  phone: string;
  address: string;
  paymentStatus: OrderPaymentStatus;
  groups: FulfillmentGroup[];
  cancelNote?: string;
  history: HistoryEntry[];
};

export const initialOrders: AdminOrder[] = [
  {
    number: "837325", date: "30 Sep 2026", buyer: "Aulia Rahma", phone: "0812-5550-0125", address: "Jl. Kenanga No. 12, Bandung 40123",
    paymentStatus: "paid",
    groups: [
      { id: "g1", kind: "po", eta: "20 Okt 2026", shippingMethod: "Reguler", shippingFee: 18000, status: "ordered_abroad", items: [{ name: "Sneakers Rosé", qty: 1, price: 459000 }, { name: "Tote Canvas Everyday", qty: 1, price: 129000 }] },
    ],
    history: [
      { at: "30 Sep 2026, 09.12", scope: "payment", from: "awaiting_payment", to: "under_review", actor: "Aulia Rahma" },
      { at: "30 Sep 2026, 09.40", scope: "payment", from: "under_review", to: "paid", actor: "Admin" },
      { at: "30 Sep 2026, 11.05", scope: "fulfillment", group: "Pre-order", from: "unfulfilled", to: "ordered_abroad", actor: "Admin", note: "Dipesan ke supplier batch Oktober" },
    ],
  },
  {
    number: "837320", date: "29 Sep 2026", buyer: "Bima Akbar", phone: "0813-5550-0320", address: "Jl. Melati Raya No. 8, Surabaya 60111",
    paymentStatus: "paid",
    groups: [
      { id: "g1", kind: "ready", shippingMethod: "Reguler", shippingFee: 18000, status: "shipped", items: [{ name: "Mug Blush Daily", qty: 1, price: 89000 }] },
      { id: "g2", kind: "po", eta: "15 Okt 2026", shippingMethod: "Reguler", shippingFee: 18000, status: "ordered_abroad", items: [{ name: "Dewy Skin Set", qty: 2, price: 279000 }] },
    ],
    history: [
      { at: "29 Sep 2026, 13.20", scope: "payment", from: "awaiting_payment", to: "under_review", actor: "Bima Akbar" },
      { at: "29 Sep 2026, 13.55", scope: "payment", from: "under_review", to: "paid", actor: "Admin" },
      { at: "29 Sep 2026, 15.10", scope: "fulfillment", group: "Ready stock", from: "unfulfilled", to: "processing", actor: "Admin" },
      { at: "29 Sep 2026, 16.30", scope: "fulfillment", group: "Ready stock", from: "processing", to: "packed", actor: "Admin" },
      { at: "30 Sep 2026, 08.45", scope: "fulfillment", group: "Ready stock", from: "packed", to: "shipped", actor: "Admin", note: "Resi JNE 0098765432" },
      { at: "29 Sep 2026, 15.20", scope: "fulfillment", group: "Pre-order", from: "unfulfilled", to: "ordered_abroad", actor: "Admin" },
    ],
  },
  {
    number: "837312", date: "30 Sep 2026", buyer: "Nadia Putri", phone: "0811-5550-0312", address: "Jl. Cempaka No. 21, Jakarta Selatan 12140",
    paymentStatus: "awaiting_payment",
    groups: [
      { id: "g1", kind: "ready", shippingMethod: "Reguler", shippingFee: 18000, status: "unfulfilled", items: [{ name: "Mug Blush Daily", qty: 2, price: 89000 }] },
    ],
    history: [],
  },
  {
    number: "837301", date: "29 Sep 2026", buyer: "Raka Pratama", phone: "0856-5550-0301", address: "Jl. Anggrek No. 5, Yogyakarta 55281",
    paymentStatus: "under_review",
    groups: [
      { id: "g1", kind: "ready", shippingMethod: "Express", shippingFee: 32000, status: "unfulfilled", items: [{ name: "Headphone Merlot", qty: 1, price: 649000 }] },
    ],
    history: [{ at: "29 Sep 2026, 18.02", scope: "payment", from: "awaiting_payment", to: "under_review", actor: "Raka Pratama" }],
  },
  {
    number: "837288", date: "27 Sep 2026", buyer: "Dinda Ayu", phone: "0822-5550-0288", address: "Jl. Dahlia No. 3, Malang 65145",
    paymentStatus: "paid",
    groups: [
      { id: "g1", kind: "ready", shippingMethod: "Reguler", shippingFee: 18000, status: "processing", items: [{ name: "Lampu Meja Lumi", qty: 1, price: 329000 }, { name: "Dewy Skin Set", qty: 1, price: 279000 }] },
    ],
    history: [
      { at: "27 Sep 2026, 10.15", scope: "payment", from: "awaiting_payment", to: "under_review", actor: "Dinda Ayu" },
      { at: "27 Sep 2026, 10.50", scope: "payment", from: "under_review", to: "paid", actor: "Admin" },
      { at: "28 Sep 2026, 09.00", scope: "fulfillment", group: "Ready stock", from: "unfulfilled", to: "processing", actor: "Admin" },
    ],
  },
  {
    number: "837270", date: "22 Sep 2026", buyer: "Nadia Putri", phone: "0811-5550-0312", address: "Jl. Cempaka No. 21, Jakarta Selatan 12140",
    paymentStatus: "paid",
    groups: [
      { id: "g1", kind: "ready", shippingMethod: "Reguler", shippingFee: 18000, status: "delivered", items: [{ name: "Tote Canvas Everyday", qty: 1, price: 129000 }, { name: "Sneakers Rosé", qty: 1, price: 459000 }] },
    ],
    history: [
      { at: "22 Sep 2026, 11.00", scope: "payment", from: "under_review", to: "paid", actor: "Admin" },
      { at: "23 Sep 2026, 10.00", scope: "fulfillment", group: "Ready stock", from: "packed", to: "shipped", actor: "Admin", note: "Resi JNE 0011223344" },
      { at: "25 Sep 2026, 14.30", scope: "fulfillment", group: "Ready stock", from: "shipped", to: "delivered", actor: "Admin" },
    ],
  },
  {
    number: "837240", date: "15 Sep 2026", buyer: "Dinda Ayu", phone: "0822-5550-0288", address: "Jl. Dahlia No. 3, Malang 65145",
    paymentStatus: "paid",
    groups: [
      { id: "g1", kind: "ready", shippingMethod: "Reguler", shippingFee: 18000, status: "delivered", items: [{ name: "Dewy Skin Set", qty: 1, price: 279000 }] },
    ],
    history: [
      { at: "15 Sep 2026, 12.00", scope: "payment", from: "under_review", to: "paid", actor: "Admin" },
      { at: "19 Sep 2026, 16.00", scope: "fulfillment", group: "Ready stock", from: "shipped", to: "delivered", actor: "Admin" },
    ],
  },
  {
    number: "837199", date: "9 Sep 2026", buyer: "Maya Sari", phone: "0878-5550-0199", address: "Jl. Flamboyan No. 17, Semarang 50134",
    paymentStatus: "refund_pending",
    cancelNote: "Barang rusak saat pemeriksaan, pembeli setuju dana dikembalikan.",
    groups: [
      { id: "g1", kind: "ready", shippingMethod: "Reguler", shippingFee: 18000, status: "cancelled", items: [{ name: "Mug Blush Daily", qty: 1, price: 89000 }] },
    ],
    history: [
      { at: "9 Sep 2026, 14.00", scope: "payment", from: "under_review", to: "paid", actor: "Admin" },
      { at: "10 Sep 2026, 09.30", scope: "order", from: "processing", to: "cancelled", actor: "Admin", note: "Barang rusak saat pemeriksaan, pembeli setuju dana dikembalikan." },
      { at: "10 Sep 2026, 09.30", scope: "payment", from: "paid", to: "refund_pending", actor: "Admin" },
    ],
  },
];
