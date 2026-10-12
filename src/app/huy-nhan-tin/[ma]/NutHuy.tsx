"use client";

import { useState } from "react";

export default function NutHuy({ ma }: { ma: string }) {
  const [trangThai, datTrangThai] = useState<"cho" | "dang" | "xong" | "loi">("cho");

  async function huy() {
    datTrangThai("dang");
    try {
      const r = await fetch(`/api/cong-khai/huy-nhan-tin/${encodeURIComponent(ma)}`, { method: "POST" });
      datTrangThai(r.ok ? "xong" : "loi");
    } catch {
      datTrangThai("loi");
    }
  }

  if (trangThai === "xong") {
    return (
      <div className="hop-thong-bao tot" role="status">
        Đã huỷ. Bạn sẽ không nhận thêm thư giới thiệu nào từ chúng tôi.
      </div>
    );
  }
  return (
    <>
      {trangThai === "loi" && (
        <div className="hop-thong-bao loi" role="alert">
          Chưa huỷ được. Thử lại sau ít phút, hoặc trả lời thư để đề nghị ngừng gửi.
        </div>
      )}
      <button type="button" className="nut chinh" onClick={huy} disabled={trangThai === "dang"}>
        {trangThai === "dang" ? "Đang huỷ…" : "Huỷ nhận tin"}
      </button>
    </>
  );
}
