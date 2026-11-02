"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";
import type { MauPhieu } from "@/modules/danh-gia/tinh-toan";

/** Người hướng dẫn chấm phiếu theo mẫu (DG-73): ô thông tin nhập tay, điểm từng tiêu chí (thang 10 / chữ), nhận xét. */
export default function ChamThucTap({ id, mau, thongTin, diem, nhanXet, tuDong }: { id: string; mau: MauPhieu; thongTin: Record<string, string>; diem: Record<string, string | number | null>; nhanXet: Record<string, string>; tuDong: Record<string, number | null | undefined> }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const tay = mau.thongTin.filter((t) => t.nguon === "tu-nhap");
  const [tt, datTt] = useState<Record<string, string>>(Object.fromEntries(tay.map((t) => [t.ma, thongTin[t.ma] ?? ""])));
  const [dm, datDm] = useState<Record<string, string>>(Object.fromEntries(mau.phan.flatMap((p) => p.tieuChi).map((t) => [t.ma, diem[t.ma] === null || diem[t.ma] === undefined ? "" : String(diem[t.ma])])));
  const [nx, datNx] = useState<Record<string, string>>(Object.fromEntries(mau.oNhanXet.map((o) => [o.ma, nhanXet[o.ma] ?? ""])));
  async function luu() {
    const diemGui = Object.fromEntries(Object.entries(dm).map(([k, v]) => {
      const tc = mau.phan.flatMap((p) => p.tieuChi).find((t) => t.ma === k);
      return [k, v === "" ? null : tc?.thang === "10" ? Number(v.replace(",", ".")) : v];
    }));
    if (await goi(`/api/v1/thuc-tap/danh-gia/${id}/cham`, "POST", { thongTin: tt, diem: diemGui, nhanXet: nx })) router.refresh();
  }
  return (
    <div className="than">
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      {tay.length > 0 && (
        <div className="luoi-form">
          {tay.map((t) => (
            <div className="truong" key={t.ma}><label>{t.nhan}</label><input value={tt[t.ma]} onChange={(e) => datTt({ ...tt, [t.ma]: e.target.value })} /></div>
          ))}
        </div>
      )}
      {mau.phan.map((p) => (
        <div key={p.ten}>
          <h3>{p.ten}</h3>
          <div className="cuon-ngang"><table className="bang">
            <thead><tr><th>Tiêu chí</th><th className="so">Trọng số</th><th style={{ width: 140 }}>Điểm</th><th>Gợi ý tự động</th></tr></thead>
            <tbody>{p.tieuChi.map((t) => (
              <tr key={t.ma}>
                <td>{t.ten}{t.moTa && <div className="dong-phu">{t.moTa}</div>}</td>
                <td className="so">{t.trongSo}</td>
                <td>
                  {t.thang === "10" ? (
                    <input type="number" min={0} max={10} step="0.25" value={dm[t.ma]} onChange={(e) => datDm({ ...dm, [t.ma]: e.target.value })} placeholder="0–10" />
                  ) : (
                    <select value={dm[t.ma]} onChange={(e) => datDm({ ...dm, [t.ma]: e.target.value })}>
                      <option value="">—</option>
                      {mau.thangChu.map((c) => <option key={c.chu} value={c.chu}>{c.chu}</option>)}
                    </select>
                  )}
                </td>
                <td className="phu nho">{t.nguon ? (tuDong[t.nguon] !== null && tuDong[t.nguon] !== undefined ? `${tuDong[t.nguon]}${t.nguon === "chat-luong-viec" ? "/5" : "%"} — để trống để dùng` : "Chưa có số liệu") : ""}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      ))}
      {mau.oNhanXet.map((o) => (
        <div className="truong" key={o.ma}><label>{o.nhan}</label><textarea rows={3} value={nx[o.ma]} onChange={(e) => datNx({ ...nx, [o.ma]: e.target.value })} /></div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="nut chinh" disabled={dangGui} onClick={luu}>{dangGui ? "Đang lưu…" : "Lưu điểm"}</button>
      </div>
    </div>
  );
}
