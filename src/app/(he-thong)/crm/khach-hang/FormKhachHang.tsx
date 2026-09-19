"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import DanhSachTrung, { type UngVienTrung } from "@/components/crm/DanhSachTrung";
import { NHAN_TRANG_THAI_KHACH, TRANG_THAI_KHACH } from "@/modules/crm/hang-so";

type LuaChon = Record<string, { ma: string; ten: string }[]>;

export interface GiaTriKhach {
  id?: string;
  ten: string;
  maSoThue: string;
  loaiKhach: string;
  phanKhuc: string;
  nganh: string;
  nguon: string;
  diaChi: string;
  tinhThanh: string;
  website: string;
  dienThoai: string;
  email: string;
  nguoiPhuTrachId: string;
  ghiChu: string;
  trangThai: string;
}

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

/**
 * Form tạo / sửa khách hàng. Dò trùng NGAY khi rời ô tên, MST, điện thoại, email (KH-03),
 * để nhân viên biết trước khi gõ hết form. Máy chủ vẫn kiểm lại lúc lưu.
 */
export default function FormKhachHang({
  banDau,
  luaChon,
  nguoiPhuTrach,
}: {
  banDau: GiaTriKhach;
  luaChon: LuaChon;
  nguoiPhuTrach: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const laTaoMoi = !banDau.id;
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState(banDau);
  const [lienHe, datLienHe] = useState({ hoTen: "", chucDanh: "", dienThoai: "", email: "" });
  const [ungVien, datUngVien] = useState<UngVienTrung[]>([]);
  const [xacNhan, datXacNhan] = useState(false);
  const [daLuu, datDaLuu] = useState(false);

  const dat = <K extends keyof GiaTriKhach>(k: K, v: GiaTriKhach[K]) => {
    datGt((c) => ({ ...c, [k]: v }));
    datDaLuu(false);
  };

  async function doTrung() {
    const q = new URLSearchParams({
      ten: gt.ten,
      maSoThue: gt.maSoThue,
      dienThoai: gt.dienThoai || lienHe.dienThoai,
      email: gt.email || lienHe.email,
      boQuaId: banDau.id ?? "",
    });
    if (!gt.ten.trim() && !gt.maSoThue.trim() && !gt.dienThoai.trim() && !gt.email.trim()) return;
    try {
      const r = await fetch(`/api/v1/khach-hang/do-trung?${q.toString()}`);
      if (r.ok) {
        const d = await r.json();
        datUngVien(d.ungVien ?? []);
        datXacNhan(false);
      }
    } catch {
      // Dò trùng là tiện ích; lỗi mạng ở đây không chặn nhập liệu — máy chủ kiểm lại khi lưu.
    }
  }

  const trungMst = ungVien.some((u) => u.lyDo.includes("Trùng mã số thuế"));

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const than = {
      ...gt,
      id: undefined,
      xacNhanKhongTrung: xacNhan,
      ...(laTaoMoi && lienHe.hoTen.trim() ? { lienHe } : {}),
    };
    if (laTaoMoi) {
      const kq = await goi<{ id: string }>("/api/v1/khach-hang", "POST", than);
      if (kq) router.push(`/crm/khach-hang/${kq.id}?moTao=1`);
    } else {
      const kq = await goi(`/api/v1/khach-hang/${banDau.id}`, "PATCH", than);
      if (kq) {
        datDaLuu(true);
        datUngVien([]);
        router.refresh();
      }
    }
  }

  // Máy chủ trả danh sách trùng kèm lỗi 409 → hiện ra để người dùng quyết.
  const uvTuLoi = (loi?.chiTiet as { ungVien?: UngVienTrung[] } | undefined)?.ungVien;
  const dsHien = uvTuLoi?.length ? uvTuLoi : ungVien;
  const canXacNhan = (loi?.ma === "co-the-trung" || (ungVien.length > 0 && !trungMst)) && loi?.ma !== "trung-ma-so-thue";
  const aria = (t: string) => (loiCua(loi, t) ? { "aria-invalid": true as const } : {});

  const chon = (id: string, nhan: string, loai: string, truong: keyof GiaTriKhach) => (
    <div className="truong">
      <label htmlFor={id}>{nhan}</label>
      <select id={id} value={gt[truong] as string} onChange={(e) => dat(truong, e.target.value)} {...aria(truong)}>
        <option value="">— Chưa chọn —</option>
        {(luaChon[loai] ?? []).map((m) => (
          <option key={m.ma} value={m.ma}>
            {m.ten}
          </option>
        ))}
        {/* Mã đã ngừng dùng nhưng bản ghi đang giữ: vẫn hiện để không mất giá trị khi lưu. */}
        {gt[truong] && !(luaChon[loai] ?? []).some((m) => m.ma === gt[truong]) && (
          <option value={gt[truong] as string}>{gt[truong] as string} (đã ngừng dùng)</option>
        )}
      </select>
      <LoiTruong loi={loi} truong={truong} />
    </div>
  );

  return (
    <form className="the" onSubmit={gui} noValidate>
      <div style={{ padding: "16px 16px 0" }}>
        {loi && loi.ma !== "co-the-trung" && (
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
          </div>
        )}
        {daLuu && (
          <div className="hop-thong-bao tot" role="status">
            Đã lưu thay đổi.
          </div>
        )}
        <DanhSachTrung ungVien={dsHien} chan={trungMst || loi?.ma === "trung-ma-so-thue"} />
        {canXacNhan && dsHien.length > 0 && (
          <label className="o-chon" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={xacNhan} onChange={(e) => datXacNhan(e.target.checked)} />
            <span>
              Tôi đã kiểm tra danh sách trên — đây là khách hàng khác, vẫn lưu.
              <small>Nếu là khách cũ, hãy mở khách đó (hoặc hỏi người phụ trách) thay vì tạo mới.</small>
            </span>
          </label>
        )}
      </div>

      <div className="phan-form">
        <h3>Thông tin khách hàng</h3>
        <div className="luoi-form">
          <div className="truong ca-dong">
            <label htmlFor="kh-ten">
              Tên khách hàng / công ty <span className="bat-buoc">*</span>
            </label>
            <input id="kh-ten" type="text" value={gt.ten} onChange={(e) => dat("ten", e.target.value)} onBlur={doTrung} {...aria("ten")} />
            <LoiTruong loi={loi} truong="ten" />
          </div>
          <div className="truong">
            <label htmlFor="kh-mst">Mã số thuế</label>
            <input id="kh-mst" type="text" inputMode="numeric" value={gt.maSoThue} onChange={(e) => dat("maSoThue", e.target.value)} onBlur={doTrung} {...aria("maSoThue")} />
            <span className={loiCua(loi, "maSoThue") ? "loi-truong" : "goi-y"}>
              {loiCua(loi, "maSoThue") ?? "10 số, hoặc 13 số với chi nhánh. Mỗi MST chỉ một khách hàng."}
            </span>
          </div>
          {chon("kh-loai", "Loại khách hàng", "loai_khach_hang", "loaiKhach")}
          {chon("kh-phankhuc", "Phân khúc", "phan_khuc_khach_hang", "phanKhuc")}
          {chon("kh-nganh", "Ngành nghề", "nganh_nghe", "nganh")}
          {chon("kh-nguon", "Nguồn", "nguon_lead", "nguon")}
          <div className="truong">
            <label htmlFor="kh-phutrach">Người phụ trách</label>
            <select id="kh-phutrach" value={gt.nguoiPhuTrachId} onChange={(e) => dat("nguoiPhuTrachId", e.target.value)} {...aria("nguoiPhuTrachId")}>
              {nguoiPhuTrach.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.fullName}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="nguoiPhuTrachId" />
          </div>
        </div>
      </div>

      <div className="phan-form">
        <h3>Liên lạc</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="kh-dt">Điện thoại</label>
            <input id="kh-dt" type="tel" value={gt.dienThoai} onChange={(e) => dat("dienThoai", e.target.value)} onBlur={doTrung} {...aria("dienThoai")} />
            <LoiTruong loi={loi} truong="dienThoai" />
          </div>
          <div className="truong">
            <label htmlFor="kh-email">Email</label>
            <input id="kh-email" type="email" value={gt.email} onChange={(e) => dat("email", e.target.value)} onBlur={doTrung} {...aria("email")} />
            <LoiTruong loi={loi} truong="email" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="kh-diachi">Địa chỉ</label>
            <input id="kh-diachi" type="text" value={gt.diaChi} onChange={(e) => dat("diaChi", e.target.value)} />
          </div>
          <div className="truong">
            <label htmlFor="kh-tinh">Tỉnh / thành</label>
            <input id="kh-tinh" type="text" value={gt.tinhThanh} onChange={(e) => dat("tinhThanh", e.target.value)} />
          </div>
          <div className="truong">
            <label htmlFor="kh-web">Website</label>
            <input id="kh-web" type="text" value={gt.website} onChange={(e) => dat("website", e.target.value)} placeholder="congty.vn" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="kh-ghichu">Ghi chú</label>
            <textarea id="kh-ghichu" value={gt.ghiChu} onChange={(e) => dat("ghiChu", e.target.value)} rows={3} />
          </div>
          {!laTaoMoi && (
            <div className="truong">
              <label htmlFor="kh-trangthai">Trạng thái</label>
              <select id="kh-trangthai" value={gt.trangThai} onChange={(e) => dat("trangThai", e.target.value)}>
                {TRANG_THAI_KHACH.map((t) => (
                  <option key={t} value={t}>
                    {NHAN_TRANG_THAI_KHACH[t]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {laTaoMoi && (
        <div className="phan-form">
          <h3>Người liên hệ chính (tùy chọn)</h3>
          <div className="luoi-form">
            <div className="truong">
              <label htmlFor="lh-ten">Họ tên</label>
              <input id="lh-ten" type="text" value={lienHe.hoTen} onChange={(e) => datLienHe({ ...lienHe, hoTen: e.target.value })} />
            </div>
            <div className="truong">
              <label htmlFor="lh-chucdanh">Chức danh</label>
              <input id="lh-chucdanh" type="text" value={lienHe.chucDanh} onChange={(e) => datLienHe({ ...lienHe, chucDanh: e.target.value })} />
            </div>
            <div className="truong">
              <label htmlFor="lh-dt">Điện thoại</label>
              <input id="lh-dt" type="tel" value={lienHe.dienThoai} onChange={(e) => datLienHe({ ...lienHe, dienThoai: e.target.value })} onBlur={doTrung} />
            </div>
            <div className="truong">
              <label htmlFor="lh-email">Email</label>
              <input id="lh-email" type="email" value={lienHe.email} onChange={(e) => datLienHe({ ...lienHe, email: e.target.value })} onBlur={doTrung} />
            </div>
          </div>
        </div>
      )}

      <div className="chan-form">
        <button type="button" className="nut" onClick={() => (laTaoMoi ? router.push("/crm/khach-hang") : router.push(`/crm/khach-hang/${banDau.id}`))}>
          {laTaoMoi ? "Hủy" : "Về tổng quan"}
        </button>
        <button
          type="submit"
          className="nut chinh"
          disabled={dangGui || gt.ten.trim().length < 2 || trungMst || (canXacNhan && dsHien.length > 0 && !xacNhan)}
        >
          {dangGui ? "Đang lưu…" : laTaoMoi ? "Tạo khách hàng" : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}
