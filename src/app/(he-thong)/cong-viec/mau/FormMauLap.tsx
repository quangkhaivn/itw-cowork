"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";
import { NHAN_UU_TIEN, UU_TIEN } from "@/modules/crm/hang-so";
import { NHAN_DO_KHO, NHAN_THU } from "@/modules/danh-gia/tinh-toan";

type Nguoi = { id: string; hoTen: string };
type Cap = { loai: "nguoi-giao" | "quan-ly-truc-tiep" | "nguoi-cu-the"; nguoiId?: string | null };
type Muc = { nhan: string; batBuoc: boolean };

function mucRaChu(m: Muc[]) {
  return m.map((x) => `${x.batBuoc ? "" : "? "}${x.nhan}`).join("\n");
}
function chuRaMuc(s: string): Muc[] {
  return s
    .split("\n")
    .map((d) => d.trim())
    .filter((d) => d.replace(/^\?\s*/, "").length >= 2)
    .map((d) => (d.startsWith("?") ? { nhan: d.replace(/^\?\s*/, ""), batBuoc: false } : { nhan: d, batBuoc: true }));
}

/** Chọn chuỗi duyệt tối đa 3 cấp: người giao / quản lý trực tiếp của người làm / một người cụ thể. */
function ChonChuoi({ chuoi, datChuoi, nguoi }: { chuoi: Cap[]; datChuoi: (c: Cap[]) => void; nguoi: Nguoi[] }) {
  const giaTri = (c: Cap | undefined) => (!c ? "" : c.loai === "nguoi-cu-the" ? `u:${c.nguoiId}` : c.loai);
  const doi = (i: number, v: string) => {
    const moi = [...chuoi];
    if (!v) moi.splice(i);
    else moi[i] = v.startsWith("u:") ? { loai: "nguoi-cu-the", nguoiId: v.slice(2) } : { loai: v as Cap["loai"] };
    datChuoi(moi.filter(Boolean));
  };
  return (
    <div className="luoi-form">
      {[0, 1, 2].map((i) =>
        i <= chuoi.length ? (
          <div className="truong" key={i}>
            <label>Cấp duyệt {i + 1}</label>
            <select value={giaTri(chuoi[i])} onChange={(e) => doi(i, e.target.value)}>
              <option value="">{i === 0 ? "— Người giao (mặc định) —" : "— Không có —"}</option>
              <option value="nguoi-giao">Người giao</option>
              <option value="quan-ly-truc-tiep">Quản lý trực tiếp của người làm</option>
              {nguoi.map((n) => <option key={n.id} value={`u:${n.id}`}>{n.hoTen}</option>)}
            </select>
          </div>
        ) : null,
      )}
    </div>
  );
}

export interface MauViecSua {
  id: string;
  ten: string;
  tieuDe: string;
  moTa: string | null;
  doKho: number;
  uuTien: string;
  canDuyet: boolean;
  soNgayHan: number | null;
  mucKiemTra: Muc[];
  chuoiDuyet: Cap[];
  trangThai: string;
}

export function FormMauViec({ mau, nguoi, nhanNut, lopNut = "nut chinh nho" }: { mau?: MauViecSua; nguoi: Nguoi[]; nhanNut: string; lopNut?: string }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const dau = {
    ten: mau?.ten ?? "", tieuDe: mau?.tieuDe ?? "", moTa: mau?.moTa ?? "", doKho: String(mau?.doKho ?? 3), uuTien: mau?.uuTien ?? "trung-binh",
    canDuyet: mau?.canDuyet ?? true, soNgayHan: mau?.soNgayHan === null || mau?.soNgayHan === undefined ? "" : String(mau.soNgayHan),
    kiemTra: mucRaChu(mau?.mucKiemTra ?? []), trangThai: mau?.trangThai ?? "hoat-dong",
  };
  const [gt, datGt] = useState(dau);
  const [chuoi, datChuoi] = useState<Cap[]>(mau?.chuoiDuyet ?? []);
  async function gui() {
    const than = { ...gt, doKho: Number(gt.doKho), mucKiemTra: chuRaMuc(gt.kiemTra), chuoiDuyet: chuoi, soNgayHan: gt.soNgayHan };
    if (await goi(mau ? `/api/v1/cong-viec/mau/${mau.id}` : "/api/v1/cong-viec/mau", mau ? "PUT" : "POST", than)) {
      hop.current?.close();
      router.refresh();
    }
  }
  return (
    <>
      <button type="button" className={lopNut} onClick={() => { datGt(dau); datChuoi(mau?.chuoiDuyet ?? []); datLoi(null); hop.current?.showModal(); }}>{nhanNut}</button>
      <HopThoai ref={hop} tieuDe={mau ? `Sửa mẫu ${mau.ten}` : "Thêm mẫu việc"} rong={640}>
        <div className="than">
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
          <div className="luoi-form">
            <div className="truong"><label>Tên mẫu *</label><input value={gt.ten} onChange={(e) => datGt({ ...gt, ten: e.target.value })} /></div>
            <div className="truong"><label>Tiêu đề việc *</label><input value={gt.tieuDe} onChange={(e) => datGt({ ...gt, tieuDe: e.target.value })} /></div>
            <div className="truong"><label>Độ khó</label><select value={gt.doKho} onChange={(e) => datGt({ ...gt, doKho: e.target.value })}>{[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d} — {NHAN_DO_KHO[d]}</option>)}</select></div>
            <div className="truong"><label>Ưu tiên</label><select value={gt.uuTien} onChange={(e) => datGt({ ...gt, uuTien: e.target.value })}>{UU_TIEN.map((u) => <option key={u} value={u}>{NHAN_UU_TIEN[u]}</option>)}</select></div>
            <div className="truong"><label>Hạn sau (ngày)</label><input type="number" min={0} max={365} value={gt.soNgayHan} onChange={(e) => datGt({ ...gt, soNgayHan: e.target.value })} /></div>
            <div className="truong"><label>Trạng thái</label><select value={gt.trangThai} onChange={(e) => datGt({ ...gt, trangThai: e.target.value })}><option value="hoat-dong">Đang dùng</option><option value="ngung-hoat-dong">Ngừng</option></select></div>
          </div>
          <div className="truong"><label>Mô tả</label><textarea rows={2} value={gt.moTa} onChange={(e) => datGt({ ...gt, moTa: e.target.value })} /></div>
          <div className="truong"><label>Danh sách kiểm tra (mỗi dòng một mục, "?" đầu dòng = không bắt buộc)</label><textarea rows={3} value={gt.kiemTra} onChange={(e) => datGt({ ...gt, kiemTra: e.target.value })} /></div>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={gt.canDuyet} onChange={(e) => datGt({ ...gt, canDuyet: e.target.checked })} /> Cần duyệt khi xong</label>
          {gt.canDuyet && <ChonChuoi chuoi={chuoi} datChuoi={datChuoi} nguoi={nguoi} />}
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>Đóng</button>
          <button type="button" className="nut chinh" onClick={gui} disabled={dangGui}>{dangGui ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </HopThoai>
    </>
  );
}

export interface LapViecSua {
  id: string;
  ten: string;
  mauViecId: string | null;
  tieuDe: string;
  moTa: string | null;
  doKho: number;
  uuTien: string;
  canDuyet: boolean;
  tanSuat: string;
  thu: number[];
  ngayThang: number | null;
  gioHan: string;
  nguoi: Nguoi[];
  tuNgay: string;
  denNgay: string;
  trangThai: string;
  mucKiemTra: Muc[];
  chuoiDuyet: Cap[];
}

export function FormLapViec({ lap, nguoiGiao, nguoiDuyet, mau, homNay, nhanNut, lopNut = "nut chinh nho" }: { lap?: LapViecSua; nguoiGiao: Nguoi[]; nguoiDuyet: Nguoi[]; mau: { id: string; ten: string }[]; homNay: string; nhanNut: string; lopNut?: string }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const dau = {
    ten: lap?.ten ?? "", mauViecId: lap?.mauViecId ?? "", tieuDe: lap?.tieuDe ?? "", moTa: lap?.moTa ?? "", doKho: String(lap?.doKho ?? 3),
    uuTien: lap?.uuTien ?? "trung-binh", canDuyet: lap?.canDuyet ?? false, tanSuat: lap?.tanSuat ?? "tuan", thu: lap?.thu ?? [1],
    ngayThang: lap?.ngayThang ? String(lap.ngayThang) : "1", gioHan: lap?.gioHan ?? "17:00", nguoiIds: lap?.nguoi.map((n) => n.id) ?? [],
    tuNgay: lap?.tuNgay ?? homNay, denNgay: lap?.denNgay ?? "", trangThai: lap?.trangThai ?? "hoat-dong", kiemTra: mucRaChu(lap?.mucKiemTra ?? []),
  };
  const [gt, datGt] = useState(dau);
  const [chuoi, datChuoi] = useState<Cap[]>(lap?.chuoiDuyet ?? []);
  async function gui() {
    const { kiemTra, ...con } = gt;
    const than = { ...con, doKho: Number(gt.doKho), mucKiemTra: chuRaMuc(kiemTra), chuoiDuyet: chuoi, ngayThang: gt.tanSuat === "thang" ? gt.ngayThang : "" };
    if (await goi(lap ? `/api/v1/cong-viec/lap/${lap.id}` : "/api/v1/cong-viec/lap", lap ? "PUT" : "POST", than)) {
      hop.current?.close();
      router.refresh();
    }
  }
  return (
    <>
      <button type="button" className={lopNut} onClick={() => { datGt(dau); datChuoi(lap?.chuoiDuyet ?? []); datLoi(null); hop.current?.showModal(); }}>{nhanNut}</button>
      <HopThoai ref={hop} tieuDe={lap ? `Sửa việc định kỳ ${lap.ten}` : "Thêm việc định kỳ"} rong={680}>
        <div className="than">
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}{Object.values(loi.loiTruong ?? {}).flat().length ? ` — ${Object.values(loi.loiTruong).flat().join(" ")}` : ""}</div>}
          <div className="luoi-form">
            <div className="truong"><label>Tên lịch *</label><input value={gt.ten} onChange={(e) => datGt({ ...gt, ten: e.target.value })} placeholder="Kiểm tồn sáng thứ Hai" /></div>
            <div className="truong"><label>Tiêu đề việc *</label><input value={gt.tieuDe} onChange={(e) => datGt({ ...gt, tieuDe: e.target.value })} /></div>
            <div className="truong"><label>Mẫu việc</label><select value={gt.mauViecId} onChange={(e) => datGt({ ...gt, mauViecId: e.target.value })}><option value="">—</option>{mau.map((m) => <option key={m.id} value={m.id}>{m.ten}</option>)}</select></div>
            <div className="truong"><label>Độ khó</label><select value={gt.doKho} onChange={(e) => datGt({ ...gt, doKho: e.target.value })}>{[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d} — {NHAN_DO_KHO[d]}</option>)}</select></div>
            <div className="truong"><label>Lặp</label><select value={gt.tanSuat} onChange={(e) => datGt({ ...gt, tanSuat: e.target.value })}><option value="ngay">Hằng ngày</option><option value="tuan">Hằng tuần</option><option value="thang">Hằng tháng</option></select></div>
            {gt.tanSuat === "thang" && <div className="truong"><label>Ngày trong tháng</label><input type="number" min={1} max={31} value={gt.ngayThang} onChange={(e) => datGt({ ...gt, ngayThang: e.target.value })} /></div>}
            <div className="truong"><label>Hạn trong ngày</label><input type="time" value={gt.gioHan} onChange={(e) => datGt({ ...gt, gioHan: e.target.value })} /></div>
            <div className="truong"><label>Từ ngày</label><input type="date" value={gt.tuNgay} onChange={(e) => datGt({ ...gt, tuNgay: e.target.value })} /></div>
            <div className="truong"><label>Đến ngày (trống = không hạn)</label><input type="date" value={gt.denNgay} onChange={(e) => datGt({ ...gt, denNgay: e.target.value })} /></div>
            <div className="truong"><label>Trạng thái</label><select value={gt.trangThai} onChange={(e) => datGt({ ...gt, trangThai: e.target.value })}><option value="hoat-dong">Đang chạy</option><option value="ngung-hoat-dong">Dừng</option></select></div>
          </div>
          {gt.tanSuat === "tuan" && (
            <div className="truong">
              <label>Các thứ</label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5, 6, 7].map((t) => (
                  <label key={t} style={{ display: "flex", gap: 4 }}>
                    <input type="checkbox" checked={gt.thu.includes(t)} onChange={(e) => datGt({ ...gt, thu: e.target.checked ? [...gt.thu, t] : gt.thu.filter((x) => x !== t) })} /> {NHAN_THU[t]}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="truong">
            <label>Giao cho (mỗi người một việc mỗi lần lặp)</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 4 }}>
              {nguoiGiao.map((n) => (
                <label key={n.id} style={{ display: "flex", gap: 6 }}>
                  <input type="checkbox" checked={gt.nguoiIds.includes(n.id)} onChange={(e) => datGt({ ...gt, nguoiIds: e.target.checked ? [...gt.nguoiIds, n.id] : gt.nguoiIds.filter((x) => x !== n.id) })} /> {n.hoTen}
                </label>
              ))}
            </div>
          </div>
          <div className="truong"><label>Mô tả</label><textarea rows={2} value={gt.moTa} onChange={(e) => datGt({ ...gt, moTa: e.target.value })} /></div>
          <div className="truong"><label>Danh sách kiểm tra</label><textarea rows={2} value={gt.kiemTra} onChange={(e) => datGt({ ...gt, kiemTra: e.target.value })} /></div>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={gt.canDuyet} onChange={(e) => datGt({ ...gt, canDuyet: e.target.checked })} /> Cần duyệt khi xong</label>
          {gt.canDuyet && <ChonChuoi chuoi={chuoi} datChuoi={datChuoi} nguoi={nguoiDuyet} />}
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>Đóng</button>
          <button type="button" className="nut chinh" onClick={gui} disabled={dangGui}>{dangGui ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </HopThoai>
    </>
  );
}
