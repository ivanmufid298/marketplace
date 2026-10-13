// Run with `npm run test:ui`. What the shop sends to the database and what it makes of the answers. Who may do what,
// and the prices, fees, and stock, are decided by the database and covered by the SQL tests.
import { describe, expect, it, vi } from "vitest";
import { checkProof, createOrderRepository, type OrdersDb, type ProofStorage } from "./order-repository";
import { ProofPrepareError } from "./prepare-proof";
import { MAX_PROOF_BYTES, MAX_PROOF_SOURCE_BYTES, type PlaceOrderInput } from "./types";

type Answer = { data?: unknown; error?: { code?: string; message?: string; details?: string } | null };

function fakes(answers: { rpc?: Answer[]; select?: Answer[] } = {}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const selects: { table: string; ops: [string, unknown[]][] }[] = [];
  let rpcNext = 0, selectNext = 0;
  const db = {
    rpc: (name: string, args: Record<string, unknown>) => { rpcCalls.push({ name, args }); const a = answers.rpc?.[rpcNext++] ?? {}; return Promise.resolve({ data: a.data ?? null, error: a.error ?? null }); },
    from: (table: string) => {
      const call = { table, ops: [] as [string, unknown[]][] };
      selects.push(call);
      const chain: unknown = new Proxy({}, {
        get(_t, prop) {
          if (prop === "then") return (resolve: (v: unknown) => unknown) => { const a = answers.select?.[selectNext++] ?? {}; return Promise.resolve({ data: a.data ?? null, error: a.error ?? null }).then(resolve); };
          return (...args: unknown[]) => { call.ops.push([String(prop), args]); return chain; };
        },
      });
      return chain;
    },
  } as unknown as OrdersDb;
  const storage = { upload: vi.fn<ProofStorage["upload"]>(async () => {}), remove: vi.fn<ProofStorage["remove"]>(async () => {}), signedUrl: vi.fn<ProofStorage["signedUrl"]>(async (path) => `https://signed.test/${path}?t=1`) };
  const prepare = vi.fn(async (f: File) => f);
  const repo = createOrderRepository({ db, storage, photoFor: (key, alt) => ({ src: key, srcSet: key, alt, width: null, height: null }), newId: () => "uuid-1", now: () => Date.parse("2026-10-13T12:00:00Z"), prepare });
  return { repo, rpcCalls, selects, storage, prepare };
}

const file = (type = "image/png", size = 1000, name = "bukti.png") => new File([new Uint8Array(size)], name, { type });
const input = (over: Partial<PlaceOrderInput> = {}): PlaceOrderInput => ({
  items: [{ productId: 1, qty: 2, price: 189000 }, { productId: 3, qty: 1, price: 1 }], shippingCode: "express", recipient: "Ana", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", proof: file(), ...over,
});

describe("checkProof", () => {
  it("accepts a photo (JPG, PNG, WebP) up to 20 MB and a PDF up to 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(checkProof({ type, size: 1 })).toBeNull();
      expect(checkProof({ type, size: MAX_PROOF_SOURCE_BYTES })).toBeNull();
    }
    expect(checkProof({ type: "application/pdf", size: MAX_PROOF_BYTES })).toBeNull();
  });
  it("refuses another type, an empty file, a photo over 20 MB, and a PDF over 5 MB", () => {
    expect(checkProof({ type: "image/gif", size: 10 })).toBe("proofType");
    expect(checkProof({ type: "", size: 10 })).toBe("proofType");
    expect(checkProof({ type: "image/png", size: 0 })).toBe("proofSize");
    expect(checkProof({ type: "image/png", size: MAX_PROOF_SOURCE_BYTES + 1 })).toBe("proofSize");
    expect(checkProof({ type: "application/pdf", size: MAX_PROOF_BYTES + 1 })).toBe("proofSize");
  });
});

describe("listShippingMethods", () => {
  it("lists the methods in the shop's order, with the fee as the cost", async () => {
    const { repo, selects } = fakes({ select: [{ data: [{ code: "regular", label: "Reguler", note: "2–4 hari", fee: 18000 }] }] });
    expect(await repo.listShippingMethods()).toEqual({ ok: true, value: [{ value: "regular", label: "Reguler", note: "2–4 hari", cost: 18000 }] });
    expect(selects[0].table).toBe("shipping_methods");
    expect(selects[0].ops.filter(([o]) => o === "order").map(([, a]) => a)).toEqual([["sort_order", { ascending: true }], ["code", { ascending: true }]]);
  });
  it("is empty for no rows and reports a failed read", async () => {
    expect(await fakes({ select: [{ data: null }] }).repo.listShippingMethods()).toEqual({ ok: true, value: [] });
    expect(await fakes({ select: [{ error: { message: "Failed to fetch" } }] }).repo.listShippingMethods()).toEqual({ ok: false, error: { kind: "network" } });
  });
});

describe("placeOrder", () => {
  it("sends the items as ids and quantities only, with the address and shipping code, never a price", async () => {
    const { repo, rpcCalls } = fakes({ rpc: [{ data: { id: "o-1", number: "100002" } }, {}] });
    await repo.placeOrder(input());
    expect(rpcCalls[0]).toEqual({
      name: "place_order",
      args: { p_items: [{ product_id: 1, quantity: 2 }, { product_id: 3, quantity: 1 }], p_shipping_code: "express", p_recipient_name: "Ana", p_phone: "0811000111", p_address: "Jl. Mawar 1", p_city: "Jakarta", p_postcode: "12345" },
    });
    expect(JSON.stringify(rpcCalls[0].args)).not.toContain("189000");
  });
  it("then uploads the proof into the order's folder and records it", async () => {
    const { repo, rpcCalls, storage } = fakes({ rpc: [{ data: { id: "o-1", number: "100002" } }, {}] });
    const result = await repo.placeOrder(input({ proof: file("image/png", 1234) }));
    expect(result).toEqual({ ok: true, value: { number: "100002", id: "o-1", proofSent: true } });
    expect(storage.upload).toHaveBeenCalledWith("orders/o-1/uuid-1.png", expect.any(File), "image/png");
    expect(rpcCalls[1]).toEqual({ name: "submit_payment_proof", args: { p_order_id: "o-1", p_object_key: "orders/o-1/uuid-1.png", p_mime_type: "image/png", p_size_bytes: 1234 } });
  });
  it("names the file by its type: jpg, png, or pdf", async () => {
    for (const [type, ext] of [["image/jpeg", "jpg"], ["application/pdf", "pdf"]] as const) {
      const { repo, storage } = fakes({ rpc: [{ data: { id: "o-1", number: "1" } }, {}] });
      await repo.placeOrder(input({ proof: file(type) }));
      expect(storage.upload.mock.calls[0][0]).toBe(`orders/o-1/uuid-1.${ext}`);
    }
  });
  it("checks the proof before placing, so a bad file never takes stock", async () => {
    const { repo, rpcCalls } = fakes();
    expect(await repo.placeOrder(input({ proof: file("image/gif") }))).toEqual({ ok: false, error: { kind: "proofType" } });
    expect(await repo.placeOrder(input({ proof: file("application/pdf", MAX_PROOF_BYTES + 1) }))).toEqual({ ok: false, error: { kind: "proofSize" } });
    expect(rpcCalls).toHaveLength(0);
  });
  it("places an order with no proof and says the proof was not sent", async () => {
    const { repo, storage } = fakes({ rpc: [{ data: { id: "o-1", number: "100002" } }] });
    expect(await repo.placeOrder(input({ proof: null }))).toEqual({ ok: true, value: { number: "100002", id: "o-1", proofSent: false } });
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it("reports why the database refused, naming the product", async () => {
    const { repo, storage } = fakes({ rpc: [{ error: { code: "P0001", message: "out_of_stock", details: "3" } }] });
    expect(await repo.placeOrder(input())).toEqual({ ok: false, error: { kind: "outOfStock", productId: 3 } });
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it("treats an answer with no order as an unknown failure", async () => {
    expect(await fakes({ rpc: [{ data: null }] }).repo.placeOrder(input())).toEqual({ ok: false, error: { kind: "unknown" } });
    expect(await fakes({ rpc: [{ data: { id: "o-1" } }] }).repo.placeOrder(input())).toEqual({ ok: false, error: { kind: "unknown" } });
  });
  it("keeps the order when the upload fails, and says why the proof was not sent", async () => {
    const { repo, storage, rpcCalls } = fakes({ rpc: [{ data: { id: "o-1", number: "100002" } }] });
    storage.upload.mockRejectedValueOnce(new Error("Failed to fetch"));
    expect(await repo.placeOrder(input())).toEqual({ ok: true, value: { number: "100002", id: "o-1", proofSent: false, proofError: { kind: "network" } } });
    expect(rpcCalls.map((c) => c.name)).toEqual(["place_order"]);
  });
  it("keeps the order when the proof is refused, and removes the file that was uploaded", async () => {
    const { repo, storage } = fakes({ rpc: [{ data: { id: "o-1", number: "100002" } }, { error: { code: "P0001", message: "not_payable" } }] });
    const result = await repo.placeOrder(input());
    expect(result).toEqual({ ok: true, value: { number: "100002", id: "o-1", proofSent: false, proofError: { kind: "notPayable" } } });
    expect(storage.remove).toHaveBeenCalledWith("orders/o-1/uuid-1.png");
  });
});

describe("sendProof", () => {
  it("uploads, records, and reports success", async () => {
    const { repo, storage, rpcCalls } = fakes({ rpc: [{}] });
    expect(await repo.sendProof("o-9", file("application/pdf", 50, "x.pdf"))).toEqual({ ok: true, value: null });
    expect(storage.upload).toHaveBeenCalledWith("orders/o-9/uuid-1.pdf", expect.any(File), "application/pdf");
    expect(rpcCalls[0].args).toMatchObject({ p_order_id: "o-9", p_mime_type: "application/pdf", p_size_bytes: 50 });
  });
  it("refuses a bad file without touching storage", async () => {
    const { repo, storage } = fakes();
    expect(await repo.sendProof("o-9", file("text/html"))).toEqual({ ok: false, error: { kind: "proofType" } });
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it("reports a failed upload and does not record a proof", async () => {
    const { repo, storage, rpcCalls } = fakes();
    storage.upload.mockRejectedValueOnce(new Error("new row violates row-level security policy"));
    expect(await repo.sendProof("o-9", file())).toEqual({ ok: false, error: { kind: "forbidden" } });
    expect(rpcCalls).toHaveLength(0);
  });
  it("removes the uploaded file when the database refuses the record, even if the removal itself fails", async () => {
    const { repo, storage } = fakes({ rpc: [{ error: { code: "P0001", message: "invalid_proof" } }] });
    storage.remove.mockRejectedValueOnce(new Error("offline"));
    expect(await repo.sendProof("o-9", file())).toEqual({ ok: false, error: { kind: "invalidProof" } });
    expect(storage.remove).toHaveBeenCalledWith("orders/o-9/uuid-1.png");
  });
});

describe("listMyOrders", () => {
  const row = { id: "o-1", number: "100002", recipient_name: "Ana", phone: "1", address: "x", city: "y", postcode: "1", shipping_label: "Reguler", shipping_fee: 18000, payment_status: "under_review", expires_at: "2026-10-13T13:00:00Z", received_at: null, cancel_note: null, refund_status: null, created_at: "2026-10-13T11:00:00Z", order_items: [] };
  it("reads the buyer's orders, newest first, as shop orders", async () => {
    const { repo, selects } = fakes({ select: [{ data: [row] }] });
    const result = await repo.listMyOrders("buyer-1");
    expect(result.ok && result.value[0]).toMatchObject({ id: "o-1", number: "100002", buyerId: "buyer-1", payment: "pending" });
    expect(selects[0].table).toBe("orders");
    expect(selects[0].ops.filter(([o]) => o === "order").map(([, a]) => a)).toEqual([["created_at", { ascending: false }], ["number", { ascending: false }]]);
  });
  it("counts an unpaid order past its deadline as expired by the repository's clock", async () => {
    const { repo } = fakes({ select: [{ data: [{ ...row, payment_status: "awaiting_payment", expires_at: "2026-10-13T11:59:00Z" }] }] });
    const result = await repo.listMyOrders("buyer-1");
    expect(result.ok && result.value[0].expired).toBe(true);
  });
  it("is empty for no rows and reports a failed read", async () => {
    expect(await fakes({ select: [{ data: null }] }).repo.listMyOrders("b")).toEqual({ ok: true, value: [] });
    expect(await fakes({ select: [{ error: { message: "Failed to fetch" } }] }).repo.listMyOrders("b")).toEqual({ ok: false, error: { kind: "network" } });
  });
});

describe("order actions", () => {
  const cases: [string, (repo: ReturnType<typeof fakes>["repo"]) => Promise<unknown>, string, Record<string, unknown>][] = [
    ["confirm receipt", (r) => r.confirmReceived("o-1"), "confirm_received", { p_order_id: "o-1" }],
    ["accept a payment", (r) => r.acceptPayment("o-1"), "accept_payment", { p_order_id: "o-1" }],
    ["reject a payment", (r) => r.rejectPayment("o-1", "Nominal salah"), "reject_payment", { p_order_id: "o-1", p_reason: "Nominal salah" }],
    ["cancel an order", (r) => r.cancelOrder("o-1", "Barang rusak"), "cancel_order", { p_order_id: "o-1", p_note: "Barang rusak" }],
    ["mark a refund", (r) => r.markRefunded("o-1"), "mark_refunded", { p_order_id: "o-1" }],
  ];
  for (const [name, run, fn, args] of cases) {
    it(`can ${name}: calls ${fn} with the order's id and reports success`, async () => {
      const { repo, rpcCalls } = fakes({ rpc: [{}] });
      expect(await run(repo)).toEqual({ ok: true, value: null });
      expect(rpcCalls).toEqual([{ name: fn, args }]);
    });
    it(`reports why ${fn} was refused`, async () => {
      const { repo } = fakes({ rpc: [{ error: { code: "P0001", message: "not_reviewable" } }] });
      expect(await run(repo)).toEqual({ ok: false, error: { kind: "notReviewable" } });
    });
  }
  it("reports a lost connection", async () => {
    const { repo } = fakes({ rpc: [{ error: { message: "Failed to fetch" } }] });
    expect(await repo.acceptPayment("o-1")).toEqual({ ok: false, error: { kind: "network" } });
  });
  it("tells an admin who is not one: forbidden", async () => {
    const { repo } = fakes({ rpc: [{ error: { code: "P0001", message: "forbidden" } }] });
    expect(await repo.cancelOrder("o-1", "x")).toEqual({ ok: false, error: { kind: "forbidden" } });
  });
});

describe("proofLink", () => {
  it("asks storage for a link that works for a minute", async () => {
    const { repo, storage } = fakes();
    expect(await repo.proofLink("orders/o-1/a.png")).toEqual({ ok: true, value: "https://signed.test/orders/o-1/a.png?t=1" });
    expect(storage.signedUrl).toHaveBeenCalledWith("orders/o-1/a.png", 60);
  });
  it("reports why no link could be made", async () => {
    const { repo, storage } = fakes();
    storage.signedUrl.mockRejectedValueOnce(new Error("Failed to fetch"));
    expect(await repo.proofLink("orders/o-1/a.png")).toEqual({ ok: false, error: { kind: "network" } });
    storage.signedUrl.mockRejectedValueOnce(new Error("new row violates row-level security policy"));
    expect(await repo.proofLink("orders/o-1/a.png")).toEqual({ ok: false, error: { kind: "forbidden" } });
  });
});

describe("listAllOrders", () => {
  const row = { id: "o-1", number: "100002", buyer_id: "buyer-9", recipient_name: "Ana", phone: "1", address: "x", city: "y", postcode: "1", shipping_label: "Reguler", shipping_fee: 18000, payment_status: "under_review", expires_at: "2026-10-13T13:00:00Z", received_at: null, cancel_note: null, refund_status: null, created_at: "2026-10-13T11:00:00Z", order_items: [], order_status_history: [{ event: "created", actor_name: "Ana", note: null, created_at: "2026-10-13T11:00:00Z" }], payment_proofs: [{ object_key: "orders/o-1/a.png", mime_type: "image/png", size_bytes: 10, created_at: "2026-10-13T11:05:00Z" }] };
  it("reads every order with its history and proofs, newest first, owned by the buyer it names", async () => {
    const { repo, selects } = fakes({ select: [{ data: [row] }] });
    const result = await repo.listAllOrders();
    expect(result.ok && result.value[0]).toMatchObject({ id: "o-1", buyerId: "buyer-9", history: [{ event: "created" }], proofs: [{ objectKey: "orders/o-1/a.png" }] });
    expect(selects[0].table).toBe("orders");
    const select = String(selects[0].ops.find(([o]) => o === "select")![1][0]);
    expect(select).toContain("order_status_history(");
    expect(select).toContain("payment_proofs(");
    expect(select).toContain("buyer_id");
    expect(selects[0].ops.filter(([o]) => o === "order").map(([, a]) => a)).toEqual([["created_at", { ascending: false }], ["number", { ascending: false }]]);
  });
  it("is empty for no rows and reports a failed read", async () => {
    expect(await fakes({ select: [{ data: null }] }).repo.listAllOrders()).toEqual({ ok: true, value: [] });
    expect(await fakes({ select: [{ error: { message: "Failed to fetch" } }] }).repo.listAllOrders()).toEqual({ ok: false, error: { kind: "network" } });
  });
  it("leaves the buyer id empty when the row has none (the account was deleted)", async () => {
    const result = await fakes({ select: [{ data: [{ ...row, buyer_id: null }] }] }).repo.listAllOrders();
    expect(result.ok && result.value[0].buyerId).toBe("");
  });
});

describe("shrinking the proof", () => {
  const webp = () => new File([new Uint8Array(300)], "bukti.webp", { type: "image/webp" });

  it("uploads the shrunk file, with its own type and size, not the original", async () => {
    const { repo, prepare, storage, rpcCalls } = fakes({ rpc: [{ data: { id: "o-1", number: "1" } }, {}] });
    prepare.mockResolvedValueOnce(webp());
    await repo.placeOrder(input({ proof: file("image/png", 5_000_000) }));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(storage.upload).toHaveBeenCalledWith("orders/o-1/uuid-1.webp", expect.any(File), "image/webp");
    expect(rpcCalls[1].args).toMatchObject({ p_object_key: "orders/o-1/uuid-1.webp", p_mime_type: "image/webp", p_size_bytes: 300 });
  });
  it("shrinks the file before the order is placed, so a photo that cannot be read never takes stock", async () => {
    const { repo, prepare, rpcCalls } = fakes();
    prepare.mockRejectedValueOnce(new ProofPrepareError("proofUnreadable"));
    expect(await repo.placeOrder(input())).toEqual({ ok: false, error: { kind: "proofUnreadable" } });
    expect(rpcCalls).toHaveLength(0);
  });
  it("reports the reason the file could not be prepared", async () => {
    for (const reason of ["proofType", "proofSize", "proofUnreadable"] as const) {
      const { repo, prepare } = fakes();
      prepare.mockRejectedValueOnce(new ProofPrepareError(reason));
      expect(await repo.sendProof("o-9", file())).toEqual({ ok: false, error: { kind: reason } });
    }
  });
  it("treats any other failure while preparing as an unreadable file", async () => {
    const { repo, prepare } = fakes();
    prepare.mockRejectedValueOnce(new Error("canvas exploded"));
    expect(await repo.sendProof("o-9", file())).toEqual({ ok: false, error: { kind: "proofUnreadable" } });
  });
  it("refuses a prepared file that is still over the stored limit (a big file that could not be shrunk)", async () => {
    const { repo, prepare, storage } = fakes();
    prepare.mockResolvedValueOnce(file("image/png", MAX_PROOF_BYTES + 1));
    expect(await repo.sendProof("o-9", file("image/png", MAX_PROOF_BYTES + 1))).toEqual({ ok: false, error: { kind: "proofSize" } });
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it("refuses a prepared file that is empty or of a type that is not allowed", async () => {
    const { repo, prepare } = fakes();
    prepare.mockResolvedValueOnce(new File([], "x.webp", { type: "image/webp" }));
    expect(await repo.sendProof("o-9", file())).toEqual({ ok: false, error: { kind: "proofSize" } });
    prepare.mockResolvedValueOnce(new File([new Uint8Array(5)], "x.gif", { type: "image/gif" }));
    expect(await repo.sendProof("o-9", file())).toEqual({ ok: false, error: { kind: "proofType" } });
  });
  it("sends a PDF as it is when nothing shrinks it", async () => {
    const { repo, storage } = fakes({ rpc: [{}] });
    await repo.sendProof("o-9", file("application/pdf", 50, "x.pdf"));
    expect(storage.upload).toHaveBeenCalledWith("orders/o-9/uuid-1.pdf", expect.any(File), "application/pdf");
  });
});
