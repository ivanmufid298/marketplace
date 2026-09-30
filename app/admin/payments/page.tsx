"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { PaymentRow } from "@/components/admin/payment-rows";
import { SectionTop, Select } from "@/components/admin/ui";

const FILTERS = [
  { value: "all", label: "Semua status" },
  { value: "pending", label: "Menunggu" },
  { value: "success", label: "Diterima" },
  { value: "failed", label: "Ditolak" },
];

export default function PaymentsPage() {
  const { payments } = useAdmin();
  const [filter, setFilter] = useState("all");
  return (
    <section className="view active">
      <SectionTop title="Verifikasi pembayaran" text="Tinjau bukti transfer dan perbarui status pesanan.">
        <div className="filters"><Select options={FILTERS} value={filter} onChange={setFilter} /></div>
      </SectionTop>
      <div className="table-card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Pelanggan</th><th>Transfer</th><th>Bukti</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>{payments.filter((p) => filter === "all" || p.status === filter).map((p) => <PaymentRow key={p.id} payment={p} />)}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
