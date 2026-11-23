"use client";

import { useGoiApi } from "@/components/ui/goi-api";

/** Bấm "Tiếp tục": máy chủ sinh state + URL hộp thoại của nền tảng → chuyển trình duyệt sang đó. */
export default function NutBatDauOAuth({ nhaCungCap, kenhId }: { nhaCungCap: string; kenhId: string | null }) {
  const { goi, dangGui, loi } = useGoiApi();
  async function bam() {
    const r = await goi<{ url: string }>(`/api/v1/mang-xa-hoi/oauth/${nhaCungCap}`, "POST", { kenhId });
    if (r?.url) window.location.assign(r.url);
  }
  return (
    <>
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      <button type="button" className="nut chinh" disabled={dangGui} onClick={bam}>{dangGui ? "Đang chuyển…" : `Tiếp tục tới ${nhaCungCap === "google" ? "Google" : "Facebook"}`}</button>
      {" "}<a className="nut" href="/mang-xa-hoi/kenh">Hủy</a>
    </>
  );
}
