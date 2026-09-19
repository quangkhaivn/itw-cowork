"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import DanhSachTrung, { type UngVienTrung } from "@/components/crm/DanhSachTrung";
import ONhapTien, { dinhDangNhapTien } from "@/components/crm/ONhapTien";

export interface GiaTriLead {
  id?: string;
  hoTen: string;
  congTy: string;
  chucDanh: string;
  dienThoai: string;
  email: string;
  maSoThue: string;
  nguon: string;
  nhuCau: string;
  giaTriUocTinh: string;
  nguoiPhuTrachId: string;
  ghiChu: string;
  giaiDoan?: string;
}

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

/** Form tạo / sửa lead. Dò trùng với khách hàng, liên hệ và lead đang mở ngay khi rời ô (LD-03). */
export default function FormLead({
  banDau,
  nguon,
  nguoiPhuTrach,
}: {
  banDau: GiaTriLead;
  nguon: { ma: string; ten: string }[];
  nguoiPhuTrach: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const laTaoMoi = !banDau.id;
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState({ ...banDau, giaTriUocTinh: dinhDangNhapTien(banDau.giaTriUocTinh) });
  const [ungVien, datUngVien] = useState<UngVienTrung[]>([]);
  const [xacNhan, datXacNhan] = useState(false);
  const [daLuu, datDaLuu] = useState(false);
  const dat = <K extends keyof GiaTriLead>(k: K, v: GiaTriLead[K]) => {
    datGt((c) => ({ ...c, [k]: v }));
    datDaLuu(false);
  };

  async function doTrung() {
    if (!gt.dienThoai.trim() && !gt.email.trim() && !gt.maSoThue.trim() && !gt.congTy.trim()) return;
    const q = new URLSearchParams({ congTy: gt.congTy, maSoThue: gt.maSoThue, dienThoai: gt.dienThoai, email: gt.email, boQuaId: banDau.id ?? "" });
    try {
      const r = await fetch(`/api/v1/lead/do-trung?${q.toString()}`);
      if (r.ok) {
        datUngVien((await r.json()).ungVien ?? []);
        datXacNhan(false);
      }
    } catch {
      // Tiện ích; máy chủ kiểm lại khi lưu.
    }
  }

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const than = { ...gt, id: undefined, giaTriUocTinh: gt.giaTriUocTinh || null, xacNhanKhongTrung: xacNhan };
    if (laTaoMoi) {
      const kq = await goi<{ id: string }>("/api/v1/lead", "POST", than);
      if (kq) router.push(`/crm/lead/${kq.id}?moTao=1`);
    } else {
      const kq = await goi(`/api/v1/lead/${banDau.id}`, "PATCH", { ...than, giaiDoan: undefined });
      if (kq) {
        datDaLuu(true);
        datUngVien([]);
        router.refresh();
      }
    }
  }

  const uvTuLoi = (loi?.chiTiet as { ungVien?: UngVienTrung[] } | undefined)?.ungVien;
  const dsHien = uvTuLoi?.length ? uvTuLoi : ungVien;
  const aria = (t: string) => (loiCua(loi, t) ? { "aria-invalid": true as const } : {});
  const o = (k: keyof GiaTriLead, nhan: string, kieu = "text", doTrungKhiRoi = false, batBuoc = false) => (
    <div className="truong">
      <label htmlFor={`ld-${k}`}>
        {nhan} {batBuoc && <span className="bat-buoc">*</span>}
      </label>
      <input
        id={`ld-${k}`}
        type={kieu}
        value={gt[k] as string}
        onChange={(e) => dat(k, e.target.value)}
        onBlur={doTrungKhiRoi ? doTrung : undefined}
        {...aria(k)}
      />
      <LoiTruong loi={loi} truong={k} />
    </div>
  );

  return (
    <form className="the" onSubmit={gui} noValidate>
      <div style={{ padding: "16px 16px 0" }}>
        {loi && loi.ma !== "co-the-trung" && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
        {daLuu && <div className="hop-thong-bao tot" role="status">Đã lưu thay đổi.</div>}
        <DanhSachTrung ungVien={dsHien} tieuDe="Thông tin này đã có trong hệ thống" />
        {dsHien.length > 0 && (
          <label className="o-chon" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={xacNhan} onChange={(e) => datXacNhan(e.target.checked)} />
            <span>
              Tôi đã kiểm tra — đây là lead mới, vẫn lưu.
              <small>Nếu là khách cũ quay lại, hãy ghi tương tác / tạo cơ hội trên khách đó thay vì tạo lead.</small>
            </span>
          </label>
        )}
      </div>

      <div className="phan-form">
        <h3>Người liên hệ</h3>
        <div className="luoi-form">
          {o("hoTen", "Họ tên", "text", false, true)}
          {o("chucDanh", "Chức danh")}
          {o("dienThoai", "Điện thoại", "tel", true)}
          {o("email", "Email", "email", true)}
        </div>
        <p className="goi-y" style={{ margin: 0 }}>Cần ít nhất điện thoại hoặc email để liên lạc lại.</p>
      </div>

      <div className="phan-form">
        <h3>Doanh nghiệp và nhu cầu</h3>
        <div className="luoi-form">
          {o("congTy", "Công ty", "text", true)}
          {o("maSoThue", "Mã số thuế", "text", true)}
          <div className="truong">
            <label htmlFor="ld-nguon">Nguồn</label>
            <select id="ld-nguon" value={gt.nguon} onChange={(e) => dat("nguon", e.target.value)} {...aria("nguon")}>
              <option value="">— Chưa chọn —</option>
              {nguon.map((n) => (
                <option key={n.ma} value={n.ma}>
                  {n.ten}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="nguon" />
          </div>
          <div className="truong">
            <label htmlFor="ld-giatri">Giá trị ước tính</label>
            <ONhapTien id="ld-giatri" giaTri={gt.giaTriUocTinh} datGiaTri={(v) => dat("giaTriUocTinh", v)} />
            <LoiTruong loi={loi} truong="giaTriUocTinh" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="ld-nhucau">Nhu cầu</label>
            <textarea id="ld-nhucau" rows={3} value={gt.nhuCau} onChange={(e) => dat("nhuCau", e.target.value)} placeholder="Ví dụ: 20 PC văn phòng, ngân sách khoảng 12 triệu/máy" />
          </div>
          <div className="truong">
            <label htmlFor="ld-phutrach">Người phụ trách</label>
            <select id="ld-phutrach" value={gt.nguoiPhuTrachId} onChange={(e) => dat("nguoiPhuTrachId", e.target.value)} {...aria("nguoiPhuTrachId")}>
              {nguoiPhuTrach.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.fullName}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="nguoiPhuTrachId" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="ld-ghichu">Ghi chú</label>
            <textarea id="ld-ghichu" rows={2} value={gt.ghiChu} onChange={(e) => dat("ghiChu", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.push(laTaoMoi ? "/crm/lead" : `/crm/lead/${banDau.id}`)}>
          {laTaoMoi ? "Hủy" : "Về lead"}
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui || gt.hoTen.trim().length < 2 || (dsHien.length > 0 && !xacNhan)}>
          {dangGui ? "Đang lưu…" : laTaoMoi ? "Tạo lead" : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}
