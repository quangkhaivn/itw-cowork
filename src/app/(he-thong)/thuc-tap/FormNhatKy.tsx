"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

/** Nhật ký tuần của thực tập sinh (DG-70): đã làm / học được / vướng mắc. Nộp rồi không sửa. */
export default function FormNhatKy({ daLam, hocDuoc, vuongMac, khoa }: { daLam: string; hocDuoc: string; vuongMac: string; khoa: boolean }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState({ daLam, hocDuoc, vuongMac });
  async function luu(nop: boolean) {
    if (nop && !window.confirm("Nộp nhật ký tuần? Nộp rồi không sửa được.")) return;
    if (await goi("/api/v1/thuc-tap/nhat-ky", "POST", { ...gt, nop })) router.refresh();
  }
  return (
    <div className="than">
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      {(["daLam", "hocDuoc", "vuongMac"] as const).map((k) => (
        <div className="truong" key={k}>
          <label>{k === "daLam" ? "Tuần này đã làm" : k === "hocDuoc" ? "Học được gì" : "Vướng mắc"}</label>
          <textarea rows={4} value={gt[k]} disabled={khoa} onChange={(e) => datGt({ ...gt, [k]: e.target.value })} />
        </div>
      ))}
      {!khoa && (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="nut" disabled={dangGui} onClick={() => luu(false)}>Lưu nháp</button>
          <button type="button" className="nut chinh" disabled={dangGui} onClick={() => luu(true)}>Nộp nhật ký</button>
        </div>
      )}
    </div>
  );
}
