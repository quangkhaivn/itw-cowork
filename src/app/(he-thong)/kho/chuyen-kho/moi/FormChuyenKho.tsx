"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import OTimSanPham, { type GoiYSanPham } from "@/components/san-pham/OTimSanPham";

interface Dong {
  khoa: string;
  sanPhamId: string;
  ten: string;
  donViTinh: string;
  soLuong: string;
  serial: string;
  ghiChu: string;
}

let dem = 0;
function dongTrong(): Dong {
  dem += 1;
  return {
    khoa: `ck${Date.now().toString(36)}-${dem}`,
    sanPhamId: "",
    ten: "",
    donViTinh: "",
    soLuong: "1",
    serial: "",
    ghiChu: "",
  };
}

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

const soThuan = (s: string) => s.replace(/\./g, "").replace(",", ".");
const tachSerial = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Lập phiếu chuyển kho. Chỉ chọn được hàng có trong danh mục — chuyển kho là điều
 * hàng đã có, không phải nhập hàng mới, nên không cho gõ tay tên hàng lạ.
 */
export default function FormChuyenKho({
  kho,
  khoNguonMacDinh,
}: {
  kho: { id: string; ten: string; macDinh: boolean }[];
  khoNguonMacDinh: string;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [khoNguonId, datKhoNguonId] = useState(khoNguonMacDinh);
  const [khoDichId, datKhoDichId] = useState(kho.find((k) => k.id !== khoNguonMacDinh)?.id ?? "");
  const [ngayChuyen, datNgayChuyen] = useState("");
  const [lyDo, datLyDo] = useState("");
  const [ghiChu, datGhiChu] = useState("");
  const [dong, datDong] = useState<Dong[]>([dongTrong()]);

  const sua = (i: number, thay: Partial<Dong>) => datDong((c) => c.map((d, j) => (j === i ? { ...d, ...thay } : d)));

  function themTuDanhMuc(g: GoiYSanPham) {
    datDong((c) => [
      ...c.filter((d) => d.sanPhamId),
      { ...dongTrong(), sanPhamId: g.id, ten: `${g.ten}${g.sku ? ` (${g.sku})` : ""}`, donViTinh: g.donViTinh ?? "" },
    ]);
  }

  const hopLe = dong.filter((d) => d.sanPhamId && Number(soThuan(d.soLuong)) > 0);
  const trungKho = Boolean(khoNguonId) && khoNguonId === khoDichId;

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ id: string }>("/api/v1/chuyen-kho", "POST", {
      khoNguonId,
      khoDichId,
      ngayChuyen,
      lyDo,
      ghiChu,
      dong: hopLe.map((d) => ({
        sanPhamId: d.sanPhamId,
        soLuong: soThuan(d.soLuong),
        serial: tachSerial(d.serial),
        ghiChu: d.ghiChu,
      })),
    });
    if (kq) router.push(`/kho/chuyen-kho/${kq.id}?moTao=1`);
  }

  const thieu = !khoNguonId || !khoDichId || trungKho || lyDo.trim().length < 2 || hopLe.length === 0;

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
        <h3>Từ kho nào sang kho nào</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="ck-nguon">
              Kho xuất <span className="bat-buoc">*</span>
            </label>
            <select id="ck-nguon" value={khoNguonId} onChange={(e) => datKhoNguonId(e.target.value)}>
              {kho.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ten}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="khoNguonId" />
          </div>
          <div className="truong">
            <label htmlFor="ck-dich">
              Kho nhận <span className="bat-buoc">*</span>
            </label>
            <select id="ck-dich" value={khoDichId} onChange={(e) => datKhoDichId(e.target.value)}>
              <option value="">— Chọn kho nhận —</option>
              {kho.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ten}
                </option>
              ))}
            </select>
            {trungKho && <span className="loi-truong">Kho nhận phải khác kho xuất.</span>}
            <LoiTruong loi={loi} truong="khoDichId" />
          </div>
          <div className="truong">
            <label htmlFor="ck-ngay">Ngày chuyển</label>
            <input id="ck-ngay" type="date" value={ngayChuyen} onChange={(e) => datNgayChuyen(e.target.value)} />
            <LoiTruong loi={loi} truong="ngayChuyen" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="ck-lydo">
              Vì sao chuyển <span className="bat-buoc">*</span>
            </label>
            <input
              id="ck-lydo"
              type="text"
              value={lyDo}
              onChange={(e) => datLyDo(e.target.value)}
              placeholder="Ví dụ: chi nhánh Thủ Đức hết bàn phím, điều 10 cái sang"
            />
            <LoiTruong loi={loi} truong="lyDo" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="ck-ghichu">Ghi chú</label>
            <input id="ck-ghichu" type="text" value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="phan-form">
        <h3>Hàng chuyển</h3>
        <OTimSanPham khiChon={themTuDanhMuc} nhan="Tìm sản phẩm để thêm vào phiếu chuyển" />

        <div className="cuon-ngang">
          <table className="bang bang-hang">
            <thead>
              <tr>
                <th>Hàng</th>
                <th className="so" style={{ width: 110 }}>
                  Số lượng
                </th>
                <th style={{ width: 240 }}>Sê-ri</th>
                <th style={{ width: 220 }}>Ghi chú</th>
                <th style={{ width: 40 }}>
                  <span className="chi-doc-man-hinh">Xóa</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {dong.map((d, i) => (
                <tr key={d.khoa}>
                  <td>
                    {d.sanPhamId ? (
                      <strong>{d.ten}</strong>
                    ) : (
                      <span className="phu">Chọn hàng ở ô tìm phía trên</span>
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Số lượng dòng ${i + 1}`}
                      value={d.soLuong}
                      onChange={(e) => sua(i, { soLuong: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      aria-label={`Sê-ri dòng ${i + 1}`}
                      value={d.serial}
                      onChange={(e) => sua(i, { serial: e.target.value })}
                      placeholder="Sê-ri, cách nhau bằng dấu phẩy"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      aria-label={`Ghi chú dòng ${i + 1}`}
                      value={d.ghiChu}
                      onChange={(e) => sua(i, { ghiChu: e.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="nut trong nho"
                      onClick={() => datDong((c) => (c.length === 1 ? [dongTrong()] : c.filter((_, j) => j !== i)))}
                      aria-label={`Xóa dòng ${i + 1}`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: "0 16px 16px" }}>
          <button type="button" className="nut trong nho" onClick={() => datDong((c) => [...c, dongTrong()])}>
            Thêm dòng
          </button>
        </div>
      </div>

      <div className="chan-form">
        <div className="tong-form">
          {hopLe.length} dòng hàng · lập xong ở trạng thái Nháp, hàng chưa đi
        </div>
        <button className="nut chinh" type="submit" disabled={dangGui || thieu}>
          {dangGui ? "Đang lưu…" : "Lập phiếu chuyển"}
        </button>
      </div>
    </form>
  );
}
