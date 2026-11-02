"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

interface ChiTieu {
  id: string;
  ten: string;
  nguon: string;
  tuCham: number | null;
  tuGhiChu: string;
  quanLyCham: number | null;
  quanLyGhiChu: string;
  diem: number | null;
}

/**
 * Bảng chấm cho một bước: `tu` = nhân viên tự đánh giá (điểm tự chấm + giải trình từng chỉ tiêu, ghi
 * chú chung); `quan-ly` = quản lý chấm (điểm chỉ tiêu tay; chỉ tiêu tự tính chấm đè khi cần) + nhận xét;
 * `dieu-chinh` = phiên điều chỉnh sau khi chốt (điểm mới + lý do).
 */
export default function ChamPhieu({ id, che, chiTieu, ghiChuDau }: { id: string; che: "tu" | "quan-ly" | "dieu-chinh"; chiTieu: ChiTieu[]; ghiChuDau: string }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [diem, datDiem] = useState<Record<string, string>>(
    Object.fromEntries(chiTieu.map((c) => [c.id, String((che === "tu" ? c.tuCham : che === "quan-ly" ? c.quanLyCham : c.diem) ?? "")])),
  );
  const [ghi, datGhi] = useState<Record<string, string>>(Object.fromEntries(chiTieu.map((c) => [c.id, che === "tu" ? c.tuGhiChu : c.quanLyGhiChu])));
  const [chung, datChung] = useState(ghiChuDau);

  async function gui(nop: boolean) {
    if (che === "dieu-chinh") {
      const doi = chiTieu.filter((c) => diem[c.id] !== "" && Number(diem[c.id]) !== c.diem).map((c) => ({ id: c.id, diem: Number(diem[c.id]) }));
      if (await goi(`/api/v1/danh-gia/${id}/dieu-chinh`, "POST", { lyDo: chung, chiTieu: doi })) router.refresh();
      return;
    }
    if (nop && !window.confirm(che === "tu" ? "Gửi tự đánh giá cho quản lý? Gửi rồi không sửa được." : "Gửi chốt? Sau bước này chỉ người chốt thao tác.")) return;
    const ds = chiTieu.map((c) => ({ id: c.id, diem: diem[c.id] === "" ? null : Number(diem[c.id]), ghiChu: ghi[c.id] ?? "" }));
    const url = che === "tu" ? `/api/v1/danh-gia/${id}/tu-danh-gia` : `/api/v1/danh-gia/${id}/cham`;
    const than = che === "tu" ? { ghiChu: chung, chiTieu: ds, nop } : { nhanXet: chung, chiTieu: ds, nop };
    if (await goi(url, "POST", than)) router.refresh();
  }

  return (
    <div className="than">
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      <div className="cuon-ngang"><table className="bang">
        <thead><tr><th>Chỉ tiêu</th><th style={{ width: 110 }}>{che === "tu" ? "Tự chấm (0–100)" : "Điểm (% đạt)"}</th>{che !== "dieu-chinh" && <th>{che === "tu" ? "Giải trình" : "Ghi chú"}</th>}</tr></thead>
        <tbody>{chiTieu.map((c) => (
          <tr key={c.id}>
            <td>{c.ten}{c.nguon === "tu-dong" && <span className="phu nho"> (tự tính{che === "quan-ly" ? " — để trống = dùng % đạt máy tính" : ""})</span>}</td>
            <td><input type="number" min={0} max={200} step="any" value={diem[c.id]} onChange={(e) => datDiem({ ...diem, [c.id]: e.target.value })} /></td>
            {che !== "dieu-chinh" && <td><input type="text" value={ghi[c.id] ?? ""} onChange={(e) => datGhi({ ...ghi, [c.id]: e.target.value })} /></td>}
          </tr>
        ))}</tbody>
      </table></div>
      <div className="truong">
        <label>{che === "tu" ? "Tự nhận xét / giải trình chung" : che === "quan-ly" ? "Nhận xét của quản lý" : "Lý do điều chỉnh (bắt buộc, ≥ 10 ký tự)"}</label>
        <textarea rows={3} value={chung} onChange={(e) => datChung(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {che !== "dieu-chinh" && <button type="button" className="nut" disabled={dangGui} onClick={() => gui(false)}>Lưu</button>}
        <button type="button" className="nut chinh" disabled={dangGui} onClick={() => gui(true)}>
          {che === "tu" ? "Gửi quản lý" : che === "quan-ly" ? "Chấm xong, gửi chốt" : "Ghi điều chỉnh"}
        </button>
      </div>
    </div>
  );
}
