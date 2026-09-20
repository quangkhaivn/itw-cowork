"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";

/**
 * Chốt một dòng gia hạn thành cơ hội, hoặc bỏ qua kèm lý do.
 *
 * Cố ý bắt người dùng nhập **việc sẽ làm tiếp** và **ngày** — cơ hội không có hành động
 * kế tiếp là cơ hội sẽ nằm im, đúng thứ mà bộ nhắc việc phải đi dọn sau này.
 */
export default function TacVuGiaHan({
  id,
  tieuDe,
  duocChot,
  duocBoQua,
  ngayGoiY,
}: {
  id: string;
  tieuDe: string;
  duocChot: boolean;
  duocBoQua: boolean;
  ngayGoiY: string;
}) {
  const router = useRouter();
  const hopChot = useRef<HTMLDialogElement | null>(null);
  const hopBo = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [gt, datGt] = useState({ tieuDe, giaTri: "", hanhDongKeTiep: "Gọi khách mời gia hạn", ngayHanhDong: ngayGoiY });
  const [lyDo, datLyDo] = useState("");

  async function chot() {
    const kq = await goi<{ coHoiId: string }>(`/api/v1/gia-han/${id}/chot`, "POST", gt);
    if (!kq) return;
    hopChot.current?.close();
    router.push(`/ban-hang/co-hoi/${kq.coHoiId}`);
  }

  async function boQua() {
    const kq = await goi(`/api/v1/gia-han/${id}/bo-qua`, "POST", { lyDo });
    if (!kq) return;
    hopBo.current?.close();
    router.refresh();
  }

  return (
    <>
      {duocChot && (
        <button
          type="button"
          className="nut nho"
          onClick={() => {
            datLoi(null);
            hopChot.current?.showModal();
          }}
        >
          Mở cơ hội
        </button>
      )}
      {duocBoQua && (
        <button
          type="button"
          className="nut trong nho"
          onClick={() => {
            datLoi(null);
            datLyDo("");
            hopBo.current?.showModal();
          }}
        >
          Bỏ qua
        </button>
      )}

      <HopThoai ref={hopChot} tieuDe="Mở cơ hội gia hạn" rong={520}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <div className="truong">
            <label htmlFor="gh-tieude">Tiêu đề cơ hội</label>
            <input id="gh-tieude" type="text" value={gt.tieuDe} onChange={(e) => datGt({ ...gt, tieuDe: e.target.value })} />
            {loiCua(loi, "tieuDe") && <span className="loi-truong">{loiCua(loi, "tieuDe")}</span>}
          </div>
          <div className="truong">
            <label htmlFor="gh-hanhdong">
              Việc sẽ làm tiếp <span className="bat-buoc">*</span>
            </label>
            <input
              id="gh-hanhdong"
              type="text"
              value={gt.hanhDongKeTiep}
              onChange={(e) => datGt({ ...gt, hanhDongKeTiep: e.target.value })}
            />
            {loiCua(loi, "hanhDongKeTiep") && <span className="loi-truong">{loiCua(loi, "hanhDongKeTiep")}</span>}
          </div>
          <div className="truong">
            <label htmlFor="gh-ngay">
              Ngày làm <span className="bat-buoc">*</span>
            </label>
            <input
              id="gh-ngay"
              type="date"
              value={gt.ngayHanhDong}
              onChange={(e) => datGt({ ...gt, ngayHanhDong: e.target.value })}
            />
            {loiCua(loi, "ngayHanhDong") && <span className="loi-truong">{loiCua(loi, "ngayHanhDong")}</span>}
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopChot.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button
            type="button"
            className="nut chinh"
            onClick={chot}
            disabled={dangGui || gt.hanhDongKeTiep.trim().length < 3 || !gt.ngayHanhDong}
          >
            {dangGui ? "Đang tạo…" : "Mở cơ hội"}
          </button>
        </div>
      </HopThoai>

      <HopThoai ref={hopBo} tieuDe="Bỏ qua lần gia hạn này" rong={460}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <div className="truong">
            <label htmlFor="gh-lydo">
              Vì sao bỏ qua? <span className="bat-buoc">*</span>
            </label>
            <input
              id="gh-lydo"
              type="text"
              value={lyDo}
              onChange={(e) => datLyDo(e.target.value)}
              placeholder="Ví dụ: khách đã thanh lý thiết bị"
            />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopBo.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className="nut chinh" onClick={boQua} disabled={dangGui || lyDo.trim().length < 2}>
            {dangGui ? "Đang lưu…" : "Bỏ qua"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
