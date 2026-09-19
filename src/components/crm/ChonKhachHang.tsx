"use client";

import { useEffect, useState } from "react";

export interface KhachDaChon {
  id: string;
  ma: string;
  ten: string;
}

/**
 * Ô chọn khách hàng có tìm kiếm. Hỏi `/api/v1/khach-hang?q=` — máy chủ chỉ trả khách
 * trong phạm vi người dùng, nên không chọn được khách của người khác.
 */
export default function ChonKhachHang({
  id,
  giaTri,
  datGiaTri,
  loi,
}: {
  id: string;
  giaTri: KhachDaChon | null;
  datGiaTri: (k: KhachDaChon | null) => void;
  loi?: string;
}) {
  const [q, datQ] = useState("");
  const [ketQua, datKetQua] = useState<{ cau: string; ds: KhachDaChon[] }>({ cau: "", ds: [] });
  const [loiTim, datLoiTim] = useState<string | null>(null);
  const cau = q.trim();

  useEffect(() => {
    if (giaTri || cau.length < 2) return;
    const huy = new AbortController();
    const hen = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/khach-hang?q=${encodeURIComponent(cau)}&coTrang=10`, { signal: huy.signal });
        const d = await r.json();
        if (!r.ok) throw new Error(d.thongBao ?? "Lỗi tìm khách hàng");
        datKetQua({ cau, ds: (d.dong ?? []).map((k: KhachDaChon) => ({ id: k.id, ma: k.ma, ten: k.ten })) });
        datLoiTim(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") datLoiTim((e as Error).message);
      }
    }, 250);
    return () => {
      clearTimeout(hen);
      huy.abort();
    };
  }, [cau, giaTri]);

  if (giaTri) {
    return (
      <div className="khach-da-chon">
        <span>
          <strong>{giaTri.ten}</strong> <span className="phu">{giaTri.ma}</span>
        </span>
        <button type="button" className="nut nho" onClick={() => datGiaTri(null)}>
          Đổi
        </button>
      </div>
    );
  }

  const ds = cau.length >= 2 && ketQua.cau === cau ? ketQua.ds : [];
  return (
    <div className="o-chon-khach">
      <input
        id={id}
        type="search"
        value={q}
        onChange={(e) => datQ(e.target.value)}
        placeholder="Gõ tên, mã, MST hoặc số điện thoại khách hàng"
        aria-invalid={loi ? true : undefined}
        autoComplete="off"
      />
      {cau.length >= 2 && (
        <ul className="goi-y-khach" role="listbox">
          {loiTim && <li className="phu">{loiTim}</li>}
          {!loiTim && ketQua.cau !== cau && <li className="phu">Đang tìm…</li>}
          {!loiTim && ketQua.cau === cau && ds.length === 0 && <li className="phu">Không có khách hàng nào khớp trong phạm vi của bạn.</li>}
          {ds.map((k) => (
            <li key={k.id}>
              <button type="button" onClick={() => datGiaTri(k)}>
                {k.ten} <span className="phu">{k.ma}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
