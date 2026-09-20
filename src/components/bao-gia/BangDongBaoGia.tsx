"use client";

import { useEffect, useId, useRef, useState } from "react";
import { dinhDangNhapTien } from "@/lib/dinh-dang";
import { dinhDangTien } from "@/lib/dinh-dang";
import { tinhBaoGia } from "@/modules/bao-gia/tinh-toan";

/**
 * Bảng hàng của một phiên bản báo giá: thêm hàng từ danh mục sản phẩm hoặc gõ tay,
 * sửa số lượng / đơn giá / chiết khấu / VAT, xem thành tiền ngay.
 *
 * Giá vốn lấy theo **nguồn nên mua** của sản phẩm (bảng giá nhà cung cấp) và được chụp
 * lại trên dòng hàng — sau này nhà cung cấp đổi giá thì báo giá cũ vẫn giữ con số lúc lập.
 */

export interface DongNhap {
  khoa: string;
  sanPhamId: string | null;
  sku: string | null;
  ten: string;
  moTa: string;
  soLuong: string;
  donViTinh: string;
  donGia: string;
  chietKhau: string;
  vat: string;
  giaVon: string;
  nhaCungCapId: string | null;
}

interface GoiY {
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

let dem = 0;
export function dongTrong(): DongNhap {
  dem += 1;
  return {
    khoa: `d${Date.now().toString(36)}-${dem}`,
    sanPhamId: null,
    sku: null,
    ten: "",
    moTa: "",
    soLuong: "1",
    donViTinh: "",
    donGia: "",
    chietKhau: "0",
    vat: "10",
    giaVon: "",
    nhaCungCapId: null,
  };
}

/** Số về dạng máy chủ hiểu: bỏ dấu chấm ngăn nghìn, dấu phẩy thành dấu chấm. */
function soThuan(s: string): string {
  return s.replace(/\./g, "").replace(",", ".");
}

export function dongVeApi(d: DongNhap) {
  return {
    sanPhamId: d.sanPhamId,
    ten: d.ten.trim(),
    moTa: d.moTa.trim(),
    soLuong: soThuan(d.soLuong || "0"),
    donViTinh: d.donViTinh.trim(),
    donGia: d.donGia || "0",
    chietKhau: Number(d.chietKhau || 0),
    vat: Number(d.vat || 0),
    giaVon: d.giaVon || "0",
    nhaCungCapId: d.nhaCungCapId,
  };
}

function OTim({ khiChon }: { khiChon: (g: GoiY) => void }) {
  const id = useId();
  const [q, datQ] = useState("");
  const [ketQua, datKetQua] = useState<{ cau: string; ds: GoiY[] }>({ cau: "", ds: [] });
  const [dangTim, datDangTim] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);
  const cau = q.trim();

  // Kết quả gắn với câu đã tìm, nên gõ tiếp là danh sách cũ tự biến mất — không cần xóa trong effect.
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
        Tìm sản phẩm để thêm vào báo giá
      </label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        value={q}
        onChange={(e) => datQ(e.target.value)}
        placeholder="Gõ mã SKU hoặc tên sản phẩm để thêm hàng…"
      />
      {loi && <div className="loi-truong">{loi}</div>}
      {cau.length >= 2 && (
        <ul className="goi-y-khach">
          {dangTim && ds.length === 0 && <li className="goi-y">Đang tìm…</li>}
          {!dangTim && ds.length === 0 && <li className="goi-y">Không có sản phẩm khớp. Gõ tay tên hàng ở bảng dưới cũng được.</li>}
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
                  {g.sku} · Giá bán {dinhDangTien(g.giaBan)} · Giá vốn {dinhDangTien(g.giaVon)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BangDongBaoGia({
  dong,
  datDong,
  donViTinh,
  hienGiaVon,
  nguongBienLoiNhuan,
}: {
  dong: DongNhap[];
  datDong: (d: DongNhap[]) => void;
  /** Đơn vị tính lấy từ Dữ liệu gốc — in ra báo giá là TÊN, lưu xuống là MÃ. */
  donViTinh: { ma: string; ten: string }[];
  /** Ẩn cột giá vốn với người không được xem giá mua (quyền `product.view`). */
  hienGiaVon: boolean;
  nguongBienLoiNhuan: number | null;
}) {
  const oCuoi = useRef<HTMLInputElement | null>(null);
  const tong = tinhBaoGia(dong.map((d) => ({ soLuong: soThuan(d.soLuong), donGia: soThuan(d.donGia), chietKhau: d.chietKhau, vat: d.vat, giaVon: soThuan(d.giaVon) })));
  const duoiNguong = nguongBienLoiNhuan !== null && tong.bienLoiNhuan !== null && tong.bienLoiNhuan < nguongBienLoiNhuan;

  const sua = (i: number, thay: Partial<DongNhap>) => datDong(dong.map((d, j) => (j === i ? { ...d, ...thay } : d)));
  const them = (g?: GoiY) => {
    const d = dongTrong();
    datDong([
      ...dong,
      g
        ? {
            ...d,
            sanPhamId: g.id,
            sku: g.sku,
            ten: g.ten,
            donViTinh: g.donViTinh ?? "",
            donGia: dinhDangNhapTien(g.giaBan),
            giaVon: dinhDangNhapTien(g.giaVon),
            nhaCungCapId: g.nhaCungCapId,
            vat: String(Number(g.vat ?? 10)),
          }
        : d,
    ]);
    if (!g) setTimeout(() => oCuoi.current?.focus(), 0);
  };

  return (
    <div className="phan-form">
      <h3>Bảng hàng</h3>
      <OTim khiChon={them} />

      {dong.length === 0 ? (
        <p className="goi-y">Chưa có dòng hàng nào. Tìm sản phẩm ở ô trên, hoặc bấm “Thêm dòng trống” để gõ tay.</p>
      ) : (
        <div className="cuon-ngang">
          <table className="bang bang-hang">
            <thead>
              <tr>
                <th className="so" style={{ width: 34 }}>
                  #
                </th>
                <th>Hàng hóa / dịch vụ</th>
                <th className="so" style={{ width: 92 }}>
                  SL
                </th>
                <th style={{ width: 80 }}>ĐVT</th>
                <th className="so" style={{ width: 130 }}>
                  Đơn giá
                </th>
                <th className="so" style={{ width: 72 }}>
                  CK %
                </th>
                <th className="so" style={{ width: 72 }}>
                  VAT %
                </th>
                {hienGiaVon && (
                  <th className="so" style={{ width: 130 }}>
                    Giá vốn
                  </th>
                )}
                <th className="so" style={{ width: 130 }}>
                  Thành tiền
                </th>
                <th style={{ width: 40 }}>
                  <span className="chi-doc-man-hinh">Xóa</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {dong.map((d, i) => (
                <tr key={d.khoa}>
                  <td className="so nho">{i + 1}</td>
                  <td>
                    <input
                      ref={i === dong.length - 1 ? oCuoi : undefined}
                      type="text"
                      aria-label={`Tên hàng dòng ${i + 1}`}
                      value={d.ten}
                      onChange={(e) => sua(i, { ten: e.target.value })}
                      placeholder="Tên hàng hóa hoặc dịch vụ"
                    />
                    {d.sku && <div className="dong-phu">{d.sku}</div>}
                    <input
                      type="text"
                      aria-label={`Mô tả dòng ${i + 1}`}
                      className="nho"
                      value={d.moTa}
                      onChange={(e) => sua(i, { moTa: e.target.value })}
                      placeholder="Mô tả thêm (cấu hình, bảo hành…) — không bắt buộc"
                    />
                  </td>
                  <td>
                    <input type="text" inputMode="decimal" className="phai" aria-label={`Số lượng dòng ${i + 1}`} value={d.soLuong} onChange={(e) => sua(i, { soLuong: e.target.value })} />
                  </td>
                  <td>
                    <select aria-label={`Đơn vị tính dòng ${i + 1}`} value={d.donViTinh} onChange={(e) => sua(i, { donViTinh: e.target.value })}>
                      <option value="">—</option>
                      {donViTinh.map((v) => (
                        <option key={v.ma} value={v.ma}>
                          {v.ten}
                        </option>
                      ))}
                      {d.donViTinh && !donViTinh.some((v) => v.ma === d.donViTinh) && <option value={d.donViTinh}>{d.donViTinh}</option>}
                    </select>
                  </td>
                  <td>
                    <input type="text" inputMode="numeric" className="phai" aria-label={`Đơn giá dòng ${i + 1}`} value={d.donGia} onChange={(e) => sua(i, { donGia: dinhDangNhapTien(e.target.value) })} />
                  </td>
                  <td>
                    <input type="number" min={0} max={100} className="phai" aria-label={`Chiết khấu dòng ${i + 1}`} value={d.chietKhau} onChange={(e) => sua(i, { chietKhau: e.target.value })} />
                  </td>
                  <td>
                    <input type="number" min={0} max={100} className="phai" aria-label={`Thuế suất dòng ${i + 1}`} value={d.vat} onChange={(e) => sua(i, { vat: e.target.value })} />
                  </td>
                  {hienGiaVon && (
                    <td>
                      <input type="text" inputMode="numeric" className="phai" aria-label={`Giá vốn dòng ${i + 1}`} value={d.giaVon} onChange={(e) => sua(i, { giaVon: dinhDangNhapTien(e.target.value) })} />
                    </td>
                  )}
                  <td className="so">{dinhDangTien(tong.dong[i]?.thanhTien ?? 0)}</td>
                  <td>
                    <button type="button" className="nut trong nho" aria-label={`Xóa dòng ${i + 1}`} onClick={() => datDong(dong.filter((_, j) => j !== i))}>
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="hang-nhap" style={{ marginTop: 10 }}>
        <button type="button" className="nut" onClick={() => them()}>
          Thêm dòng trống
        </button>
      </div>

      <dl className="tong-bao-gia">
        <div>
          <dt>Tạm tính</dt>
          <dd>{dinhDangTien(tong.tamTinh)}</dd>
        </div>
        {tong.tongChietKhau > 0 && (
          <div>
            <dt>Chiết khấu</dt>
            <dd>− {dinhDangTien(tong.tongChietKhau)}</dd>
          </div>
        )}
        <div>
          <dt>Thuế GTGT</dt>
          <dd>{dinhDangTien(tong.tongVat)}</dd>
        </div>
        <div className="tong-cong">
          <dt>Tổng cộng</dt>
          <dd>{dinhDangTien(tong.tongCong)}</dd>
        </div>
        {hienGiaVon && (
          <div className={duoiNguong ? "canh-bao" : undefined}>
            <dt>Biên lợi nhuận</dt>
            <dd>
              {tong.bienLoiNhuan === null ? "—" : `${tong.bienLoiNhuan.toLocaleString("vi-VN")}%`}
              <div className="dong-phu">
                Lãi gộp {dinhDangTien(tong.loiNhuanGop)}
                {nguongBienLoiNhuan === null
                  ? " · chưa đặt ngưỡng nên báo giá nào cũng phải duyệt"
                  : duoiNguong
                    ? ` · dưới ngưỡng ${nguongBienLoiNhuan}% — sẽ phải xin duyệt`
                    : ` · đạt ngưỡng ${nguongBienLoiNhuan}%`}
              </div>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
