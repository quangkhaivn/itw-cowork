"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";

/**
 * Báo tiến độ (DG-13): % hoàn thành + ghi chú, kèm ảnh / tệp (đính kèm vào chính dòng tiến độ, loại
 * `task_progress`). Nhật ký chỉ ghi thêm; người giao nhận thông báo ngay.
 */
export default function BaoTienDo({ id, tienDo }: { id: string; tienDo: number }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [pt, datPt] = useState(String(tienDo));
  const [ghiChu, datGhiChu] = useState("");
  const [tep, datTep] = useState<File | null>(null);
  const [loiTep, datLoiTep] = useState<string | null>(null);

  async function gui() {
    datLoiTep(null);
    const kq = await goi<{ id: string }>(`/api/v1/cong-viec/${id}/tien-do`, "POST", { phanTram: Number(pt), ghiChu });
    if (!kq) return;
    if (tep) {
      const f = new FormData();
      f.set("loai", "task_progress");
      f.set("doiTuong", kq.id);
      f.set("tep", tep);
      const r = await fetch("/api/v1/dinh-kem", { method: "POST", body: f });
      if (!r.ok) {
        datLoiTep(((await r.json().catch(() => ({}))) as { thongBao?: string }).thongBao ?? "Không đính kèm được tệp.");
        router.refresh();
        return;
      }
    }
    hop.current?.close();
    datGhiChu("");
    datTep(null);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="nut" onClick={() => { datLoi(null); hop.current?.showModal(); }}>Báo tiến độ</button>
      <HopThoai ref={hop} tieuDe="Báo tiến độ">
        <div className="than">
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
          {loiTep && <div className="hop-thong-bao canh-bao" role="alert">Đã ghi tiến độ nhưng chưa đính được tệp: {loiTep}</div>}
          <div className="truong">
            <label htmlFor="td-pt">Đã hoàn thành (%)</label>
            <input id="td-pt" type="number" min={0} max={100} step={5} value={pt} onChange={(e) => datPt(e.target.value)} />
            {loiCua(loi, "phanTram") && <span className="loi-truong">{loiCua(loi, "phanTram")}</span>}
          </div>
          <div className="truong">
            <label htmlFor="td-gc">Ghi chú</label>
            <textarea id="td-gc" rows={3} value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} placeholder="Đã làm tới đâu, còn gì, cần ai hỗ trợ" />
          </div>
          <div className="truong">
            <label htmlFor="td-tep">Ảnh / tệp kèm (tùy chọn)</label>
            <input id="td-tep" type="file" onChange={(e) => datTep(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>Đóng</button>
          <button type="button" className="nut chinh" onClick={gui} disabled={dangGui}>{dangGui ? "Đang lưu…" : "Ghi tiến độ"}</button>
        </div>
      </HopThoai>
    </>
  );
}
