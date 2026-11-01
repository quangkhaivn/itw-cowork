"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

type KetQua = { soDong: number; soLoi: number; loi: { soDong: number; lyDo: string }[]; soPin: number; pinChuaKhop: string[]; tuLuc: string | null; denLuc: string | null; daGhi: number; trung: number };

/** Nhập lần chấm từ CSV (NS-16): đọc tệp → xem trước → ghi. Nhập lại cùng tệp không nhân đôi. */
export default function NhapCsv() {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [noiDung, datNoiDung] = useState("");
  const [tenTep, datTenTep] = useState("");
  const [kq, datKq] = useState<KetQua | null>(null);
  const [daGhi, datDaGhi] = useState(false);

  async function chay(ghi: boolean) {
    const r = await goi<KetQua>("/api/v1/cham-cong/nhap-csv", "POST", { noiDung, ghi });
    if (!r) return;
    datKq(r);
    datDaGhi(ghi);
    if (ghi) router.refresh();
  }
  const gioVN = (s: string | null) => (s ? new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—");

  return (
    <div>
      <div className="truong">
        <label htmlFor="csv-tep">Tệp CSV (UTF-8)</label>
        <input
          id="csv-tep"
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            datKq(null);
            if (!f) return;
            datTenTep(f.name);
            datNoiDung(await f.text());
          }}
        />
        <span className="goi-y">Cột bắt buộc: <code>Mã chấm công</code> (hoặc PIN / AC-No.) và <code>Thời gian</code> (hoặc hai cột <code>Ngày</code> + <code>Giờ</code>). Giờ Việt Nam, dạng dd/mm/yyyy hh:mm hoặc yyyy-mm-dd hh:mm:ss. Excel: Lưu thành → CSV UTF-8.</span>
      </div>
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      <button type="button" className="nut" disabled={!noiDung || dangGui} onClick={() => chay(false)}>Xem trước {tenTep && `“${tenTep}”`}</button>{" "}
      {kq && !daGhi && kq.soDong > 0 && <button type="button" className="nut chinh" disabled={dangGui} onClick={() => chay(true)}>Ghi {kq.soDong} lần chấm</button>}
      {kq && (
        <div className={`hop-thong-bao ${daGhi ? "tot" : "thong-tin"}`} style={{ marginTop: 12 }}>
          {daGhi ? `Đã ghi ${kq.daGhi} lần chấm mới, bỏ qua ${kq.trung} lần đã có.` : `Đọc được ${kq.soDong} dòng (${kq.soPin} mã chấm công), từ ${gioVN(kq.tuLuc)} đến ${gioVN(kq.denLuc)}.`}
          {kq.soLoi > 0 && ` ${kq.soLoi} dòng lỗi bị bỏ qua: ${kq.loi.slice(0, 5).map((l) => `dòng ${l.soDong} — ${l.lyDo}`).join("; ")}${kq.loi.length > 5 ? "…" : ""}`}
          {kq.pinChuaKhop.length > 0 && ` Mã chưa gán cho ai (vẫn được ghi, gán sau ở mục PIN chưa khớp): ${kq.pinChuaKhop.join(", ")}.`}
        </div>
      )}
    </div>
  );
}
