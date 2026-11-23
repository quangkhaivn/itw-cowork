"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

export default function FormTrangCongKhai({ trang, tieuDe, noiDung, sua }: { trang: string; tieuDe: string; noiDung: string; sua: boolean }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [td, datTd] = useState(tieuDe);
  const [nd, datNd] = useState(noiDung);
  async function luu() {
    if (await goi(`/api/v1/mang-xa-hoi/trang-cong-khai/${trang}`, "PUT", { tieuDe: td, noiDung: nd })) router.refresh();
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      <label htmlFor={`td-${trang}`}>Tiêu đề</label>
      <input id={`td-${trang}`} value={td} maxLength={200} disabled={!sua} onChange={(e) => datTd(e.target.value)} />
      <label htmlFor={`nd-${trang}`}>Nội dung</label>
      <textarea id={`nd-${trang}`} rows={14} value={nd} disabled={!sua} onChange={(e) => datNd(e.target.value)} />
      {sua && <div><button type="button" className="nut chinh" disabled={dangGui} onClick={luu}>{dangGui ? "Đang lưu…" : "Lưu"}</button></div>}
    </div>
  );
}
