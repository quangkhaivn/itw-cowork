"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGoiApi } from "@/components/ui/goi-api";

type Dong = {
  id: string; hoTen: string; loaiNhanSu: string; phongBan: { name: string } | null; diaDiem: { ten: string } | null; trangThai: string; nhanTrangThai: string;
  gioVaoCa: string | null; vaoLuc: string | null; phutMuon: number; soLanCham: number; choXemXet: number;
  lanCuoi: { luc: string; nguon: string; huong: string | null; ketQuaGps: string | null; noi: string | null; banDo: string | null; phieuId: string | null } | null;
};
type May = { id: string; ten: string; diaDiem: { ten: string }; lanCuoi: string | null; trucTuyen: boolean };
type XemXet = { id: string; nguoi: { hoTen: string }; luc: string; nguon: string; may: string | null; chuaTinh: boolean; huong: string | null; ketQuaGps: string | null; co: string[]; khoangCachM: number | null; phieu: { id: string; so: string } | null; banDo: string | null };
type DuLieu = { ngay: string; capNhatLuc: string; tomTat: Record<string, number>; dong: Dong[]; may: { nguongPhut: number; dong: May[] } | null; canXemXet: XemXet[] };

const LOP: Record<string, string> = {
  "da-vao-ca": "tot", "da-ra-ca": "", "di-muon": "canh-bao", "chua-den": "loi", "nghi-phep": "chinh", "hien-truong": "chinh", "chua-toi-gio": "", "khong-co-ca": "",
};
const THU_TU = ["chua-den", "di-muon", "da-vao-ca", "hien-truong", "nghi-phep", "da-ra-ca", "chua-toi-gio", "khong-co-ca"];
const NHAN_TOM_TAT: Record<string, string> = {
  "chua-den": "Chưa đến", "di-muon": "Đi muộn", "da-vao-ca": "Đã vào ca", "hien-truong": "Hiện trường", "nghi-phep": "Nghỉ phép", "da-ra-ca": "Đã ra ca",
  "chua-toi-gio": "Chưa tới giờ", "khong-co-ca": "Không có ca",
};
const NHAN_NGUON: Record<string, string> = { "van-tay": "Vân tay", gps: "GPS", "bo-sung": "Chấm bù", "nhap-csv": "Nhập tệp" };
const NHAN_CO: Record<string, string> = {
  "do-chinh-xac-thap": "GPS kém chính xác", "toc-do-bat-thuong": "Tốc độ bất thường", "thieu-quyen-vi-tri": "Không có vị trí",
  "gio-may-lech": "Giờ máy vân tay lệch", "gio-may-vo-ly": "Giờ máy vân tay vô lý", "phieu-hien-truong-cu": "Phiếu hỗ trợ không còn hoạt động gần đây",
  "phieu-da-xong": "Phiếu hỗ trợ đã xử lý xong",
};
const gio = (s: string | null) => (s ? new Date(s).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }) : "—");
const ngayGio = (s: string | null) => (s ? new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "chưa từng");

export default function BangTrucTiep({ phongBan, diaDiem }: { phongBan: { id: string; ten: string }[]; diaDiem: { id: string; ten: string }[] }) {
  const [loc, datLoc] = useState({ phongBanId: "", diaDiemId: "" });
  const [duLieu, datDuLieu] = useState<DuLieu | null>(null);
  const [loiTai, datLoiTai] = useState<string | null>(null);
  const [chiTrangThai, datChiTrangThai] = useState("");
  const { goi, dangGui, loi } = useGoiApi();
  const dangTai = useRef(false);

  const tai = useCallback(async () => {
    if (dangTai.current) return;
    dangTai.current = true;
    try {
      const r = await fetch(`/api/v1/cham-cong/truc-tiep?${new URLSearchParams(loc)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) datLoiTai(j.thongBao ?? `Lỗi ${r.status}`);
      else {
        datDuLieu(j);
        datLoiTai(null);
      }
    } catch {
      datLoiTai("Mất kết nối máy chủ — sẽ thử lại sau 10 giây.");
    } finally {
      dangTai.current = false;
    }
  }, [loc]);

  useEffect(() => {
    const dau = setTimeout(() => void tai(), 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void tai();
    }, 10_000);
    return () => {
      clearTimeout(dau);
      clearInterval(t);
    };
  }, [tai]);

  async function xemXet(id: string, quyetDinh: "chap-nhan" | "tu-choi") {
    let ghiChu: string | undefined;
    if (quyetDinh === "tu-choi") {
      ghiChu = window.prompt("Lý do không chấp nhận lần chấm này:") ?? undefined;
      if (!ghiChu) return;
    }
    if (await goi(`/api/v1/cham-cong/lan-cham/${id}/xem-xet`, "POST", { quyetDinh, ghiChu })) void tai();
  }

  const dong = (duLieu?.dong ?? []).filter((d) => !chiTrangThai || d.trangThai === chiTrangThai);
  return (
    <>
      <div className="bo-loc the">
        <div className="truong">
          <label htmlFor="tt-pb">Phòng ban</label>
          <select id="tt-pb" value={loc.phongBanId} onChange={(e) => datLoc({ ...loc, phongBanId: e.target.value })}>
            <option value="">Tất cả</option>
            {phongBan.map((p) => <option key={p.id} value={p.id}>{p.ten}</option>)}
          </select>
        </div>
        <div className="truong">
          <label htmlFor="tt-dd">Địa điểm làm việc</label>
          <select id="tt-dd" value={loc.diaDiemId} onChange={(e) => datLoc({ ...loc, diaDiemId: e.target.value })}>
            <option value="">Tất cả</option>
            {diaDiem.map((d) => <option key={d.id} value={d.id}>{d.ten}</option>)}
          </select>
        </div>
        <div className="phu nho" style={{ alignSelf: "end" }}>
          {duLieu ? `Cập nhật lúc ${new Date(duLieu.capNhatLuc).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · tự làm mới mỗi 10 giây` : "Đang tải…"}
        </div>
      </div>
      {loiTai && <div className="hop-thong-bao loi" role="alert">{loiTai}</div>}
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}

      {duLieu && (
        <div className="luoi-chi-so">
          {THU_TU.filter((k) => duLieu.tomTat[k] > 0 || ["chua-den", "di-muon", "da-vao-ca"].includes(k)).map((k) => (
            <button
              key={k}
              type="button"
              className={`the chi-so ${k === "chua-den" && duLieu.tomTat[k] > 0 ? "loi" : k === "di-muon" && duLieu.tomTat[k] > 0 ? "canh-bao" : ""}`}
              style={{ textAlign: "left", cursor: "pointer", outline: chiTrangThai === k ? "2px solid var(--chinh)" : undefined }}
              onClick={() => datChiTrangThai(chiTrangThai === k ? "" : k)}
            >
              <div className="nhan">{NHAN_TOM_TAT[k]}</div>
              <div className="gia-tri">{duLieu.tomTat[k] ?? 0}</div>
            </button>
          ))}
        </div>
      )}

      {duLieu && duLieu.canXemXet.length > 0 && (
        <section className="the">
          <div className="dau"><h2>Lần chấm chờ bạn xem xét ({duLieu.canXemXet.length})</h2></div>
          <div className="cuon-ngang">
            <table className="bang">
              <thead><tr><th>Người</th><th>Lúc</th><th>Kết quả</th><th>Cờ</th><th>Vị trí</th><th /></tr></thead>
              <tbody>
                {duLieu.canXemXet.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nguoi.hoTen}</td>
                    <td>{ngayGio(p.luc)} {p.huong === "ra" ? "(ra)" : p.huong === "vao" ? "(vào)" : ""}</td>
                    <td>
                      {p.nguon === "van-tay" ? `Máy vân tay${p.may ? ` · ${p.may}` : ""}` : p.ketQuaGps === "hien-truong" ? "Hiện trường" : p.ketQuaGps === "ngoai-vung" ? "Ngoài vùng" : "Trong vùng"}
                      {p.phieu && <> · <Link href={`/dich-vu/ho-tro/${p.phieu.id}`}>{p.phieu.so}</Link></>}
                    </td>
                    <td>
                      {p.co.map((c) => NHAN_CO[c] ?? c).join(", ") || "—"}
                      {p.chuaTinh && <div className="phu nho">Chưa tính công cho tới khi chấp nhận</div>}
                    </td>
                    <td>
                      {p.khoangCachM !== null && `${p.khoangCachM.toLocaleString("vi-VN")} m · `}
                      {p.banDo ? <a href={p.banDo} target="_blank" rel="noopener noreferrer">Xem trên bản đồ</a> : "—"}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button type="button" className="nut nho" disabled={dangGui} onClick={() => xemXet(p.id, "chap-nhan")}>Chấp nhận</button>{" "}
                      <button type="button" className="nut nho nguy-hiem" disabled={dangGui} onClick={() => xemXet(p.id, "tu-choi")}>Không chấp nhận</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="the">
        <div className="cuon-ngang">
          <table className="bang bang-truc-tiep">
            <thead>
              <tr><th>Nhân viên</th><th>Trạng thái</th><th>Giờ vào ca</th><th>Vào lúc</th><th>Lần chấm cuối</th><th>Nguồn</th><th>Vị trí</th></tr>
            </thead>
            <tbody>
              {dong.length === 0 && <tr><td colSpan={7} className="phu">{duLieu ? "Không có ai trong phạm vi / bộ lọc này." : "Đang tải…"}</td></tr>}
              {dong.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.hoTen}
                    {d.loaiNhanSu === "thuc-tap" && <span className="huy-hieu"> Thực tập</span>}
                    <div className="phu nho">{[d.phongBan?.name, d.diaDiem?.ten].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>
                    <span className={`huy-hieu ${LOP[d.trangThai] ?? ""}`}>{d.nhanTrangThai}{d.phutMuon > 0 ? ` ${d.phutMuon} phút` : ""}</span>
                    {d.choXemXet > 0 && <span className="huy-hieu canh-bao"> {d.choXemXet} chờ xem xét</span>}
                  </td>
                  <td>{gio(d.gioVaoCa)}</td>
                  <td>{gio(d.vaoLuc)}</td>
                  <td>{d.lanCuoi ? `${gio(d.lanCuoi.luc)}${d.lanCuoi.huong ? (d.lanCuoi.huong === "vao" ? " (vào)" : " (ra)") : ""}` : "—"}</td>
                  <td>{d.lanCuoi ? `${NHAN_NGUON[d.lanCuoi.nguon] ?? d.lanCuoi.nguon}${d.lanCuoi.noi ? ` · ${d.lanCuoi.noi}` : ""}` : "—"}</td>
                  <td>{d.lanCuoi?.banDo ? <a href={d.lanCuoi.banDo} target="_blank" rel="noopener noreferrer">Xem trên bản đồ</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {duLieu?.may && (
        <section className="the">
          <div className="dau"><h2>Máy chấm công</h2><span className="phu nho">Mất kết nối khi im lặng quá {duLieu.may.nguongPhut} phút</span></div>
          {duLieu.may.dong.length === 0 ? (
            <p className="phu">Chưa đăng ký máy nào.</p>
          ) : (
            <ul className="ds-lan-cham">
              {duLieu.may.dong.map((m) => (
                <li key={m.id}>
                  <span><strong>{m.ten}</strong> <span className="phu">· {m.diaDiem.ten}</span></span>
                  <span>
                    <span className={`huy-hieu ${m.trucTuyen ? "tot" : "loi"}`}>{m.trucTuyen ? "Trực tuyến" : "Mất kết nối"}</span>{" "}
                    <span className="phu nho">lần cuối {ngayGio(m.lanCuoi)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
