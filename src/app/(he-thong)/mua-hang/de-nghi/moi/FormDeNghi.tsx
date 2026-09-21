"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import OTimSanPham, { type GoiYSanPham } from "@/components/san-pham/OTimSanPham";
import { dinhDangNhapTien, dinhDangTien } from "@/lib/dinh-dang";

interface DongThieu {
  sanPhamId: string | null;
  sku: string | null;
  ten: string;
  donViTinh: string | null;
  canMua: number;
  giaVonThamChieu: string;
  nhaCungCapGoiYId: string | null;
}

interface Dong {
  khoa: string;
  sanPhamId: string;
  ten: string;
  soLuong: string;
  donViTinh: string;
  giaDuKien: string;
  nhaCungCapId: string;
}

let dem = 0;
function dongTrong(): Dong {
  dem += 1;
  return { khoa: `dn${Date.now().toString(36)}-${dem}`, sanPhamId: "", ten: "", soLuong: "1", donViTinh: "", giaDuKien: "", nhaCungCapId: "" };
}

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

/**
 * Lập đề nghị mua.
 *
 * Khi mở từ một đơn bán thiếu hàng, các dòng đã được điền sẵn đúng phần còn thiếu —
 * người dùng chỉ việc xem lại rồi gửi duyệt.
 */
export default function FormDeNghi({
  nhaCungCap,
  donBan,
  thieu,
}: {
  nhaCungCap: { id: string; ten: string }[];
  donBan: { id: string; so: string } | null;
  thieu: DongThieu[];
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [ngayCan, datNgayCan] = useState("");
  const [lyDo, datLyDo] = useState(donBan ? `Thiếu hàng cho đơn bán ${donBan.so}` : "");
  const [ghiChu, datGhiChu] = useState("");
  const [dong, datDong] = useState<Dong[]>(
    thieu.length > 0
      ? thieu.map((t, i) => ({
          khoa: `thieu-${i}`,
          sanPhamId: t.sanPhamId ?? "",
          ten: t.ten,
          soLuong: String(t.canMua),
          donViTinh: t.donViTinh ?? "",
          giaDuKien: dinhDangNhapTien(t.giaVonThamChieu),
          nhaCungCapId: t.nhaCungCapGoiYId ?? "",
        }))
      : [dongTrong()],
  );

  const sua = (i: number, thay: Partial<Dong>) => datDong((c) => c.map((d, j) => (j === i ? { ...d, ...thay } : d)));

  /** Chọn từ danh mục thì thêm hẳn một dòng mới, điền sẵn tên, đơn vị và giá vốn tham chiếu. */
  function themTuDanhMuc(g: GoiYSanPham) {
    datDong((c) => [
      ...c.filter((d) => d.ten.trim().length > 0 || d.sanPhamId),
      {
        ...dongTrong(),
        sanPhamId: g.id,
        ten: g.ten,
        donViTinh: g.donViTinh ?? "",
        giaDuKien: dinhDangNhapTien(g.giaVon ?? ""),
        nhaCungCapId: g.nhaCungCapId ?? "",
      },
    ]);
  }

  const hopLe = dong.filter((d) => d.ten.trim().length >= 2 && Number(d.soLuong) > 0);
  const tongDuKien = hopLe.reduce((s, d) => s + Number(d.soLuong) * Number(d.giaDuKien.replace(/\./g, "") || 0), 0);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ id: string }>("/api/v1/de-nghi-mua", "POST", {
      donBanId: donBan?.id ?? "",
      ngayCan,
      lyDo,
      ghiChu,
      dong: hopLe.map((d) => ({
        sanPhamId: d.sanPhamId,
        ten: d.ten,
        soLuong: d.soLuong,
        donViTinh: d.donViTinh,
        giaDuKien: d.giaDuKien || "0",
        nhaCungCapId: d.nhaCungCapId,
      })),
    });
    if (kq) router.push(`/mua-hang/de-nghi/${kq.id}?moTao=1`);
  }

  return (
    <form className="the" onSubmit={gui} noValidate>
      {loi && (
        <div style={{ padding: "16px 16px 0" }}>
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
          </div>
        </div>
      )}

      {donBan && thieu.length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          <div className="hop-thong-bao" role="status">
            Đã điền sẵn {thieu.length} dòng thiếu hàng của đơn bán <strong>{donBan.so}</strong>. Sửa lại nếu muốn mua khác đi.
          </div>
        </div>
      )}

      <div className="phan-form">
        <h3>Vì sao cần mua</h3>
        <div className="luoi-form">
          <div className="truong ca-dong">
            <label htmlFor="dn-lydo">Lý do</label>
            <input
              id="dn-lydo"
              type="text"
              value={lyDo}
              onChange={(e) => datLyDo(e.target.value)}
              placeholder="Ví dụ: bổ sung tồn kho quý sau, hoặc thiếu hàng cho đơn cụ thể"
            />
          </div>
          <div className="truong">
            <label htmlFor="dn-ngay">Cần trước ngày</label>
            <input id="dn-ngay" type="date" value={ngayCan} onChange={(e) => datNgayCan(e.target.value)} />
            <LoiTruong loi={loi} truong="ngayCan" />
          </div>
          <div className="truong">
            <label htmlFor="dn-ghichu">Ghi chú</label>
            <input id="dn-ghichu" type="text" value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="phan-form">
        <h3>Hàng cần mua</h3>
        <OTimSanPham
          khiChon={themTuDanhMuc}
          nhan="Tìm sản phẩm để thêm vào đề nghị"
          goiY="Gõ mã SKU hoặc tên sản phẩm để thêm hàng…"
        />
        <div className="cuon-ngang">
          <table className="bang bang-hang">
            <thead>
              <tr>
                <th>Hàng</th>
                <th className="so" style={{ width: 90 }}>
                  SL
                </th>
                <th className="so" style={{ width: 140 }}>
                  Giá dự kiến
                </th>
                <th style={{ width: 180 }} className="an-tren-dt">
                  Nguồn gợi ý
                </th>
                <th style={{ width: 40 }}>
                  <span className="chi-doc-man-hinh">Xóa</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {dong.map((d, i) => (
                <tr key={d.khoa}>
                  <td>
                    <input
                      type="text"
                      aria-label={`Tên hàng dòng ${i + 1}`}
                      value={d.ten}
                      onChange={(e) => sua(i, { ten: e.target.value })}
                      placeholder="Tên hàng"
                    />
                    {d.sanPhamId && <div className="dong-phu phu">Lấy từ danh mục sản phẩm</div>}
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="phai"
                      aria-label={`Số lượng dòng ${i + 1}`}
                      value={d.soLuong}
                      onChange={(e) => sua(i, { soLuong: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="phai"
                      aria-label={`Giá dự kiến dòng ${i + 1}`}
                      value={d.giaDuKien}
                      onChange={(e) => sua(i, { giaDuKien: dinhDangNhapTien(e.target.value) })}
                    />
                  </td>
                  <td className="an-tren-dt">
                    <select
                      aria-label={`Nhà cung cấp gợi ý dòng ${i + 1}`}
                      value={d.nhaCungCapId}
                      onChange={(e) => sua(i, { nhaCungCapId: e.target.value })}
                    >
                      <option value="">— Chưa chọn —</option>
                      {nhaCungCap.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.ten}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="nut trong nho"
                      aria-label={`Xóa dòng ${i + 1}`}
                      onClick={() => datDong((c) => (c.length > 1 ? c.filter((_, j) => j !== i) : c))}
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="hang-nhap" style={{ marginTop: 10, justifyContent: "space-between" }}>
          <button type="button" className="nut" onClick={() => datDong((c) => [...c, dongTrong()])}>
            Thêm dòng
          </button>
          <strong>Tổng dự kiến: {dinhDangTien(tongDuKien)}</strong>
        </div>
      </div>

      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.push("/mua-hang/de-nghi")} disabled={dangGui}>
          Hủy
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui || hopLe.length === 0}>
          {dangGui ? "Đang lập…" : "Lập đề nghị"}
        </button>
      </div>
      {hopLe.length === 0 && (
        <p className="goi-y" style={{ padding: "0 16px 14px" }}>
          Cần ít nhất một dòng có tên hàng và số lượng lớn hơn 0.
        </p>
      )}
    </form>
  );
}
