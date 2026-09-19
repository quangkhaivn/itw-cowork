"use client";

/**
 * Ô nhập tiền VND: gõ số trần, hiển thị có dấu chấm ngăn nghìn ("240.000.000").
 * Giá trị gửi lên là chuỗi đã định dạng — máy chủ tự bỏ dấu chấm (lược đồ `soTien`).
 */
export function dinhDangNhapTien(s: string): string {
  const so = s.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return so.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export default function ONhapTien({
  id,
  giaTri,
  datGiaTri,
  ...khac
}: {
  id: string;
  giaTri: string;
  datGiaTri: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "id">) {
  return (
    <div className="o-tien">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={giaTri}
        onChange={(e) => datGiaTri(dinhDangNhapTien(e.target.value))}
        {...khac}
      />
      <span aria-hidden="true">₫</span>
    </div>
  );
}
