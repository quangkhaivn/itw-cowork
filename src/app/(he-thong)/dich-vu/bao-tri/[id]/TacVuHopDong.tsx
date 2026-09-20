"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Ghi nhận đã bảo trì xong một kỳ, và hủy hợp đồng (phải có lý do).
 *
 * Ghi nhận là chỗ DUY NHẤT đẩy mốc kỳ kế tiếp — không có ô nhập tay "kỳ sau là ngày
 * nào", để lịch bảo trì không bị sửa lệch khỏi chu kỳ đã ký (BT-03).
 */
export default function TacVuHopDong({
  id,
  ma,
  duocGhiNhan,
  duocHuy,
  homNay,
}: {
  id: string;
  ma: string;
  duocGhiNhan: boolean;
  duocHuy: boolean;
  homNay: string;
}) {
  const router = useRouter();
  const hopGhi = useRef<HTMLDialogElement | null>(null);
  const hopHuy = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [ngay, datNgay] = useState(homNay);
  const [ghiChu, datGhiChu] = useState("");
  const [lyDo, datLyDo] = useState("");

  async function ghiNhan() {
    const kq = await goi(`/api/v1/bao-tri/${id}/ghi-nhan`, "POST", { ngayBaoTri: ngay, ghiChu });
    if (!kq) return;
    hopGhi.current?.close();
    router.refresh();
  }

  async function huy() {
    const kq = await goi(`/api/v1/bao-tri/${id}/huy`, "POST", { lyDo });
    if (!kq) return;
    hopHuy.current?.close();
    router.refresh();
  }

  return (
    <>
      {duocGhiNhan && (
        <button
          type="button"
          className="nut chinh"
          onClick={() => {
            datLoi(null);
            datNgay(homNay);
            datGhiChu("");
            hopGhi.current?.showModal();
          }}
        >
          Ghi nhận đã bảo trì
        </button>
      )}
      {duocHuy && (
        <button
          type="button"
          className="nut trong"
          onClick={() => {
            datLoi(null);
            datLyDo("");
            hopHuy.current?.showModal();
          }}
        >
          Hủy hợp đồng
        </button>
      )}

      <HopThoai ref={hopGhi} tieuDe={`Ghi nhận bảo trì — ${ma}`} rong={480}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <p className="goi-y" style={{ marginTop: 0 }}>
            Ghi nhận xong, mốc kỳ kế tiếp tự đẩy lên theo chu kỳ đã ký. Hết kỳ cuối thì hợp đồng chuyển sang Hết hạn.
          </p>
          <div className="truong">
            <label htmlFor="bt-ngay">
              Ngày bảo trì <span className="bat-buoc">*</span>
            </label>
            <input id="bt-ngay" type="date" value={ngay} max={homNay} onChange={(e) => datNgay(e.target.value)} />
          </div>
          <div className="truong">
            <label htmlFor="bt-ghichu-ky">Ghi chú kỳ này</label>
            <input
              id="bt-ghichu-ky"
              type="text"
              value={ghiChu}
              onChange={(e) => datGhiChu(e.target.value)}
              placeholder="Đã làm gì, thay vật tư gì"
            />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopGhi.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className="nut chinh" onClick={ghiNhan} disabled={dangGui || !ngay}>
            {dangGui ? "Đang lưu…" : "Ghi nhận"}
          </button>
        </div>
      </HopThoai>

      <HopThoai ref={hopHuy} tieuDe={`Hủy hợp đồng ${ma}`} rong={460}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <div className="truong">
            <label htmlFor="bt-lydo">
              Lý do hủy <span className="bat-buoc">*</span>
            </label>
            <input id="bt-lydo" type="text" value={lyDo} onChange={(e) => datLyDo(e.target.value)} />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopHuy.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className="nut nguy-hiem" onClick={huy} disabled={dangGui || lyDo.trim().length < 2}>
            {dangGui ? "Đang lưu…" : "Hủy hợp đồng"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
