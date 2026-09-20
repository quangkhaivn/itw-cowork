"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Hai nút của một việc hôm nay: **Đã xử lý** và **Bỏ qua** (phải ghi lý do).
 *
 * Bỏ qua có lý do chứ không xóa lặng lẽ, vì lý do bỏ qua chính là dữ liệu để biết quy
 * tắc nào đang nhắc sai và cần chỉnh ngưỡng (TD-06).
 */
export default function TacVuViec({ id, tieuDe }: { id: string; tieuDe: string }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [lyDo, datLyDo] = useState("");

  async function xong() {
    const kq = await goi(`/api/v1/viec-hom-nay/${id}/xong`, "POST", {});
    if (kq) router.refresh();
  }

  async function boQua() {
    const kq = await goi(`/api/v1/viec-hom-nay/${id}/bo-qua`, "POST", { lyDo });
    if (!kq) return;
    hop.current?.close();
    router.refresh();
  }

  return (
    <>
      <button type="button" className="nut nho" onClick={xong} disabled={dangGui}>
        Đã xử lý
      </button>
      <button
        type="button"
        className="nut trong nho"
        onClick={() => {
          datLoi(null);
          datLyDo("");
          hop.current?.showModal();
        }}
      >
        Bỏ qua
      </button>

      <HopThoai ref={hop} tieuDe="Bỏ qua việc này" rong={460}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <p className="goi-y" style={{ marginTop: 0 }}>
            {tieuDe}
          </p>
          <div className="truong">
            <label htmlFor="vhn-lydo">
              Vì sao bỏ qua? <span className="bat-buoc">*</span>
            </label>
            <input
              id="vhn-lydo"
              type="text"
              value={lyDo}
              onChange={(e) => datLyDo(e.target.value)}
              placeholder="Ví dụ: khách đã hẹn tuần sau, không cần nhắc nữa"
            />
            <span className="goi-y">Lý do giúp biết quy tắc nào đang nhắc sai để chỉnh lại ngưỡng.</span>
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>
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
