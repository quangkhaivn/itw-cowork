"use client";

import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

/** Nút gọi một API POST không cần nhập gì (Nhận việc, Làm mới số liệu…), xong thì tải lại trang. */
export default function NutHanhDong({ url, nhan, lopNut = "nut", xacNhan, than }: { url: string; nhan: string; lopNut?: string; xacNhan?: string; than?: unknown }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  async function bam() {
    if (xacNhan && !window.confirm(xacNhan)) return;
    if (await goi(url, "POST", than ?? {})) router.refresh();
  }
  return (
    <>
      <button type="button" className={lopNut} disabled={dangGui} onClick={bam}>{dangGui ? "Đang gửi…" : nhan}</button>
      {loi && <span className="loi-truong">{loi.thongBao}</span>}
    </>
  );
}
