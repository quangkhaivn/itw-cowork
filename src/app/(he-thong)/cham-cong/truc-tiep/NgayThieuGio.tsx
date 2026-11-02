"use client";

import { useCallback, useEffect, useState } from "react";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Ngày công "thiếu giờ" chờ quản lý quyết (QĐ-116): có cả giờ vào và giờ ra nhưng thời gian có mặt dưới ngưỡng
 * Cấu hình. Hệ thống KHÔNG tự trừ — quản lý chọn tính đủ, nửa hay không công. Tải một lần khi mở trang (không
 * theo nhịp 10 giây của bảng trực tiếp vì phải tính lại nhiều ngày).
 */
type Dong = {
  nguoi: { id: string; hoTen: string }; ngay: string; vaoDau: string | null; raCuoi: string | null;
  phutCoMat: number | null; phutPhaiCoMat: number | null; choNua: boolean;
};

const gio = (s: string | null) => (s ? new Date(s).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }) : "—");
const thoiLuong = (p: number | null) => (p === null ? "—" : `${Math.floor(p / 60)} giờ ${String(p % 60).padStart(2, "0")} phút`);

export default function NgayThieuGio() {
  const [ds, datDs] = useState<Dong[] | null>(null);
  const [loiTai, datLoiTai] = useState<string | null>(null);
  const { goi, dangGui, loi } = useGoiApi();

  const tai = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/cham-cong/ngay-cong", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) datLoiTai(j.thongBao ?? `Lỗi ${r.status}`);
      else {
        datDs(j.dong ?? []);
        datLoiTai(null);
      }
    } catch {
      datLoiTai("Không tải được danh sách ngày thiếu giờ.");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void tai(), 0);
    return () => clearTimeout(t);
  }, [tai]);

  async function xet(d: Dong, quyetDinh: "du" | "nua" | "khong") {
    let ghiChu: string | undefined;
    if (quyetDinh === "khong") {
      ghiChu = window.prompt("Lý do không tính công ngày này:") ?? undefined;
      if (!ghiChu) return;
    }
    if (await goi("/api/v1/cham-cong/ngay-cong/xem-xet", "POST", { nguoiId: d.nguoi.id, ngay: d.ngay, quyetDinh, ghiChu })) void tai();
  }

  if (loiTai) return <div className="hop-thong-bao loi" role="alert">{loiTai}</div>;
  if (!ds || ds.length === 0) return null;
  return (
    <section className="the">
      <div className="dau"><h2>Ngày công thiếu giờ chờ bạn quyết ({ds.length})</h2></div>
      <p className="phu nho" style={{ marginTop: 0 }}>
        Có giờ vào và giờ ra nhưng thời gian có mặt dưới ngưỡng ở Cấu hình. Hệ thống không tự trừ công — chọn tính đủ, nửa hay không công.
      </p>
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      <div className="cuon-ngang">
        <table className="bang">
          <thead><tr><th>Người</th><th>Ngày</th><th>Vào → ra</th><th>Có mặt</th><th>Phải có mặt</th><th /></tr></thead>
          <tbody>
            {ds.map((d) => (
              <tr key={`${d.nguoi.id}|${d.ngay}`}>
                <td>{d.nguoi.hoTen}</td>
                <td>{d.ngay.split("-").reverse().join("/")}</td>
                <td>{gio(d.vaoDau)} → {gio(d.raCuoi)}</td>
                <td>{thoiLuong(d.phutCoMat)}</td>
                <td>{thoiLuong(d.phutPhaiCoMat)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button type="button" className="nut nho" disabled={dangGui} onClick={() => xet(d, "du")}>Tính đủ</button>{" "}
                  {d.choNua && <><button type="button" className="nut nho" disabled={dangGui} onClick={() => xet(d, "nua")}>Tính nửa</button>{" "}</>}
                  <button type="button" className="nut nho nguy-hiem" disabled={dangGui} onClick={() => xet(d, "khong")}>Không tính</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
