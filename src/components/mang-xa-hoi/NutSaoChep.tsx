"use client";

import { useState } from "react";

/** Ô chỉ đọc + nút sao chép (URL cần dán sang trang của nền tảng). */
export default function NutSaoChep({ giaTri }: { giaTri: string }) {
  const [da, datDa] = useState(false);
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <code style={{ wordBreak: "break-all" }}>{giaTri}</code>
      <button type="button" className="nut nho" onClick={async () => { try { await navigator.clipboard.writeText(giaTri); datDa(true); setTimeout(() => datDa(false), 1500); } catch { /* trình duyệt chặn */ } }}>
        {da ? "Đã chép" : "Sao chép"}
      </button>
    </span>
  );
}
