"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import BieuTuong from "@/components/ui/BieuTuong";
import TrongRong from "@/components/ui/TrongRong";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";

interface LienHe {
  id: string;
  hoTen: string;
  chucDanh: string | null;
  phongBan: string | null;
  dienThoai: string | null;
  email: string | null;
  zalo: string | null;
  laChinh: boolean;
  ghiChu: string | null;
  trangThai: string;
}

const RONG = { hoTen: "", chucDanh: "", phongBan: "", dienThoai: "", email: "", zalo: "", laChinh: false, ghiChu: "", trangThai: "hoat-dong" };

/** Bảng liên hệ của một khách hàng + hộp thoại thêm / sửa. Liên hệ không xóa — đặt "ngừng". */
export default function QuanLyLienHe({ khachHangId, lienHe, duocSua }: { khachHangId: string; lienHe: LienHe[]; duocSua: boolean }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [dangSua, datDangSua] = useState<string | null>(null);
  const [gt, datGt] = useState(RONG);

  function mo(l?: LienHe) {
    datLoi(null);
    datDangSua(l?.id ?? null);
    datGt(
      l
        ? {
            hoTen: l.hoTen,
            chucDanh: l.chucDanh ?? "",
            phongBan: l.phongBan ?? "",
            dienThoai: l.dienThoai ?? "",
            email: l.email ?? "",
            zalo: l.zalo ?? "",
            laChinh: l.laChinh,
            ghiChu: l.ghiChu ?? "",
            trangThai: l.trangThai,
          }
        : { ...RONG, laChinh: lienHe.length === 0 },
    );
    hop.current?.showModal();
  }

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = dangSua
      ? await goi(`/api/v1/lien-he/${dangSua}`, "PATCH", gt)
      : await goi(`/api/v1/khach-hang/${khachHangId}/lien-he`, "POST", { ...gt, trangThai: undefined });
    if (kq) {
      hop.current?.close();
      router.refresh();
    }
  }

  const o = (k: keyof typeof RONG, nhan: string, kieu = "text", batBuoc = false) => (
    <div className="truong">
      <label htmlFor={`lh-${k}`}>
        {nhan} {batBuoc && <span className="bat-buoc">*</span>}
      </label>
      <input
        id={`lh-${k}`}
        type={kieu}
        value={gt[k] as string}
        onChange={(e) => datGt({ ...gt, [k]: e.target.value })}
        aria-invalid={loiCua(loi, k) ? true : undefined}
      />
      {loiCua(loi, k) && <span className="loi-truong">{loiCua(loi, k)}</span>}
    </div>
  );

  return (
    <section className="the">
      <div className="dau">
        <h2>Người liên hệ</h2>
        {duocSua && (
          <button className="nut nho" onClick={() => mo()}>
            <BieuTuong ten="them" co={14} /> Thêm liên hệ
          </button>
        )}
      </div>
      {lienHe.length === 0 ? (
        <TrongRong tieuDe="Chưa có người liên hệ">{duocSua ? "Thêm người mua hàng, kế toán, kỹ thuật phía khách." : null}</TrongRong>
      ) : (
        <div className="cuon-ngang">
          <table className="bang">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Điện thoại · Zalo</th>
                <th>Email</th>
                {duocSua && <th />}
              </tr>
            </thead>
            <tbody>
              {lienHe.map((l) => (
                <tr key={l.id} className={l.trangThai !== "hoat-dong" ? "mo" : undefined}>
                  <td>
                    {l.hoTen} {l.laChinh && <span className="huy-hieu chinh">Liên hệ chính</span>}
                    {l.trangThai !== "hoat-dong" && <span className="huy-hieu">Ngừng</span>}
                    <div className="dong-phu">{[l.chucDanh, l.phongBan].filter(Boolean).join(" · ") || "—"}</div>
                  </td>
                  <td>
                    {l.dienThoai ? <a href={`tel:${l.dienThoai.replace(/\s/g, "")}`}>{l.dienThoai}</a> : <span className="mo">—</span>}
                    {l.zalo && <div className="dong-phu">Zalo: {l.zalo}</div>}
                  </td>
                  <td>{l.email ? <a href={`mailto:${l.email}`}>{l.email}</a> : <span className="mo">—</span>}</td>
                  {duocSua && (
                    <td style={{ textAlign: "right" }}>
                      <button className="nut nho" onClick={() => mo(l)}>
                        Sửa
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <HopThoai ref={hop} tieuDe={dangSua ? "Sửa người liên hệ" : "Thêm người liên hệ"} rong={600}>
        <form onSubmit={gui} noValidate>
          <div className="than">
            {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
            <div className="luoi-form">
              {o("hoTen", "Họ tên", "text", true)}
              {o("chucDanh", "Chức danh")}
              {o("dienThoai", "Điện thoại", "tel")}
              {o("email", "Email", "email")}
              {o("zalo", "Zalo")}
              {o("phongBan", "Bộ phận")}
            </div>
            <div className="truong">
              <label htmlFor="lh-ghichu">Ghi chú</label>
              <textarea id="lh-ghichu" rows={2} value={gt.ghiChu} onChange={(e) => datGt({ ...gt, ghiChu: e.target.value })} />
            </div>
            <label className="o-chon" style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={gt.laChinh} onChange={(e) => datGt({ ...gt, laChinh: e.target.checked })} />
              <span>Liên hệ chính của khách hàng</span>
            </label>
            {dangSua && (
              <label className="o-chon">
                <input
                  type="checkbox"
                  checked={gt.trangThai !== "hoat-dong"}
                  onChange={(e) => datGt({ ...gt, trangThai: e.target.checked ? "ngung-hoat-dong" : "hoat-dong" })}
                />
                <span>
                  Ngừng liên hệ
                  <small>Người này đã nghỉ hoặc không còn phụ trách. Lịch sử vẫn giữ.</small>
                </span>
              </label>
            )}
          </div>
          <div className="chan-form">
            <button type="button" className="nut" onClick={() => hop.current?.close()}>
              Hủy
            </button>
            <button type="submit" className="nut chinh" disabled={dangGui || gt.hoTen.trim().length < 2}>
              {dangGui ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </form>
      </HopThoai>
    </section>
  );
}
