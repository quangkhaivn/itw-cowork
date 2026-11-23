"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

export interface DongApp {
  nhaCungCap: "META" | "GOOGLE" | "ZALO";
  ten: string;
  daCauHinh: boolean;
  nguon: "man-hinh" | "may-chu" | null;
  nhanBiMat: string;
  congKhai: Record<string, string> | null;
  bonSoCuoi: string | null;
  biMatCapNhatLuc: string | null;
  kiemTra: { trangThai: string | null; thongBao: string | null; luc: string } | null;
  dangChoKiemTra: boolean;
  coKhoaPicker?: boolean | null;
  khoaPickerBonSoCuoi?: string | null;
}

const TRUONG: Record<DongApp["nhaCungCap"], { ten: string; nhan: string; goiY?: string }[]> = {
  META: [{ ten: "appId", nhan: "App ID" }, { ten: "graphVersion", nhan: "Phiên bản Graph API", goiY: "Điền sẵn; đổi khi Meta ra bản mới (chưa kiểm với API thật)." }, { ten: "configId", nhan: "Configuration ID (Facebook Login for Business)", goiY: "Không bắt buộc — có thì hộp thoại đăng nhập dùng cấu hình này thay danh sách quyền." }],
  GOOGLE: [{ ten: "clientId", nhan: "OAuth Client ID", goiY: "dạng 1234…-xxxx.apps.googleusercontent.com" }],
  ZALO: [{ ten: "appId", nhan: "App ID" }],
};

const gio = (s: string | null) => (s ? new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—");

/**
 * Một nền tảng trên màn hình "Kết nối nền tảng (API)". Bí mật nhập vào ô mật khẩu, KHÔNG BAO GIỜ được trả lại — chỉ hiện
 * 4 ký tự cuối. Để trống ô bí mật = giữ bí mật đã lưu. "Kiểm tra" dùng bí mật vừa nhập (nếu có), không thì bí mật đã lưu.
 */
export default function FormThongTinApp({ dong, quanLy }: { dong: DongApp; quanLy: boolean }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState<Record<string, string>>({ ...(dong.congKhai ?? {}) });
  const [biMat, datBiMat] = useState("");
  const [khoaPicker, datKhoaPicker] = useState("");
  const [kq, datKq] = useState<{ trangThai: string | null; thongBao: string } | null>(null);
  const url = `/api/v1/mang-xa-hoi/thong-tin-app/${dong.nhaCungCap.toLowerCase()}`;
  const than = () => ({ ...gt, biMat: biMat || null, ...(dong.nhaCungCap === "GOOGLE" ? { khoaPicker: khoaPicker || null } : {}) });

  async function luu() {
    if (await goi(url, "PUT", than())) { datBiMat(""); datKhoaPicker(""); datKq(null); router.refresh(); }
  }
  async function kiemTra() {
    const r = await goi<{ trangThai: string | null; thongBao: string }>(`${url}/kiem-tra`, "POST", than());
    if (r) { datKq(r); router.refresh(); }
  }
  async function xoa() {
    if (!window.confirm(`Xóa ${dong.nhanBiMat} của ${dong.ten}? Kết nối kênh dùng app này sẽ ngừng hoạt động.`)) return;
    if (await goi(url, "DELETE")) router.refresh();
  }

  const kt = kq ?? (dong.kiemTra ? { trangThai: dong.kiemTra.trangThai, thongBao: `${dong.kiemTra.thongBao ?? ""} (${gio(dong.kiemTra.luc)})` } : null);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div>
        <span className={`huy-hieu ${dong.daCauHinh ? "tot" : ""}`}>{dong.daCauHinh ? "Đã cấu hình" : "Chưa cấu hình"}</span>
        {dong.nguon === "may-chu" && <span className="huy-hieu thong-tin"> Đang dùng giá trị từ máy chủ (.env)</span>}
        {dong.dangChoKiemTra && <span className="phu nho"> · Đang chờ máy nền kiểm…</span>}
      </div>
      {quanLy && (
        <>
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
          <div className="luoi-form">
            {TRUONG[dong.nhaCungCap].map((t) => (
              <div className="truong" key={t.ten}>
                <label htmlFor={`${dong.nhaCungCap}-${t.ten}`}>{t.nhan}</label>
                <input id={`${dong.nhaCungCap}-${t.ten}`} value={gt[t.ten] ?? ""} onChange={(e) => datGt({ ...gt, [t.ten]: e.target.value })} autoComplete="off" />
                {t.goiY && <span className="phu nho">{t.goiY}</span>}
              </div>
            ))}
            <div className="truong">
              <label htmlFor={`${dong.nhaCungCap}-bi-mat`}>{dong.nhanBiMat}</label>
              <input id={`${dong.nhaCungCap}-bi-mat`} type="password" value={biMat} onChange={(e) => datBiMat(e.target.value)} autoComplete="new-password"
                placeholder={dong.bonSoCuoi ? `Đã lưu ••••${dong.bonSoCuoi} — để trống để giữ` : "Dán vào đây"} />
              {dong.bonSoCuoi && <span className="phu nho">Đã lưu: ••••{dong.bonSoCuoi} · cập nhật {gio(dong.biMatCapNhatLuc)}</span>}
            </div>
            {dong.nhaCungCap === "GOOGLE" && (
              <div className="truong">
                <label htmlFor="GOOGLE-khoa-picker">Google API key (Picker)</label>
                <input id="GOOGLE-khoa-picker" type="password" value={khoaPicker} onChange={(e) => datKhoaPicker(e.target.value)} autoComplete="new-password"
                  placeholder={dong.khoaPickerBonSoCuoi ? `Đã lưu ••••${dong.khoaPickerBonSoCuoi} — để trống để giữ` : "AIza…"} />
                <span className="phu nho">Để mở hộp “Chọn từ Google Drive”. Giới hạn khóa theo HTTP referrer (địa chỉ Cowork) trên Google Cloud.</span>
              </div>
            )}
          </div>
          {kt && <div className={`hop-thong-bao ${kt.trangThai === "ok" ? "tot" : kt.trangThai === "chi-dinh-dang" ? "thong-tin" : kt.trangThai ? "canh-bao" : "thong-tin"}`} role="status">{kt.thongBao}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="nut chinh" disabled={dangGui} onClick={luu}>Lưu</button>
            <button type="button" className="nut" disabled={dangGui} onClick={kiemTra}>{dangGui ? "Đang kiểm…" : "Kiểm tra"}</button>
            {dong.bonSoCuoi && <button type="button" className="nut" disabled={dangGui} onClick={xoa}>Xóa {dong.nhanBiMat}</button>}
          </div>
        </>
      )}
    </div>
  );
}
