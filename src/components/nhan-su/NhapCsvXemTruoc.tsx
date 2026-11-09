"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

type DongHopLe = { soDong: number; [k: string]: string | number | boolean | null };
type KetQua = { soDong: number; hopLe: DongHopLe[]; loi: { soDong: number; lyDo: string }[]; soLoi: number; daGhi: number; [k: string]: unknown };

/**
 * 0.22.0 — nhập CSV có BƯỚC XEM TRƯỚC (ánh xạ PIN ↔ email, hồ sơ lương): đọc tệp → máy chủ kiểm từng dòng (lỗi theo dòng,
 * chống chèn công thức) → người dùng xem → bấm ghi. Dòng lỗi bị bỏ qua, không chặn dòng hợp lệ.
 */
export default function NhapCsvXemTruoc({
  url,
  goiY,
  cot,
  nhanGhi,
  themVaoThan = {},
}: {
  url: string;
  goiY: string;
  /** Cột hiện ở bảng xem trước: [khóa, nhãn]. */
  cot: [string, string][];
  nhanGhi: string;
  themVaoThan?: Record<string, string | number | boolean | null>;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [noiDung, datNoiDung] = useState("");
  const [tenTep, datTenTep] = useState("");
  const [kq, datKq] = useState<KetQua | null>(null);
  const [daGhi, datDaGhi] = useState(false);

  async function chay(ghi: boolean) {
    const r = await goi<KetQua>(url, "POST", { noiDung, ghi, ...themVaoThan });
    if (!r) return;
    datKq(r);
    datDaGhi(ghi);
    if (ghi) router.refresh();
  }
  const hien = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "Có" : "Không") : typeof v === "number" ? v.toLocaleString("vi-VN") : String(v));

  return (
    <div>
      <div className="truong">
        <label htmlFor={`csv-${url}`}>Tệp CSV (UTF-8)</label>
        <input
          id={`csv-${url}`}
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
        <span className="goi-y">{goiY}</span>
      </div>
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      <button type="button" className="nut" disabled={!noiDung || dangGui} onClick={() => chay(false)}>Xem trước {tenTep && `“${tenTep}”`}</button>{" "}
      {kq && !daGhi && kq.hopLe.length > 0 && <button type="button" className="nut chinh" disabled={dangGui} onClick={() => chay(true)}>{nhanGhi} ({kq.hopLe.length} dòng hợp lệ)</button>}
      {kq && (
        <div style={{ marginTop: 12 }}>
          <div className={`hop-thong-bao ${daGhi ? "tot" : "thong-tin"}`}>
            {daGhi ? `Đã ghi ${kq.daGhi} dòng.` : `Đọc được ${kq.soDong} dòng: ${kq.hopLe.length} hợp lệ, ${kq.soLoi} lỗi (dòng lỗi bị bỏ qua).`}
          </div>
          {kq.loi.length > 0 && (
            <ul className="nho" style={{ color: "var(--mau-loi, #b42318)" }}>
              {kq.loi.slice(0, 50).map((l, i) => <li key={i}>Dòng {l.soDong}: {l.lyDo}</li>)}
              {kq.loi.length > 50 && <li>…</li>}
            </ul>
          )}
          {!daGhi && kq.hopLe.length > 0 && (
            <div className="cuon-ngang"><table className="bang">
              <thead><tr><th>Dòng</th>{cot.map(([k, n]) => <th key={k}>{n}</th>)}</tr></thead>
              <tbody>{kq.hopLe.slice(0, 200).map((d) => <tr key={d.soDong}><td>{d.soDong}</td>{cot.map(([k]) => <td key={k}>{hien(d[k])}</td>)}</tr>)}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}
