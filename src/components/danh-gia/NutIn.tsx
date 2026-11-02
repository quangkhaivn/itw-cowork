"use client";

/**
 * Nút in: dùng hộp thoại in của trình duyệt, chọn "Save as PDF" là ra file PDF.
 * Không cần thư viện sinh PDF trên máy chủ (QĐ-21).
 */
export default function NutIn() {
  return (
    <button type="button" className="nut chinh" onClick={() => window.print()}>
      In / Lưu PDF
    </button>
  );
}
