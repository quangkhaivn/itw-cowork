"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import OTimSanPham, { type GoiYSanPham } from "@/components/san-pham/OTimSanPham";
import { dinhDangNhapTien, dinhDangTien } from "@/lib/dinh-dang";
import { tinhDonMua } from "@/modules/mua-hang/tinh-toan";

interface DongDeNghi {
  id: string;
  sanPhamId: string | null;
  ten: string;
  soLuong: string;
  donViTinh: string | null;
  giaDuKien: string;
}

interface Dong {
  khoa: string;
  deNghiDongId: string;
  sanPhamId: string;
  ten: string;
  soLuong: string;
  donViTinh: string;
  donGia: string;
  chietKhau: string;
  vat: string;
}

let dem = 0;
function dongTrong(): Dong {
  dem += 1;
  return {
    khoa: `dm${Date.now().toString(36)}-${dem}`,
    deNghiDongId: "",
    sanPhamId: "",
    ten: "",
    soLuong: "1",
    donViTinh: "",
    donGia: "",
    chietKhau: "0",
    vat: "10",
  };
}

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

/** Bỏ dấu chấm ngăn nghìn để gửi số thuần cho máy chủ. */
const soThuan = (s: string) => s.replace(/\./g, "").replace(",", ".");

/**
 * Lập đơn mua. Mở từ một đề nghị đã duyệt thì các dòng được chép sẵn sang, giá dự kiến
 * thành đơn giá — người mua chỉ sửa lại giá thật đã thương lượng với nhà cung cấp.
 */
export default function FormDonMua({
  nhaCungCap,
  kho,
  dieuKhoan,
  deNghi,
  dongDeNghi,
}: {
  nhaCungCap: { id: string; ten: string; dieuKhoanThanhToan: string | null }[];
  kho: { id: string; ten: string; macDinh: boolean }[];
  dieuKhoan: { ma: string; ten: string }[];
  deNghi: { id: string; so: string } | null;
  dongDeNghi: DongDeNghi[];
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [nhaCungCapId, datNhaCungCapId] = useState("");
  const [khoId, datKhoId] = useState(kho.find((k) => k.macDinh)?.id ?? kho[0]?.id ?? "");
  const [ngayHenGiao, datNgayHenGiao] = useState("");
  const [dieuKhoanThanhToan, datDieuKhoanThanhToan] = useState("");
  const [ghiChu, datGhiChu] = useState("");
  const [dong, datDong] = useState<Dong[]>(
    dongDeNghi.length > 0
      ? dongDeNghi.map((d, i) => ({
          khoa: `dn-${i}`,
          deNghiDongId: d.id,
          sanPhamId: d.sanPhamId ?? "",
          ten: d.ten,
          soLuong: d.soLuong,
          donViTinh: d.donViTinh ?? "",
          donGia: dinhDangNhapTien(d.giaDuKien),
          chietKhau: "0",
          vat: "10",
        }))
      : [dongTrong()],
  );

  const sua = (i: number, thay: Partial<Dong>) => datDong((c) => c.map((d, j) => (j === i ? { ...d, ...thay } : d)));

  function themTuDanhMuc(g: GoiYSanPham) {
    datDong((c) => [
      ...c.filter((d) => d.ten.trim().length > 0 || d.sanPhamId),
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

  function chonNhaCungCap(id: string) {
    datNhaCungCapId(id);
    const n = nhaCungCap.find((x) => x.id === id);
    // Điều khoản của nhà cung cấp là gợi ý; người dùng vẫn đổi được.
    if (n?.dieuKhoanThanhToan && !dieuKhoanThanhToan) datDieuKhoanThanhToan(n.dieuKhoanThanhToan);
  }

  const hopLe = dong.filter((d) => d.ten.trim().length >= 2 && Number(soThuan(d.soLuong)) > 0);
  const tong = tinhDonMua(
    hopLe.map((d) => ({ soLuong: soThuan(d.soLuong), donGia: soThuan(d.donGia), chietKhau: d.chietKhau, vat: d.vat })),
  );

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ id: string }>("/api/v1/don-mua", "POST", {
      nhaCungCapId,
      khoId,
      deNghiId: deNghi?.id ?? "",
      ngayHenGiao,
      dieuKhoanThanhToan,
      ghiChu,
      dong: hopLe.map((d) => ({
        deNghiDongId: d.deNghiDongId,
        sanPhamId: d.sanPhamId,
        ten: d.ten,
        soLuong: soThuan(d.soLuong),
        donViTinh: d.donViTinh,
        donGia: d.donGia || "0",
        chietKhau: Number(d.chietKhau || 0),
        vat: Number(d.vat || 0),
      })),
    });
    if (kq) router.push(`/mua-hang/don-mua/${kq.id}?moTao=1`);
  }

  const thieu = !nhaCungCapId || !khoId || hopLe.length === 0;

  return (
    <form className="the" onSubmit={gui} noValidate>
      {loi && (
        <div style={{ padding: "16px 16px 0" }}>
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
          </div>
        </div>
      )}

      {deNghi && (
        <div style={{ padding: "16px 16px 0" }}>
          <div className="hop-thong-bao" role="status">
            Chép từ đề nghị <strong>{deNghi.so}</strong>. Giá đang là giá dự kiến — sửa lại thành giá đã chốt với nhà cung cấp.
          </div>
        </div>
      )}

      <div className="phan-form">
        <h3>Mua của ai, nhận về đâu</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="dm-ncc">
              Nhà cung cấp <span className="bat-buoc">*</span>
            </label>
            <select id="dm-ncc" value={nhaCungCapId} onChange={(e) => chonNhaCungCap(e.target.value)}>
              <option value="">— Chọn nhà cung cấp —</option>
              {nhaCungCap.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.ten}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="nhaCungCapId" />
          </div>
          <div className="truong">
            <label htmlFor="dm-kho">
              Kho nhận hàng <span className="bat-buoc">*</span>
            </label>
            <select id="dm-kho" value={khoId} onChange={(e) => datKhoId(e.target.value)}>
              {kho.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ten}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="khoId" />
          </div>
          <div className="truong">
            <label htmlFor="dm-ngay">Hẹn giao ngày</label>
            <input id="dm-ngay" type="date" value={ngayHenGiao} onChange={(e) => datNgayHenGiao(e.target.value)} />
            <LoiTruong loi={loi} truong="ngayHenGiao" />
          </div>
          <div className="truong">
            <label htmlFor="dm-dk">Điều khoản thanh toán</label>
            <select id="dm-dk" value={dieuKhoanThanhToan} onChange={(e) => datDieuKhoanThanhToan(e.target.value)}>
              <option value="">— Chưa chọn —</option>
              {dieuKhoan.map((d) => (
                <option key={d.ma} value={d.ma}>
                  {d.ten}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="dieuKhoanThanhToan" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="dm-ghichu">Ghi chú</label>
            <input id="dm-ghichu" type="text" value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="phan-form">
        <h3>Hàng đặt mua</h3>
        <OTimSanPham khiChon={themTuDanhMuc} nhan="Tìm sản phẩm để thêm vào đơn mua" />
        <div className="cuon-ngang">
          <table className="bang bang-hang">
            <thead>
              <tr>
                <th>Hàng</th>
                <th className="so" style={{ width: 90 }}>
                  SL
                </th>
                <th className="so" style={{ width: 140 }}>
                  Đơn giá
                </th>
                <th className="so an-tren-dt" style={{ width: 80 }}>
                  CK %
                </th>
                <th className="so" style={{ width: 80 }}>
                  VAT %
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
                    {d.deNghiDongId && <div className="dong-phu phu">Từ đề nghị</div>}
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
                      aria-label={`Đơn giá dòng ${i + 1}`}
                      value={d.donGia}
                      onChange={(e) => sua(i, { donGia: dinhDangNhapTien(e.target.value) })}
                    />
                  </td>
                  <td className="an-tren-dt">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="phai"
                      aria-label={`Chiết khấu dòng ${i + 1}`}
                      value={d.chietKhau}
                      onChange={(e) => sua(i, { chietKhau: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="phai"
                      aria-label={`VAT dòng ${i + 1}`}
                      value={d.vat}
                      onChange={(e) => sua(i, { vat: e.target.value })}
                    />
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
          <div style={{ textAlign: "right" }}>
            <div className="nho phu">
              Tạm tính {dinhDangTien(tong.tamTinh)} · VAT {dinhDangTien(tong.tongVat)}
            </div>
            <strong>Tổng cộng: {dinhDangTien(tong.tongCong)}</strong>
          </div>
        </div>
      </div>

      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.push("/mua-hang/don-mua")} disabled={dangGui}>
          Hủy
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui || thieu}>
          {dangGui ? "Đang lập…" : "Lập đơn mua"}
        </button>
      </div>
      {thieu && (
        <p className="goi-y" style={{ padding: "0 16px 14px" }}>
          Cần nhà cung cấp, kho nhận hàng và ít nhất một dòng hàng.
        </p>
      )}
    </form>
  );
}
