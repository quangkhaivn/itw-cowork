"use client";

import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

/** Nút gọi một API (POST / DELETE) không cần nhập gì, có hỏi xác nhận; xong thì tải lại trang. */
export default function NutGoi({ url, nhan, phuongThuc = "POST", lopNut = "nut", xacNhan }: { url: string; nhan: string; phuongThuc?: "POST" | "DELETE"; lopNut?: string; xacNhan?: string }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  async function bam() {
    if (xacNhan && !window.confirm(xacNhan)) return;
    if (await goi(url, phuongThuc, phuongThuc === "POST" ? {} : undefined)) router.refresh();
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <button type="button" className={lopNut} disabled={dangGui} onClick={bam}>{dangGui ? "Đang gửi…" : nhan}</button>
      {loi && <span className="loi-truong" role="alert">{loi.thongBao}</span>}
    </span>
  );
}
