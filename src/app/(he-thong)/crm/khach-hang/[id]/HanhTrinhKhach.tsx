"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useGoiApi } from "@/components/ui/goi-api";

/** Đổi trạng thái hành trình của một khách (Customer 360). Máy chủ kiểm quyền + phạm vi. */
export function DoiHanhTrinh({
  khachHangId,
  hienTaiId,
  trangThai,
}: {
  khachHangId: string;
  hienTaiId: string | null;
  trangThai: { id: string; ten: string }[];
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [chon, datChon] = useState(hienTaiId ?? "");
  const [ghiChu, datGhiChu] = useState("");

  async function luu(e: React.FormEvent) {
    e.preventDefault();
    if (await goi(`/api/v1/khach-hang/${khachHangId}/hanh-trinh`, "POST", { trangThaiId: chon, ghiChu })) {
      datGhiChu("");
      router.refresh();
    }
  }

  return (
    <form onSubmit={luu} className="bo-loc" style={{ borderBottom: 0, padding: 0 }}>
      <div className="truong">
        <label htmlFor="ht-chon">Chuyển sang</label>
        <select id="ht-chon" value={chon} onChange={(e) => datChon(e.target.value)}>
          {!hienTaiId && <option value="">— Chọn —</option>}
          {trangThai.map((t) => (
            <option key={t.id} value={t.id}>
              {t.ten}
            </option>
          ))}
        </select>
      </div>
      <div className="truong rong">
        <label htmlFor="ht-ghi-chu">Ghi chú (tùy chọn)</label>
        <input id="ht-ghi-chu" value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} maxLength={1000} placeholder="Vì sao đổi" />
      </div>
      <button type="submit" className="nut chinh" disabled={dangGui || !chon || chon === hienTaiId}>
        {dangGui ? "Đang lưu…" : "Đổi trạng thái"}
      </button>
      {loi && <p className="chu-loi nho" role="alert">{loi.thongBao}</p>}
    </form>
  );
}

/** Đặt nhóm cho một khách: tích chọn rồi lưu (gắn thiếu, gỡ thừa). */
export function NhomCuaKhach({
  khachHangId,
  dangCo,
  tatCa,
  duocSua,
}: {
  khachHangId: string;
  dangCo: string[];
  tatCa: { id: string; ten: string; mau: string }[];
  duocSua: boolean;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [chon, datChon] = useState<Set<string>>(new Set(dangCo));
  const doi = [...chon].sort().join() !== [...dangCo].sort().join();

  if (tatCa.length === 0) return <p className="phu nho">Chưa có nhóm khách nào — quản lý tạo ở trang Nhóm khách hàng.</p>;
  return (
    <div>
      <div className="chuoi-huy-hieu" style={{ gap: 8 }}>
        {tatCa.map((g) => (
          <label key={g.id} className="nhan-mau" style={{ cursor: duocSua ? "pointer" : "default" }}>
            {duocSua && (
              <input
                type="checkbox"
                checked={chon.has(g.id)}
                onChange={() =>
                  datChon((cu) => {
                    const moi = new Set(cu);
                    if (moi.has(g.id)) moi.delete(g.id);
                    else moi.add(g.id);
                    return moi;
                  })
                }
              />
            )}
            <span className="cham-mau" style={{ "--mau": g.mau } as React.CSSProperties} />
            {g.ten}
          </label>
        ))}
      </div>
      {duocSua && (
        <button
          type="button"
          className="nut nho"
          style={{ marginTop: 10 }}
          disabled={dangGui || !doi}
          onClick={async () => {
            if (await goi(`/api/v1/khach-hang/${khachHangId}/nhom`, "PUT", { nhomIds: [...chon] })) router.refresh();
          }}
        >
          {dangGui ? "Đang lưu…" : "Lưu nhóm"}
        </button>
      )}
      {loi && <p className="chu-loi nho" role="alert">{loi.thongBao}</p>}
    </div>
  );
}
