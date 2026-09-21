"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

/**
 * Ô tìm sản phẩm dùng chung: gõ SKU hoặc tên, chọn một cái để thêm vào bảng hàng.
 *
 * Tách ra từ bảng hàng báo giá để mua hàng dùng lại — cùng một endpoint, cùng một cách
 * hiển thị, nên người dùng không phải học hai kiểu tìm hàng khác nhau.
 *
 * Kết quả gắn với **câu đã tìm**, nên gõ tiếp là danh sách cũ tự biến mất; không phải
 * xóa trạng thái trong effect (tránh render dây chuyền).
 */

export interface GoiYSanPham {
  id: string;
  sku: string;
  ten: string;
  donViTinh: string | null;
  giaBan: string;
  giaVon: string;
  nhaCungCapId: string | null;
  vat: string;
  baoHanhThang: number | null;
}

export default function OTimSanPham({
  khiChon,
  nhan = "Tìm sản phẩm để thêm vào bảng hàng",
  goiY = "Gõ mã SKU hoặc tên sản phẩm để thêm hàng…",
  khongThayGoiY = "Không có sản phẩm khớp. Gõ tay tên hàng ở bảng dưới cũng được.",
  moTaGoiY,
}: {
  khiChon: (g: GoiYSanPham) => void;
  nhan?: string;
  goiY?: string;
  khongThayGoiY?: string;
  /** Dòng phụ dưới tên sản phẩm. Mặc định: SKU và đơn vị tính. */
  moTaGoiY?: (g: GoiYSanPham) => ReactNode;
}) {
  const id = useId();
  const [q, datQ] = useState("");
  const [ketQua, datKetQua] = useState<{ cau: string; ds: GoiYSanPham[] }>({ cau: "", ds: [] });
  const [dangTim, datDangTim] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);
  const cau = q.trim();
  const ds = ketQua.cau === cau ? ketQua.ds : [];

  useEffect(() => {
    if (cau.length < 2) return;
    const huy = new AbortController();
    const hen = setTimeout(async () => {
      datDangTim(true);
      try {
        const r = await fetch(`/api/v1/bao-gia/goi-y-san-pham?q=${encodeURIComponent(cau)}`, { signal: huy.signal });
        const d = await r.json();
        if (!r.ok) throw new Error(d.thongBao ?? "Không tìm được sản phẩm");
        datKetQua({ cau, ds: Array.isArray(d) ? d : [] });
        datLoi(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") datLoi((e as Error).message);
      } finally {
        datDangTim(false);
      }
    }, 250);
    return () => {
      clearTimeout(hen);
      huy.abort();
    };
  }, [cau]);

  return (
    <div className="o-chon-khach">
      <label className="chi-doc-man-hinh" htmlFor={id}>
        {nhan}
      </label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        value={q}
        onChange={(e) => datQ(e.target.value)}
        placeholder={goiY}
      />
      {loi && <div className="loi-truong">{loi}</div>}
      {cau.length >= 2 && (
        <ul className="goi-y-khach">
          {dangTim && ds.length === 0 && <li className="goi-y">Đang tìm…</li>}
          {!dangTim && ds.length === 0 && <li className="goi-y">{khongThayGoiY}</li>}
          {ds.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => {
                  khiChon(g);
                  datQ("");
                }}
              >
                <strong>{g.ten}</strong>
                <div className="dong-phu">
                  {moTaGoiY ? moTaGoiY(g) : `${g.sku}${g.donViTinh ? ` · ${g.donViTinh}` : ""}`}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
