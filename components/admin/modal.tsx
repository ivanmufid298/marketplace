"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAdmin, type ModalType } from "./admin-provider";
import { Select, Switch } from "./ui";

const opts = (...labels: string[]) => labels.map((l) => ({ value: l, label: l }));

function Field({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) {
  return (
    <div className={`field${full ? " full" : ""}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function Scheduler() {
  const [on, setOn] = useState(false);
  return (
    <div className={`scheduler-box${on ? " active" : ""}`}>
      <div className="scheduler-top">
        <div>
          <b>Gunakan scheduler</b>
          <div className="sub">Tayang otomatis sesuai jadwal</div>
        </div>
        <Switch label="Gunakan scheduler" onChange={setOn} />
      </div>
      <div className="scheduler-dates">
        <Field label="Mulai"><input type="datetime-local" /></Field>
        <Field label="Berakhir"><input type="datetime-local" /></Field>
      </div>
    </div>
  );
}

const TEMPLATES: Record<ModalType, { title: string; fields: () => ReactNode }> = {
  product: {
    title: "Tambah produk",
    fields: () => (
      <>
        <Field label="Nama produk" full><input required placeholder="Contoh: Tote Canvas Everyday" /></Field>
        <Field label="Kategori"><Select options={opts("Fashion", "Rumah", "Elektronik", "Kecantikan")} /></Field>
        <Field label="Harga"><input required inputMode="numeric" placeholder="129000" /></Field>
        <Field label="Stok"><input required inputMode="numeric" placeholder="20" /></Field>
        <Field label="Status"><Select options={opts("Aktif", "Draft")} /></Field>
        <Field label="Deskripsi" full><textarea placeholder="Deskripsi singkat produk" /></Field>
      </>
    ),
  },
  promo: {
    title: "Tambah promo",
    fields: () => (
      <>
        <Field label="Nama promo" full><input required placeholder="Contoh: Weekend Sale" /></Field>
        <Field label="Tipe diskon"><Select options={opts("Persentase", "Nominal", "Gratis ongkir")} /></Field>
        <Field label="Nilai diskon"><input required placeholder="15%" /></Field>
        <Field label="Berlaku untuk" full><Select options={opts("Semua produk", "Kategori tertentu", "Produk tertentu")} /></Field>
        <Scheduler />
      </>
    ),
  },
  voucher: {
    title: "Tambah voucher",
    fields: () => (
      <>
        <Field label="Kode voucher" full><input required placeholder="HEMAT25" style={{ textTransform: "uppercase" }} /></Field>
        <Field label="Jenis potongan"><Select options={opts("Persentase", "Nominal")} /></Field>
        <Field label="Nilai"><input required placeholder="25%" /></Field>
        <Field label="Minimal belanja"><input placeholder="200000" /></Field>
        <Field label="Kuota penggunaan"><input placeholder="500" /></Field>
        <Scheduler />
      </>
    ),
  },
  banner: {
    title: "Kelola banner",
    fields: () => (
      <>
        <Field label="Judul banner" full><input required placeholder="Hal baik, pilihan cantik." /></Field>
        <Field label="Subjudul" full><textarea placeholder="Teks pendukung banner" /></Field>
        <Field label="Upload gambar" full><input type="file" accept="image/*" /></Field>
        <Field label="Teks tombol"><input placeholder="Jelajahi koleksi" /></Field>
        <Field label="Tujuan tombol"><input placeholder="/kategori/fashion" /></Field>
        <Scheduler />
      </>
    ),
  },
  popup: {
    title: "Kelola popup campaign",
    fields: () => (
      <>
        <Field label="Nama campaign" full><input required placeholder="Payday Poster" /></Field>
        <Field label="Upload poster" full><input type="file" accept="image/*" /></Field>
        <Field label="Muncul saat"><Select options={opts("Page dibuka", "Setelah 5 detik", "Saat akan keluar")} /></Field>
        <Field label="Frekuensi"><Select options={opts("Satu kali per sesi", "Satu kali per hari", "Selalu")} /></Field>
        <Field label="Halaman tujuan" full><Select options={opts("Semua halaman", "Homepage saja", "Halaman produk")} /></Field>
        <Scheduler />
      </>
    ),
  },
  shipping: {
    title: "Tambah layanan ongkir",
    fields: () => (
      <>
        <Field label="Nama layanan" full><input required placeholder="Contoh: Instant" /></Field>
        <Field label="Tarif dasar"><input required placeholder="25000" /></Field>
        <Field label="Estimasi"><input required placeholder="1–3 jam" /></Field>
        <Field label="Gratis ongkir minimal belanja" full><input placeholder="500000" /></Field>
      </>
    ),
  },
};

export function AdminModal() {
  const { modal, closeModal, showToast } = useAdmin();

  useEffect(() => {
    if (!modal) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [modal, closeModal]);

  const template = modal ? TEMPLATES[modal] : null;
  return (
    <div className={`modal-backdrop${modal ? " open" : ""}`} onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal">
        <div className="modal-head">
          <h2>{template?.title ?? "Tambah"}</h2>
          <button className="close" aria-label="Tutup" onClick={closeModal}>×</button>
        </div>
        {/* Key by type so every open starts from a blank form. */}
        <form
          key={modal ?? "none"}
          onSubmit={(e) => {
            e.preventDefault();
            closeModal();
            showToast("Data berhasil disimpan");
          }}
        >
          <div className="modal-body"><div className="fields">{template?.fields()}</div></div>
          <div className="modal-foot">
            <button type="button" className="btn btn-line" onClick={closeModal}>Batal</button>
            <button className="btn btn-primary">Simpan</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AdminToast() {
  const { toast } = useAdmin();
  return <div className={`toast${toast ? " show" : ""}`}>{toast}</div>;
}
