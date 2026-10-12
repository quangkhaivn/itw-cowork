"use client";

import { useState } from "react";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";

const NHAN_CACH_CHIA: Record<string, string> = {
  "vong-tron": "chia vòng tròn",
  "nguoi-phu-trach-khach": "người phụ trách khách đã có (trùng khách)",
  "nguoi-phu-trach-lead": "người phụ trách lead cũ (trùng lead)",
  "phu-trach-chien-dich": "người phụ trách chiến dịch (chưa có danh sách chia)",
  "du-phong": "người nhập (chưa có danh sách chia, không có chiến dịch)",
  "chi-dinh": "người được chỉ định",
  "quan-tri": "Giám đốc / quản trị (không còn ai khác)",
};

interface KetQua {
  ketQua: "tao-moi" | "ghi-them";
  leadMa: string;
  cachChia: string;
  khachTrungId: string | null;
}

const TRONG = { hoTen: "", dienThoai: "", email: "", congTy: "", chucDanh: "", maSoThue: "", nhuCau: "", ghiChu: "", chienDichId: "", nguon: "" };

/** Nhập tay lead (hội thảo, danh thiếp…) — đi qua đúng `nhanLead()` như form và webhook. */
export default function FormNhapTay({ chienDich, nguon }: { chienDich: { id: string; ma: string; ten: string }[]; nguon: { ma: string; ten: string }[] }) {
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState(TRONG);
  const [dongY, datDongY] = useState(false);
  const [kq, datKq] = useState<KetQua | null>(null);
  const dat = (k: keyof typeof TRONG, v: string) => datGt((c) => ({ ...c, [k]: v }));

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const r = await goi<KetQua>("/api/v1/marketing/lead", "POST", { ...gt, chienDichId: gt.chienDichId || null, nguon: gt.nguon || null, dongYNhanTin: dongY });
    if (r) {
      datKq(r);
      datGt((c) => ({ ...TRONG, chienDichId: c.chienDichId, nguon: c.nguon }));
      datDongY(false);
    }
  }

  const o = (k: keyof typeof TRONG, nhan: string, kieu = "text", batBuoc = false) => (
    <div className="truong">
      <label htmlFor={`nt-${k}`}>
        {nhan} {batBuoc && <span className="bat-buoc">*</span>}
      </label>
      <input id={`nt-${k}`} type={kieu} value={gt[k]} onChange={(e) => dat(k, e.target.value)} aria-invalid={loiCua(loi, k) ? true : undefined} />
      {loiCua(loi, k) && <span className="loi-truong">{loiCua(loi, k)}</span>}
    </div>
  );

  return (
    <form className="the" onSubmit={gui} noValidate>
      <div className="phan-form">
        {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
        {kq && (
          <div className="hop-thong-bao tot" role="status">
            {kq.ketQua === "tao-moi" ? `Đã tạo lead ${kq.leadMa}` : `Trùng lead đang mở ${kq.leadMa} — đã ghi thêm vào lead đó`}, giao cho {NHAN_CACH_CHIA[kq.cachChia] ?? kq.cachChia}.
            {kq.khachTrungId && " Lưu ý: trùng một khách hàng đã có."}
          </div>
        )}
        <div className="luoi-form">
          {o("hoTen", "Họ tên", "text", true)}
          {o("chucDanh", "Chức danh")}
          {o("dienThoai", "Điện thoại", "tel")}
          {o("email", "Email", "email")}
          {o("congTy", "Công ty")}
          {o("maSoThue", "Mã số thuế")}
          <div className="truong">
            <label htmlFor="nt-cd">Chiến dịch</label>
            <select id="nt-cd" value={gt.chienDichId} onChange={(e) => dat("chienDichId", e.target.value)}>
              <option value="">— Không gắn —</option>
              {chienDich.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ma} — {c.ten}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="nt-nguon">Nguồn</label>
            <select id="nt-nguon" value={gt.nguon} onChange={(e) => dat("nguon", e.target.value)}>
              <option value="">— Chưa chọn —</option>
              {nguon.map((n) => (
                <option key={n.ma} value={n.ma}>
                  {n.ten}
                </option>
              ))}
            </select>
          </div>
          <div className="truong ca-dong">
            <label htmlFor="nt-nc">Nhu cầu</label>
            <textarea id="nt-nc" rows={3} value={gt.nhuCau} onChange={(e) => dat("nhuCau", e.target.value)} />
          </div>
        </div>
        <label className="o-chon">
          <input type="checkbox" checked={dongY} onChange={(e) => datDongY(e.target.checked)} />
          <span>
            Người này đã tự đồng ý nhận tin marketing
            <small>Chỉ tích khi có bằng chứng (ký phiếu đăng ký, đồng ý bằng lời có ghi âm…). Không tích hộ.</small>
          </span>
        </label>
        <p className="goi-y" style={{ marginTop: 10, marginBottom: 0 }}>Cần ít nhất điện thoại hoặc email.</p>
      </div>
      <div className="chan-form">
        <button type="submit" className="nut chinh" disabled={dangGui || gt.hoTen.trim().length < 2}>
          {dangGui ? "Đang lưu…" : "Nhận lead"}
        </button>
      </div>
    </form>
  );
}
