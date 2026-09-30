"use client";

import type { Payment } from "@/lib/admin-data";
import { useAdmin } from "./admin-provider";
import { StatusBadge } from "./ui";

export function PaymentRow({ payment: p, compact = false }: { payment: Payment; compact?: boolean }) {
  const { setPaymentStatus, showToast } = useAdmin();
  return (
    <tr>
      <td><strong>#{p.id}</strong><span className="sub">Transfer manual</span></td>
      <td>{p.name}</td>
      <td><strong>{p.total}</strong></td>
      {compact ? (
        <td>{p.time}</td>
      ) : (
        <td><button className="btn btn-line btn-sm" onClick={() => showToast("Preview bukti transfer dibuka")}>Lihat bukti</button></td>
      )}
      <td><StatusBadge status={p.status} /></td>
      <td>
        <div className="row-actions">
          {p.status === "pending" ? (
            <>
              <button className="btn btn-soft btn-sm" onClick={() => setPaymentStatus(p.id, "success")}>Terima</button>
              <button className="btn btn-line btn-sm" onClick={() => setPaymentStatus(p.id, "failed")}>Tolak</button>
            </>
          ) : (
            <button className="btn btn-line btn-sm" onClick={() => showToast(`Detail pesanan ${p.id}`)}>Detail</button>
          )}
        </div>
      </td>
    </tr>
  );
}
