"use client";

import { useState } from "react";

/** Ô hiện đường dẫn / mã nhúng kèm nút chép. */
export default function MaNhung({ nhan, ma }: { nhan: string; ma: string }) {
  const [daChep, datDaChep] = useState(false);
  return (
    <div className="truong">
      <span className="nhan">{nhan}</span>
      <pre className="khung-ma">{ma}</pre>
      <button
        type="button"
        className="nut nho"
        style={{ alignSelf: "flex-start" }}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(ma);
            datDaChep(true);
          } catch {
            datDaChep(false);
          }
        }}
      >
        {daChep ? "Đã chép" : "Chép"}
      </button>
    </div>
  );
}
