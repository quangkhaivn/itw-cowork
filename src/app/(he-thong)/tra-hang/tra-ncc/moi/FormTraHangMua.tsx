"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import OTimSanPham, { type GoiYSanPham } from "@/components/san-pham/OTimSanPham";
import { dinhDangNhapTien, dinhDangTien } from "@/lib/dinh-dang";
import { tinhDonMua } from "@/modules/mua-hang/tinh-toan";

export interface DongGoiYMua {
  dongDonId: string;
  sanPhamId: string | null;
  ten: string;
  donViTinh: string | null;
  donGia: string;
  vat: string;
  conTraDuoc: number;
}

interface Dong {
  khoa: string;
  dongDonId: string;
  sanPhamId: string;
  ten: string;
  soLuong: string;
  donViTinh: string;
  donGia: string;
  vat: string;
  serial: string;
  ghiChu: string;
  conTraDuoc: number | null;
}

let dem = 0;
function dongTrong(): Dong {
  dem += 1;
  return {
    khoa: `tm${Date.now().toString(36)}-${dem}`,
    dongDonId: "",
    sanPhamId: "",
    ten: "",
    soLuong: "1",
    donViTinh: "",
    donGia: "",
    vat: "10",
    serial: "",
    ghiChu: "",
    conTraDuoc: null,
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
 * Lập phiếu trả hàng cho nhà cung cấp. Mở từ một đơn mua thì các dòng còn trả được
 * nằm sẵn kèm số lượng tối đa — đã trừ phần đã trả ở các phiếu trước.
 */
export default function FormTraHangMua({
  kho,
  nhaCungCap,
  don,
  nccTuDon,
  dongGoiY,
}: {
  kho: { id: string; ten: string; macDinh: boolean }[];
  nhaCungCap: { id: string; ten: string }[];
  don: { id: string; so: string; khoId: string } | null;
  nccTuDon: { id: string; ten: string } | null;
  dongGoiY: DongGoiYMua[];
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [nhaCungCapId, datNhaCungCapId] = useState(nccTuDon?.id ?? "");
  const [khoId, datKhoId] = useState(don?.khoId ?? kho.find((k) => k.macDinh)?.id ?? kho[0]?.id ?? "");
  const [ngayTra, datNgayTra] = useState("");
  const [lyDo, datLyDo] = useState("");
  const [ghiChu, datGhiChu] = useState("");
  const [dong, datDong] = useState<Dong[]>(
    dongGoiY.length > 0
      ? dongGoiY.map((d, i) => ({
          ...dongTrong(),
          khoa: `goi-y-${i}`,
          dongDonId: d.dongDonId,
          sanPhamId: d.sanPhamId ?? "",
          ten: d.ten,
          soLuong: String(d.conTraDuoc),
          donViTinh: d.donViTinh ?? "",
          donGia: dinhDangNhapTien(d.donGia),
          vat: d.vat,
          conTraDuoc: d.conTraDuoc,
        }))
      : [dongTrong()],
  );

  const sua = (i: number, thay: Partial<Dong>) => datDong((c) => c.map((d, j) => (j === i ? { ...d, ...thay } : d)));

  function themTuDanhMuc(g: GoiYSanPham) {
    datDong((c) => [
      ...c.filter((d) => d.ten.trim().length > 0),
      {
        ...dongTrong(),
        sanPhamId: g.id,
        ten: g.ten,
        donViTinh: g.donViTinh ?? "",
        donGia: dinhDangNhapTien(g.giaVon ?? ""),
        vat: g.vat ?? "10",
      },
    ]);
  }

  const hopLe = dong.filter((d) => d.ten.trim().length >= 2 && Number(soThuan(d.soLuong)) > 0);
  const tong = tinhDonMua(hopLe.map((d) => ({ soLuong: soThuan(d.soLuong), donGia: soThuan(d.donGia), vat: d.vat })));
  const vuotSoLuong = hopLe.filter((d) => d.conTraDuoc !== null && Number(soThuan(d.soLuong)) > d.conTraDuoc);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ id: string }>("/api/v1/tra-hang-mua", "POST", {
      nhaCungCapId,
      donMuaId: don?.id ?? "",
      khoId,
      ngayTra,
      lyDo,
      ghiChu,
      dong: hopLe.map((d) => ({
        dongDonId: d.dongDonId,
        sanPhamId: d.sanPhamId,
        ten: d.ten,
        soLuong: soThuan(d.soLuong),
        donViTinh: d.donViTinh,
        donGia: d.donGia || "0",
        vat: Number(d.vat || 0),
        serial: tachSerial(d.serial),
        ghiChu: d.ghiChu,
      })),
    });
    if (kq) router.push(`/tra-hang/tra-ncc/${kq.id}?moTao=1`);
  }

  const thieu = !nhaCungCapId || !khoId || lyDo.trim().length < 2 || hopLe.length === 0 || vuotSoLuong.length > 0;

  return (
    <form className="the" onSubmit={gui} noValidate>
      {loi && (
        <div style={{ padding: "16px 16px 0" }}>
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
          </div>
        </div>
      )}

      {don && (
        <div style={{ padding: "16px 16px 0" }}>
          <div className="hop-thong-bao" role="status">
            Theo đơn mua <strong>{don.so}</strong> của {nccTuDon?.ten}. Số lượng điền sẵn là phần <strong>còn trả
            được</strong> — đã trừ những gì đã trả ở các phiếu trước.
          </div>
        </div>
      )}

      <div className="phan-form">
        <h3>Trả cho ai, xuất từ kho nào</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="tm-ncc">
              Nhà cung cấp <span className="bat-buoc">*</span>
            </label>
            {nccTuDon ? (
              <input id="tm-ncc" type="text" value={nccTuDon.ten} readOnly />
            ) : (
              <select id="tm-ncc" value={nhaCungCapId} onChange={(e) => datNhaCungCapId(e.target.value)}>
                <option value="">— Chọn nhà cung cấp —</option>
                {nhaCungCap.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.ten}
                  </option>
                ))}
              </select>
            )}
            <LoiTruong loi={loi} truong="nhaCungCapId" />
          </div>
          <div className="truong">
            <label htmlFor="tm-kho">
              Kho xuất hàng <span className="bat-buoc">*</span>
            </label>
            <select id="tm-kho" value={khoId} onChange={(e) => datKhoId(e.target.value)}>
              {kho.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ten}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="khoId" />
          </div>
          <div className="truong">
            <label htmlFor="tm-ngay">Ngày trả</label>
            <input id="tm-ngay" type="date" value={ngayTra} onChange={(e) => datNgayTra(e.target.value)} />
            <LoiTruong loi={loi} truong="ngayTra" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="tm-lydo">
              Vì sao trả <span className="bat-buoc">*</span>
            </label>
            <input
              id="tm-lydo"
              type="text"
              value={lyDo}
              onChange={(e) => datLyDo(e.target.value)}
              placeholder="Ví dụ: 2 cái chết nút cuộn ngay khi mở hộp / giao sai model"
            />
            <LoiTruong loi={loi} truong="lyDo" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="tm-ghichu">Ghi chú</label>
            <input id="tm-ghichu" type="text" value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="phan-form">
        <h3>Hàng gửi trả</h3>
        {!don && <OTimSanPham khiChon={themTuDanhMuc} nhan="Tìm sản phẩm để thêm vào phiếu" />}

        <div className="cuon-ngang">
          <table className="bang bang-hang">
            <thead>
              <tr>
                <th>Hàng</th>
                <th className="so" style={{ width: 90 }}>
                  SL
                </th>
                <th className="so" style={{ width: 130 }}>
                  Đơn giá
                </th>
                <th className="so" style={{ width: 80 }}>
                  VAT %
                </th>
                <th style={{ width: 220 }}>Sê-ri</th>
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
                    {d.conTraDuoc !== null && <div className="dong-phu phu">Còn trả được {d.conTraDuoc}</div>}
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Số lượng dòng ${i + 1}`}
                      value={d.soLuong}
                      onChange={(e) => sua(i, { soLuong: e.target.value })}
                      className={d.conTraDuoc !== null && Number(soThuan(d.soLuong)) > d.conTraDuoc ? "loi" : undefined}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={`Đơn giá dòng ${i + 1}`}
                      value={d.donGia}
                      onChange={(e) => sua(i, { donGia: dinhDangNhapTien(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={`VAT dòng ${i + 1}`}
                      value={d.vat}
                      onChange={(e) => sua(i, { vat: e.target.value })}
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

        {vuotSoLuong.length > 0 && (
          <div style={{ padding: "0 16px 16px" }}>
            <div className="hop-thong-bao loi" role="alert">
              Có dòng trả quá phần đơn mua đã nhận: {vuotSoLuong.map((d) => d.ten).join(", ")}.
            </div>
          </div>
        )}
      </div>

      <div className="chan-form">
        <div className="tong-form">
          Tạm tính {dinhDangTien(tong.tamTinh)} · VAT {dinhDangTien(tong.tongVat)} ·{" "}
          <strong>Tổng {dinhDangTien(tong.tongCong)}</strong>
        </div>
        <button className="nut chinh" type="submit" disabled={dangGui || thieu}>
          {dangGui ? "Đang lưu…" : "Lập phiếu"}
        </button>
      </div>
    </form>
  );
}
