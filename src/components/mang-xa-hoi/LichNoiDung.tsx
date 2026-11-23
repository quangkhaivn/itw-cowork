"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";
import { NHAN_TRANG_THAI_LICH, type TrangThaiLich } from "@/modules/mang-xa-hoi/lich-thuan";
import { gioVietNamSangIso } from "@/modules/mang-xa-hoi/tinh-toan";

export interface MucLich {
  id: string;
  tieuDe: string;
  trangThai: TrangThaiLich;
  luc: string;
  duKien: boolean;
  ngay: string;
  gio: string;
  kenh: { id: string; ten: string; tenNenTang: string; trangThai: string }[];
  chienDich: { id: string; ten: string } | null;
  nguoiSoan: string;
  doAiTao: boolean;
  canHenLai: boolean;
  duyetLaiKenhLoi: boolean;
  keoDuoc: boolean;
}

const THU = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"];

/**
 * Lưới lịch nội dung (tháng / tuần, giờ Việt Nam). Kéo một bài sang ngày khác (giữ giờ) hoặc chọn bài rồi sửa ngày giờ —
 * máy chủ kiểm lại mọi thứ (trạng thái, quyền, giờ tương lai, hạn mức YouTube / Reels). Bài đã đăng / đang đăng / lỗi
 * không kéo được.
 */
export default function LichNoiDung({ kieu, ngay, thang, homNay, muc }: { kieu: "thang" | "tuan"; ngay: string[]; thang: string; homNay: string; muc: MucLich[] }) {
  const router = useRouter();
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [chon, datChon] = useState<string | null>(null);
  const [gioMoi, datGioMoi] = useState("");
  const [keo, datKeo] = useState<string | null>(null);
  const [tren, datTren] = useState<string | null>(null);
  const theoNgay = new Map<string, MucLich[]>();
  for (const m of muc) theoNgay.set(m.ngay, [...(theoNgay.get(m.ngay) ?? []), m]);
  const dangChon = muc.find((m) => m.id === chon) ?? null;

  async function doi(id: string, than: Record<string, unknown>) {
    if (await goi(`/api/v1/mang-xa-hoi/bai/${id}/doi-lich`, "POST", than)) {
      datChon(null);
      router.refresh();
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao} <button type="button" className="nut nho" onClick={() => datLoi(null)}>Đóng</button></div>}
      <div className="cuon-ngang">
        <div role="grid" aria-label="Lịch nội dung" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(120px, 1fr))", gap: 4, minWidth: 840 }}>
          {THU.map((t) => <div key={t} role="columnheader" className="phu nho" style={{ fontWeight: 600, padding: "4px 6px" }}>{t}</div>)}
          {ngay.map((d) => {
            const ngoaiThang = kieu === "thang" && d.slice(0, 7) !== thang;
            const ds = theoNgay.get(d) ?? [];
            const laTren = tren === d && keo !== null;
            return (
              <div key={d} role="gridcell" aria-label={d}
                onDragOver={(e) => { if (keo) { e.preventDefault(); datTren(d); } }}
                onDragLeave={() => datTren((x) => (x === d ? null : x))}
                onDrop={(e) => { e.preventDefault(); const id = keo; datKeo(null); datTren(null); if (id) void doi(id, { ngay: d }); }}
                style={{
                  minHeight: kieu === "tuan" ? 260 : 110, border: "1px solid var(--vien, #ddd)", borderRadius: 6, padding: 4,
                  background: laTren ? "var(--nen-chon, #eef5ff)" : ngoaiThang ? "var(--nen-phu, #f7f7f7)" : undefined, opacity: ngoaiThang ? 0.7 : 1,
                  outline: d === homNay ? "2px solid var(--mau-chinh, #2563eb)" : undefined,
                }}>
                <div className="nho" style={{ fontWeight: d === homNay ? 700 : 500 }}>{Number(d.slice(8, 10))}{d.slice(8, 10) === "01" || kieu === "tuan" ? `/${Number(d.slice(5, 7))}` : ""}</div>
                <div style={{ display: "grid", gap: 3, marginTop: 2 }}>
                  {ds.map((m) => {
                    const n = m.canHenLai ? { nhan: "Đã duyệt – cần hẹn lại giờ", lop: "canh-bao" } : NHAN_TRANG_THAI_LICH[m.trangThai] ?? { nhan: m.trangThai, lop: "" };
                    return (
                      <button key={m.id} type="button" draggable={m.keoDuoc}
                        onDragStart={(e) => { datKeo(m.id); e.dataTransfer.setData("text/plain", m.id); e.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => { datKeo(null); datTren(null); }}
                        onClick={() => { datChon(m.id); datGioMoi(`${m.ngay}T${m.gio}`); datLoi(null); }}
                        title={`${m.tieuDe} — ${n.nhan}${m.duKien ? " (ngày dự kiến)" : ""}${m.keoDuoc ? " · kéo sang ngày khác để đổi lịch" : ""}`}
                        className={`huy-hieu ${n.lop}`}
                        style={{ textAlign: "left", cursor: m.keoDuoc ? "grab" : "pointer", whiteSpace: "normal", lineHeight: 1.25, padding: "3px 5px", border: chon === m.id ? "2px solid currentColor" : undefined, borderStyle: m.duKien ? "dashed" : undefined, width: "100%" }}>
                        <span className="nho">{m.gio}{m.duKien ? " (dự kiến)" : ""}</span> {m.tieuDe.slice(0, 60)}
                        <span className="nho" style={{ display: "block", opacity: 0.8 }}>{n.nhan}{m.doAiTao ? " · AI" : ""} · {m.kenh.map((k) => k.tenNenTang).join(", ") || "chưa chọn kênh"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {dangChon && (
        <section className="the" aria-live="polite">
          <div className="dau"><h2>{dangChon.tieuDe}</h2></div>
          <div className="than" style={{ padding: 16, display: "grid", gap: 8 }}>
            <div className="phu">
              {NHAN_TRANG_THAI_LICH[dangChon.trangThai]?.nhan ?? dangChon.trangThai} · {dangChon.duKien ? "Ngày dự kiến" : "Giờ hẹn"} {dangChon.ngay.split("-").reverse().join("/")} {dangChon.gio} (giờ Việt Nam)
              {dangChon.chienDich && <> · Chiến dịch: {dangChon.chienDich.ten}</>} · Soạn bởi {dangChon.nguoiSoan}
            </div>
            <div className="phu nho">Kênh: {dangChon.kenh.map((k) => `${k.ten} (${k.tenNenTang})`).join(", ") || "—"}</div>
            {dangChon.keoDuoc ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="nho">{dangChon.duKien ? "Ngày giờ dự kiến mới" : "Giờ hẹn mới"} (giờ Việt Nam)</span>
                  <input type="datetime-local" value={gioMoi} onChange={(e) => datGioMoi(e.target.value)} />
                </label>
                <button type="button" className="nut chinh" disabled={dangGui || !gioMoi} onClick={() => { const iso = gioVietNamSangIso(gioMoi); if (iso) void doi(dangChon.id, { luc: iso }); }}>Đổi lịch</button>
                {!dangChon.duKien && <span className="phu nho">Bài đã hẹn giờ đổi giờ vẫn giữ duyệt (nội dung không đổi).</span>}
              </div>
            ) : <p className="phu nho">Bài này không đổi lịch được ở đây (đã đăng / đang đăng / lỗi, hoặc bạn không có quyền).</p>}
            <div><Link className="nut nho" href={`/mang-xa-hoi/bai/${dangChon.id}`}>Mở bài</Link> <button type="button" className="nut nho" onClick={() => datChon(null)}>Đóng</button></div>
          </div>
        </section>
      )}
    </div>
  );
}
