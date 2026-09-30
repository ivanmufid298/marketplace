"use client";

import { useAdmin } from "@/components/admin/admin-provider";
import { SectionTop } from "@/components/admin/ui";
import { VOUCHERS } from "@/lib/admin-data";

export default function VouchersPage() {
  const { openModal } = useAdmin();
  return (
    <section className="view active">
      <SectionTop title="Voucher" text="Kelola kode promo dan batas pemakaiannya.">
        <button className="btn btn-primary" onClick={() => openModal("voucher")}>＋ Tambah voucher</button>
      </SectionTop>
      <div>
        {VOUCHERS.map((v) => (
          <article className="voucher" key={v.code}>
            <div className="voucher-main">
              <span className="voucher-code">{v.code}</span>
              <p className="sub">{v.note}</p>
              <span className="status success">Aktif</span>
            </div>
            <div className="voucher-side">
              <strong>{v.value}</strong>
              <span className="sub">{v.usage}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
