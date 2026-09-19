"use client";

import Link from "next/link";

export interface UngVienTrung {
  loai: "khach-hang" | "lead";
  id: string;
  ma: string;
  ten: string;
  nguoiPhuTrach: string;
  lyDo: string[];
  moDuoc: boolean;
}

/**
 * Danh sách bản ghi có thể trùng (KH-03, LD-03). Bản ghi ngoài phạm vi của người đang nhập
 * chỉ hiện mã, tên và người phụ trách — không có liên kết — để họ hỏi đồng nghiệp (KH-04).
 */
export default function DanhSachTrung({
  ungVien,
  chan,
  tieuDe,
}: {
  ungVien: UngVienTrung[];
  /** true = trùng mã số thuế, không cho lưu. */
  chan?: boolean;
  tieuDe?: string;
}) {
  if (!ungVien.length) return null;
  return (
    <div className={`hop-thong-bao ${chan ? "loi" : "canh-bao"}`} role="alert">
      <strong>{tieuDe ?? (chan ? "Đã có khách hàng mang mã số thuế này" : "Có thể trùng với bản ghi đã có")}</strong>
      <ul className="ds-trung">
        {ungVien.map((u) => {
          const href = u.loai === "khach-hang" ? `/crm/khach-hang/${u.id}` : `/crm/lead/${u.id}`;
          return (
            <li key={`${u.loai}-${u.id}`}>
              <span className="huy-hieu">{u.loai === "khach-hang" ? "Khách hàng" : "Lead"}</span>{" "}
              {u.moDuoc ? (
                <Link href={href} target="_blank">
                  {u.ma} — {u.ten}
                </Link>
              ) : (
                <span>
                  {u.ma} — {u.ten}
                </span>
              )}
              <span className="phu"> · phụ trách: {u.nguoiPhuTrach} · {u.lyDo.join(", ")}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
