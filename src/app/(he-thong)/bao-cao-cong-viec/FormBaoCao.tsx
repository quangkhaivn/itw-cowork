"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

/** Mẫu ba phần (DG-40): Đã làm · Sẽ làm · Vướng mắc. Lưu nháp hoặc Nộp (nộp rồi không sửa được). */
export default function FormBaoCao({ loai, ngay, daLam, seLam, vuongMac, khoa }: { loai: "ngay" | "tuan"; ngay: string; daLam: string; seLam: string; vuongMac: string; khoa: boolean }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState({ daLam, seLam, vuongMac });
  async function luu(nop: boolean) {
    if (nop && !window.confirm("Nộp báo cáo? Đã nộp thì không sửa được nữa.")) return;
    if (await goi("/api/v1/bao-cao-cong-viec", "POST", { loai, ngay, ...gt, nop })) router.refresh();
  }
  return (
    <div className="than">
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      {(["daLam", "seLam", "vuongMac"] as const).map((k) => (
        <div className="truong" key={k}>
          <label htmlFor={`bc-${k}`}>{k === "daLam" ? "Đã làm" : k === "seLam" ? "Sẽ làm" : "Vướng mắc (quản lý chuyển thành việc được)"}</label>
          <textarea id={`bc-${k}`} rows={k === "vuongMac" ? 3 : 7} value={gt[k]} disabled={khoa} onChange={(e) => datGt({ ...gt, [k]: e.target.value })} />
        </div>
      ))}
      {!khoa && (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="nut" disabled={dangGui} onClick={() => luu(false)}>Lưu nháp</button>
          <button type="button" className="nut chinh" disabled={dangGui} onClick={() => luu(true)}>{dangGui ? "Đang gửi…" : "Nộp báo cáo"}</button>
        </div>
      )}
    </div>
  );
}
