"use client";

import { useState } from "react";
import BieuTuong from "@/components/ui/BieuTuong";

/**
 * Nút tải CSV. Máy chủ trả JSON `{ tenTep, noiDung }` (mọi phản hồi vẫn đi qua lớp bọc
 * `xuLyApi` để giữ kiểm quyền và nhật ký); trình duyệt tự dựng tệp và tải về.
 */
export default function NutXuatCsv({ url, nhan = "Xuất CSV", lop = "nut" }: { url: string; nhan?: string; lop?: string }) {
  const [dangTai, datDangTai] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);

  async function tai() {
    datDangTai(true);
    datLoi(null);
    try {
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) throw new Error(d.thongBao ?? `Lỗi ${r.status}`);
      const blob = new Blob([d.noiDung], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = d.tenTep ?? "du-lieu.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      datLoi(e instanceof Error ? e.message : String(e));
    } finally {
      datDangTai(false);
    }
  }

  return (
    <>
      <button type="button" className={lop} onClick={tai} disabled={dangTai}>
        <BieuTuong ten="tai-xuong" co={16} /> {dangTai ? "Đang tạo tệp…" : nhan}
      </button>
      {loi && <span className="loi-truong">{loi}</span>}
    </>
  );
}
