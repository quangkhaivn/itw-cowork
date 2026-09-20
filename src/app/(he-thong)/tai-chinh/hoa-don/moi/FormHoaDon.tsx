"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import ChonKhachHang, { type KhachDaChon } from "@/components/crm/ChonKhachHang";
import { dinhDangNhapTien, dinhDangTien } from "@/lib/dinh-dang";

interface DonGoiY {
  id: string;
  so: string;
  trangThai: string;
  tongCong: string;
}

interface DongTay {
  khoa: string;
  ten: string;
  soLuong: string;
  donGia: string;
  vat: string;
  giaVon: string;
}

let dem = 0;
function dongTrong(): DongTay {
  dem += 1;
  return { khoa: `hd${Date.now().toString(36)}-${dem}`, ten: "", soLuong: "1", donGia: "", vat: "10", giaVon: "0" };
}

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

/**
 * Lập hóa đơn. Hai đường: **từ đơn hàng** (chép nguyên dòng và số tiền — cách nên dùng),
 * hoặc nhập tay cho khoản lẻ không đi từ đơn (phí triển khai, phí dịch vụ).
 */
export default function FormHoaDon({ khachBanDau, donBanDau }: { khachBanDau: KhachDaChon | null; donBanDau: DonGoiY | null }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [cach, datCach] = useState<"tu-don" | "nhap-tay">(donBanDau ? "tu-don" : "tu-don");
  const [khach, datKhach] = useState<KhachDaChon | null>(khachBanDau);
  const [don, datDon] = useState<DonGoiY | null>(donBanDau);
  const [dsDon, datDsDon] = useState<DonGoiY[]>(donBanDau ? [donBanDau] : []);
  const [ghiChu, datGhiChu] = useState("");
  const [dong, datDong] = useState<DongTay[]>([dongTrong()]);

  const khachId = khach?.id;
  useEffect(() => {
    if (!khachId || donBanDau) return;
    const huy = new AbortController();
    fetch(`/api/v1/don-hang?khachHang=${khachId}&trangThai=tat-ca&coTrang=50`, { signal: huy.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        datDsDon(
          (d.dong ?? [])
            .filter((x: { trangThai: string }) => x.trangThai !== "DRAFT" && x.trangThai !== "CANCELLED")
            .map((x: { id: string; so: string; trangThai: string; tongCong: string }) => ({ id: x.id, so: x.so, trangThai: x.trangThai, tongCong: x.tongCong })),
        );
      })
      .catch(() => {});
    return () => huy.abort();
  }, [khachId, donBanDau]);

  const sua = (i: number, thay: Partial<DongTay>) => datDong((c) => c.map((d, j) => (j === i ? { ...d, ...thay } : d)));

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const than =
      cach === "tu-don"
        ? { donHangId: don?.id ?? "", ghiChu }
        : {
            khachHangId: khach?.id ?? "",
            ghiChu,
            dong: dong
              .filter((d) => d.ten.trim().length >= 2)
              .map((d) => ({
                ten: d.ten,
                soLuong: d.soLuong,
                donGia: d.donGia || "0",
                vat: Number(d.vat || 0),
                giaVon: d.giaVon || "0",
              })),
          };
    const kq = await goi<{ id: string }>("/api/v1/hoa-don", "POST", than);
    if (kq) router.push(`/tai-chinh/hoa-don/${kq.id}?moTao=1`);
  }

  const thieu = cach === "tu-don" ? !don : !khach || dong.filter((d) => d.ten.trim().length >= 2).length === 0;

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
        <h3>Lập hóa đơn cho ai</h3>
        <div className="luoi-form">
          <div className="truong ca-dong">
            <label htmlFor="hd-khach">
              Khách hàng <span className="bat-buoc">*</span>
            </label>
            {donBanDau ? (
              <input id="hd-khach" type="text" readOnly value={`${khach?.ten ?? ""} (${khach?.ma ?? ""})`} />
            ) : (
              <ChonKhachHang id="hd-khach" giaTri={khach} datGiaTri={(k) => { datKhach(k); datDon(null); }} loi={loiCua(loi, "khachHangId")} />
            )}
            <LoiTruong loi={loi} truong="khachHangId" />
          </div>
          <div className="truong ca-dong">
            <span className="chuoi-lua-chon">
              <label className="o-chon">
                <input type="radio" name="cach" checked={cach === "tu-don"} onChange={() => datCach("tu-don")} />
                <span>Từ đơn hàng (nên dùng)</span>
              </label>
              <label className="o-chon">
                <input type="radio" name="cach" checked={cach === "nhap-tay"} onChange={() => datCach("nhap-tay")} />
                <span>Nhập tay khoản lẻ</span>
              </label>
            </span>
          </div>
          {cach === "tu-don" && (
            <div className="truong ca-dong">
              <label htmlFor="hd-don">
                Đơn hàng <span className="bat-buoc">*</span>
              </label>
              {donBanDau ? (
                <input id="hd-don" type="text" readOnly value={donBanDau.so} />
              ) : (
                <select id="hd-don" value={don?.id ?? ""} onChange={(e) => datDon(dsDon.find((x) => x.id === e.target.value) ?? null)}>
                  <option value="">— Chọn đơn đã xác nhận —</option>
                  {dsDon.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.so} — {dinhDangTien(d.tongCong)}
                    </option>
                  ))}
                </select>
              )}
              <LoiTruong loi={loi} truong="donHangId" />
              <span className="goi-y">Dòng hàng và số tiền chép nguyên từ đơn; một đơn chỉ có một hóa đơn còn hiệu lực.</span>
            </div>
          )}
        </div>
      </div>

      {cach === "nhap-tay" && (
        <div className="phan-form">
          <h3>Nội dung hóa đơn</h3>
          <div className="cuon-ngang">
            <table className="bang bang-hang">
              <thead>
                <tr>
                  <th>Nội dung</th>
                  <th className="so" style={{ width: 90 }}>
                    SL
                  </th>
                  <th className="so" style={{ width: 140 }}>
                    Đơn giá
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
                      <input type="text" aria-label={`Nội dung dòng ${i + 1}`} value={d.ten} onChange={(e) => sua(i, { ten: e.target.value })} placeholder="Ví dụ: phí triển khai tại chỗ" />
                    </td>
                    <td>
                      <input type="text" inputMode="decimal" className="phai" aria-label={`Số lượng dòng ${i + 1}`} value={d.soLuong} onChange={(e) => sua(i, { soLuong: e.target.value })} />
                    </td>
                    <td>
                      <input type="text" inputMode="numeric" className="phai" aria-label={`Đơn giá dòng ${i + 1}`} value={d.donGia} onChange={(e) => sua(i, { donGia: dinhDangNhapTien(e.target.value) })} />
                    </td>
                    <td>
                      <input type="number" min={0} max={100} className="phai" aria-label={`VAT dòng ${i + 1}`} value={d.vat} onChange={(e) => sua(i, { vat: e.target.value })} />
                    </td>
                    <td>
                      <button type="button" className="nut trong nho" aria-label={`Xóa dòng ${i + 1}`} onClick={() => datDong((c) => c.filter((_, j) => j !== i))}>
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hang-nhap" style={{ marginTop: 10 }}>
            <button type="button" className="nut" onClick={() => datDong((c) => [...c, dongTrong()])}>
              Thêm dòng
            </button>
          </div>
        </div>
      )}

      <div className="phan-form">
        <div className="truong">
          <label htmlFor="hd-ghichu">Ghi chú</label>
          <input id="hd-ghichu" type="text" value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} />
        </div>
      </div>

      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.push("/tai-chinh/hoa-don")}>
          Hủy
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui || thieu}>
          {dangGui ? "Đang lập…" : "Lập hóa đơn"}
        </button>
      </div>
      {thieu && <p className="goi-y" style={{ padding: "0 16px 14px" }}>{cach === "tu-don" ? "Chọn khách hàng và đơn hàng đã xác nhận." : "Chọn khách hàng và nhập ít nhất một dòng."}</p>}
    </form>
  );
}
