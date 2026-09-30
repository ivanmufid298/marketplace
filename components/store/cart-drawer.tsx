"use client";

import { money, spritePosition } from "@/lib/format";
import { useStore } from "./store-provider";

export function CartDrawer() {
  const { panels, closePanel, cart, products, subtotal, cartCount, changeQty, removeFromCart, startCheckout } = useStore();
  return (
    <aside className={`drawer${panels.drawer ? " open" : ""}`} id="drawer" aria-hidden={!panels.drawer}>
      <div className="overlay" onClick={() => closePanel("drawer")} />
      <div className="panel">
        <div className="panel-top">
          <h2>Keranjang</h2>
          <button className="close" aria-label="Tutup" onClick={() => closePanel("drawer")}>×</button>
        </div>
        {!cart.length ? (
          <div className="cart-empty">Keranjangmu masih kosong.<br />Pilih sesuatu yang kamu suka.</div>
        ) : (
          <>
            {cart.map((line) => {
              const p = products.find((x) => x.id === line.id)!;
              return (
                <div className="cart-row" key={line.id}>
                  <div className="cart-thumb" style={{ backgroundPosition: spritePosition(p.pos) }} />
                  <div className="cart-meta">
                    <b>{p.name}</b>
                    <small>{p.shop}</small>
                    <div className="price">{money(p.price)}</div>
                    <div className="cart-qty">
                      <button aria-label={`Kurangi ${p.name}`} onClick={() => changeQty(p.id, -1)}>−</button>
                      <span>{line.qty}</span>
                      <button aria-label={`Tambah ${p.name}`} disabled={line.qty >= p.stock} onClick={() => changeQty(p.id, 1)}>+</button>
                    </div>
                  </div>
                  <button className="close" style={{ width: 32, height: 32, fontSize: 18 }} aria-label={`Hapus ${p.name}`} onClick={() => removeFromCart(p.id)}>×</button>
                </div>
              );
            })}
            <div className="summary-line"><span>Subtotal · {cartCount} barang</span><span>{money(subtotal)}</span></div>
            <div className="cart-total"><span>Total sementara</span><span>{money(subtotal)}</span></div>
            <button className="checkout" onClick={startCheckout}>Lanjut checkout</button>
          </>
        )}
      </div>
    </aside>
  );
}
