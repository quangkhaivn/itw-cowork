"use client";

import { forwardRef } from "react";
import BieuTuong from "./BieuTuong";

/**
 * Hộp thoại dùng thẻ <dialog> gốc của trình duyệt: có sẵn bẫy tiêu điểm, phím Esc, lớp nền.
 * Mở bằng `ref.current?.showModal()`. Nội dung tự đặt `.than` và `.chan-form`.
 */
const HopThoai = forwardRef<HTMLDialogElement, { tieuDe: string; rong?: number; children: React.ReactNode; khiDong?: () => void }>(
  function HopThoai({ tieuDe, rong, children, khiDong }, ref) {
    return (
      <dialog
        ref={ref}
        className="hop-thoai"
        style={rong ? { width: `min(${rong}px, calc(100vw - 32px))` } : undefined}
        onClose={khiDong}
      >
        <div className="dau">
          <h2>{tieuDe}</h2>
          <button
            type="button"
            className="nut trong icon"
            aria-label="Đóng"
            onClick={(e) => (e.currentTarget.closest("dialog") as HTMLDialogElement | null)?.close()}
          >
            <BieuTuong ten="dong" />
          </button>
        </div>
        {children}
      </dialog>
    );
  },
);

export default HopThoai;
