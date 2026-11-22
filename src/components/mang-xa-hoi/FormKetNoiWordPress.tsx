"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";

type KetQua = { ok: boolean; thongBao: string; huongDan: string | null };

/**
 * Nối site WordPress. "Kiểm tra kết nối" gọi site bằng thông tin vừa nhập (chưa lưu). "Lưu kênh" kiểm tra lại rồi mới lưu;
 * mật khẩu ứng dụng được niêm phong trên máy chủ và KHÔNG BAO GIỜ hiện lại.
 */
export default function FormKetNoiWordPress() {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [d, datD] = useState({ diaChi: "", tenDangNhap: "", matKhauUngDung: "", ten: "" });
  const [kq, datKq] = useState<KetQua | null>(null);
  const doi = (k: keyof typeof d, v: string) => { datD({ ...d, [k]: v }); datKq(null); };

  async function kiemTra() {
    datKq(await goi<KetQua>("/api/v1/mang-xa-hoi/kenh/kiem-tra", "POST", { diaChi: d.diaChi, tenDangNhap: d.tenDangNhap, matKhauUngDung: d.matKhauUngDung }));
  }
  async function luu() {
    if (await goi("/api/v1/mang-xa-hoi/kenh", "POST", { ...d, ten: d.ten || undefined })) {
      datD({ diaChi: "", tenDangNhap: "", matKhauUngDung: "", ten: "" });
      datKq(null);
      router.refresh();
    }
  }

  return (
    <div className="than" style={{ padding: 16 }}>
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}{(loi.chiTiet as { huongDan?: string } | undefined)?.huongDan && <div>{(loi.chiTiet as { huongDan: string }).huongDan}</div>}</div>}
      <div className="luoi-form">
        <div className="truong ca-dong">
          <label htmlFor="wp-dia-chi">Địa chỉ site <span className="bat-buoc">*</span></label>
          <input id="wp-dia-chi" placeholder="https://tintuc.vi-du.vn" value={d.diaChi} onChange={(e) => doi("diaChi", e.target.value)} autoComplete="url" />
          <span className="phu nho">Chỉ HTTPS. Site đặt trong thư mục con thì ghi cả thư mục (https://vi-du.vn/blog).</span>
          {loiCua(loi, "diaChi") && <span className="loi-truong">{loiCua(loi, "diaChi")}</span>}
        </div>
        <div className="truong">
          <label htmlFor="wp-user">Tên đăng nhập WordPress <span className="bat-buoc">*</span></label>
          <input id="wp-user" value={d.tenDangNhap} onChange={(e) => doi("tenDangNhap", e.target.value)} autoComplete="off" />
        </div>
        <div className="truong">
          <label htmlFor="wp-mk">Mật khẩu ứng dụng (Application Password) <span className="bat-buoc">*</span></label>
          <input id="wp-mk" type="password" value={d.matKhauUngDung} onChange={(e) => doi("matKhauUngDung", e.target.value)} autoComplete="new-password" placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" />
          <span className="phu nho">KHÔNG phải mật khẩu đăng nhập. Tạo ở WordPress → Người dùng → Hồ sơ → Mật khẩu ứng dụng.</span>
        </div>
        <div className="truong">
          <label htmlFor="wp-ten">Tên kênh (tùy chọn)</label>
          <input id="wp-ten" value={d.ten} onChange={(e) => doi("ten", e.target.value)} placeholder="Tin tức công ty" />
        </div>
      </div>
      {kq && <div className={`hop-thong-bao ${kq.ok ? "tot" : "canh-bao"}`} role="status" style={{ marginTop: 8 }}>{kq.thongBao}{kq.huongDan && <div className="nho">{kq.huongDan}</div>}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" className="nut" disabled={dangGui || !d.diaChi || !d.tenDangNhap || !d.matKhauUngDung} onClick={kiemTra}>{dangGui ? "Đang kiểm…" : "Kiểm tra kết nối"}</button>
        <button type="button" className="nut chinh" disabled={dangGui || !d.diaChi || !d.tenDangNhap || !d.matKhauUngDung} onClick={luu}>Lưu kênh</button>
      </div>
    </div>
  );
}
