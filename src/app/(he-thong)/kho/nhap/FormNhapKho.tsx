"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNhapTien } from "@/lib/dinh-dang";
import { dinhDangTien } from "@/lib/dinh-dang";

interface GoiY {
  id: string;
  sku: string;
  ten: string;
  donViTinh: string | null;
  giaBan: string;
  giaVon: string;
  baoHanhThang: number | null;
}

interface DongNhap {
  khoa: string;
  sanPhamId: string;
  sku: string;
  ten: string;
  theoSerial: boolean;
  soLuong: string;
  giaVon: string;
  serial: string;
}

let dem = 0;
function dongMoi(g: GoiY, theoSerial: boolean): DongNhap {
  dem += 1;
  return {
    khoa: `n${Date.now().toString(36)}-${dem}`,
    sanPhamId: g.id,
    sku: g.sku,
    ten: g.ten,
    theoSerial,
    soLuong: "1",
    giaVon: dinhDangNhapTien(g.giaVon),
    serial: "",
  };
}

/**
 * Phiếu nhập kho: chọn kho, ghi rõ nguồn hàng, thêm từng mặt hàng.
 * Hàng quản lý theo sê-ri phải khai đủ sê-ri, mỗi dòng một số (KHO-05).
 */
export default function FormNhapKho({
  kho,
  khoMacDinhId,
  sanPhamTheoSerial,
}: {
  kho: { id: string; ma: string; ten: string }[];
  khoMacDinhId: string;
  /** Id sản phẩm bắt buộc sê-ri — máy chủ vẫn kiểm lại, đây chỉ để hiện ô nhập. */
  sanPhamTheoSerial: string[];
}) {
  const router = useRouter();
  const idTim = useId();
  const { goi, dangGui, loi } = useGoiApi();
  const [khoId, datKhoId] = useState(khoMacDinhId || kho[0]?.id || "");
  const [lyDo, datLyDo] = useState("");
  const [ghiChu, datGhiChu] = useState("");
  const [dong, datDong] = useState<DongNhap[]>([]);
  const [q, datQ] = useState("");
  const [ketQua, datKetQua] = useState<{ cau: string; ds: GoiY[] }>({ cau: "", ds: [] });
  const cau = q.trim();
  const ds = ketQua.cau === cau ? ketQua.ds : [];
  const theoSerial = new Set(sanPhamTheoSerial);

  useEffect(() => {
    if (cau.length < 2) return;
    const huy = new AbortController();
    const hen = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/bao-gia/goi-y-san-pham?q=${encodeURIComponent(cau)}`, { signal: huy.signal });
        if (!r.ok) return;
        const d = await r.json();
        datKetQua({ cau, ds: Array.isArray(d) ? d : [] });
      } catch {
        /* bỏ qua: ô tìm không chặn việc nhập kho */
      }
    }, 250);
    return () => {
      clearTimeout(hen);
      huy.abort();
    };
  }, [cau]);

  const sua = (i: number, thay: Partial<DongNhap>) => datDong((c) => c.map((d, j) => (j === i ? { ...d, ...thay } : d)));

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ khoId: string }>("/api/v1/kho/nhap", "POST", {
      khoId,
      lyDo,
      ghiChu,
      dong: dong.map((d) => ({
        sanPhamId: d.sanPhamId,
        soLuong: d.soLuong,
        giaVon: d.giaVon || "0",
        serial: d.serial.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean),
      })),
    });
    if (kq) router.push("/kho?daNhap=1");
  }

  const thieu = !khoId || lyDo.trim().length < 2 || dong.length === 0;

  return (
    <form className="the" onSubmit={gui} noValidate>
      {loi && (
        <div style={{ padding: "16px 16px 0" }}>
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
          </div>
        </div>
      )}

      <div className="phan-form">
        <h3>Phiếu nhập</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="nk-kho">Nhập vào kho</label>
            <select id="nk-kho" value={khoId} onChange={(e) => datKhoId(e.target.value)}>
              {kho.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ten} ({k.ma})
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="nk-lydo">
              Nguồn hàng / lý do nhập <span className="bat-buoc">*</span>
            </label>
            <input id="nk-lydo" type="text" value={lyDo} onChange={(e) => datLyDo(e.target.value)} placeholder="Ví dụ: mua của An Phát theo hóa đơn 0012" />
            {loiCua(loi, "lyDo") && <span className="loi-truong">{loiCua(loi, "lyDo")}</span>}
          </div>
          <div className="truong ca-dong">
            <label htmlFor="nk-ghichu">Ghi chú</label>
            <input id="nk-ghichu" type="text" value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="phan-form">
        <h3>Hàng nhập</h3>
        <div className="o-chon-khach">
          <label className="chi-doc-man-hinh" htmlFor={idTim}>
            Tìm sản phẩm để thêm vào phiếu nhập
          </label>
          <input id={idTim} type="search" autoComplete="off" value={q} onChange={(e) => datQ(e.target.value)} placeholder="Gõ mã SKU hoặc tên sản phẩm…" />
          {cau.length >= 2 && (
            <ul className="goi-y-khach">
              {ds.length === 0 && <li className="goi-y">Không có sản phẩm khớp.</li>}
              {ds.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => {
                      datDong((c) => [...c, dongMoi(g, theoSerial.has(g.id))]);
                      datQ("");
                    }}
                  >
                    <strong>{g.ten}</strong>
                    <div className="dong-phu">
                      {g.sku} · giá vốn tham chiếu {dinhDangTien(g.giaVon)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {dong.length === 0 ? (
          <p className="goi-y">Chưa chọn hàng nào. Tìm sản phẩm ở ô trên để thêm vào phiếu.</p>
        ) : (
          <div className="cuon-ngang">
            <table className="bang bang-hang">
              <thead>
                <tr>
                  <th>Hàng hóa</th>
                  <th className="so" style={{ width: 110 }}>
                    Số lượng
                  </th>
                  <th className="so" style={{ width: 140 }}>
                    Giá nhập
                  </th>
                  <th style={{ width: 260 }}>Số sê-ri</th>
                  <th style={{ width: 40 }}>
                    <span className="chi-doc-man-hinh">Xóa</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {dong.map((d, i) => (
                  <tr key={d.khoa}>
                    <td>
                      {d.ten}
                      <div className="dong-phu">{d.sku}</div>
                    </td>
                    <td>
                      <input type="text" inputMode="decimal" className="phai" aria-label={`Số lượng ${d.ten}`} value={d.soLuong} onChange={(e) => sua(i, { soLuong: e.target.value })} />
                    </td>
                    <td>
                      <input type="text" inputMode="numeric" className="phai" aria-label={`Giá nhập ${d.ten}`} value={d.giaVon} onChange={(e) => sua(i, { giaVon: dinhDangNhapTien(e.target.value) })} />
                    </td>
                    <td>
                      {d.theoSerial ? (
                        <textarea rows={2} aria-label={`Số sê-ri ${d.ten}`} value={d.serial} onChange={(e) => sua(i, { serial: e.target.value })} placeholder="Mỗi sê-ri một dòng" />
                      ) : (
                        <span className="mo nho">Không quản lý sê-ri</span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="nut trong nho" aria-label={`Bỏ ${d.ten}`} onClick={() => datDong((c) => c.filter((_, j) => j !== i))}>
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.push("/kho")}>
          Hủy
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui || thieu}>
          {dangGui ? "Đang ghi sổ…" : "Nhập kho"}
        </button>
      </div>
      {thieu && <p className="goi-y" style={{ padding: "0 16px 14px" }}>Cần chọn kho, ghi nguồn hàng và thêm ít nhất một mặt hàng.</p>}
    </form>
  );
}
