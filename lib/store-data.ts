export type Category = "Rumah" | "Fashion" | "Elektronik" | "Kecantikan";

export type Product = {
  id: number;
  name: string;
  shop: string;
  cat: Category;
  price: number;
  oldPrice?: number;
  stock: number;
  rating: string;
  pos: number;
  tag: string;
  promo?: string;
  desc: string;
};

export const CATEGORIES: Category[] = ["Rumah", "Fashion", "Elektronik", "Kecantikan"];

export const products: Product[] = [
  { id: 1, name: "Mug Blush Daily", shop: "Studio Pagi", cat: "Rumah", price: 89000, oldPrice: 119000, stock: 2, rating: "4.9 · 128 terjual", pos: 0, tag: "Best seller", promo: "25% OFF", desc: "Mug keramik berlapis glasir dengan warna blush lembut. Nyaman digenggam dan cocok untuk kopi atau teh setiap hari." },
  { id: 2, name: "Tote Canvas Everyday", shop: "Ruang Karya", cat: "Fashion", price: 129000, oldPrice: 169000, stock: 1, rating: "4.8 · 96 terjual", pos: 1, tag: "Lokal", promo: "24% OFF", desc: "Tas kanvas tebal berwarna ivory dengan ruang lega untuk aktivitas harian. Ringan, kokoh, dan mudah dipadukan." },
  { id: 3, name: "Headphone Merlot", shop: "Audio Room", cat: "Elektronik", price: 649000, stock: 8, rating: "4.9 · 211 terjual", pos: 2, tag: "Favorit", desc: "Headphone nirkabel dengan bantalan empuk, suara hangat, dan daya tahan baterai sepanjang hari." },
  { id: 4, name: "Lampu Meja Lumi", shop: "Rumah Senja", cat: "Rumah", price: 329000, stock: 6, rating: "4.7 · 74 terjual", pos: 3, tag: "Baru", desc: "Lampu meja dengan cahaya hangat dan siluet lembut untuk meja kerja, sudut baca, atau nakas." },
  { id: 5, name: "Sneakers Rosé", shop: "Sunday Steps", cat: "Fashion", price: 459000, oldPrice: 599000, stock: 3, rating: "4.8 · 143 terjual", pos: 4, tag: "Limited", promo: "23% OFF", desc: "Sneakers kasual bernuansa dusty pink dengan sol ringan dan empuk untuk menemani hari yang aktif." },
  { id: 6, name: "Dewy Skin Set", shop: "Petal Beauty", cat: "Kecantikan", price: 279000, stock: 12, rating: "4.9 · 188 terjual", pos: 5, tag: "Bundle", desc: "Set perawatan kulit harian dengan tekstur ringan untuk membantu menjaga kelembapan dan tampilan segar." },
];

export const SHIPPING_OPTIONS = [
  { value: "regular", label: "Reguler", note: "Estimasi tiba 2–4 hari", cost: 18000 },
  { value: "express", label: "Express", note: "Estimasi tiba 1–2 hari", cost: 32000 },
  { value: "same-day", label: "Same day", note: "Tiba hari ini sebelum pukul 22.00", cost: 48000 },
] as const;

export const SORT_OPTIONS = [
  { value: "popular", label: "Terpopuler" },
  { value: "low", label: "Harga terendah" },
  { value: "high", label: "Harga tertinggi" },
] as const;

export type SortMode = (typeof SORT_OPTIONS)[number]["value"];
export type ShippingValue = (typeof SHIPPING_OPTIONS)[number]["value"];
