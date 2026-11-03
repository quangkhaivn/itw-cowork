"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Sửa loại kỳ / năm / số kỳ của kỳ đánh giá (Nhân sự). QĐ-140: kỳ đã có phiếu chốt thì khóa — máy chủ trả
 * 409 và CSDL cũng chặn; nút chỉ hiện lý do.
 */
export default function SuaKy({ ky }: { ky: { id: string; loai: "thang" | "quy"; nam: number; so: number; soChot: number } }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [gt, datGt] = useState({ loai: ky.loai, nam: ky.nam, so: ky.so });
  if (ky.soChot > 0) {
    return <span className="phu nho">Kỳ đã có {ky.soChot} phiếu chốt — không đổi được loại kỳ / ngày bắt đầu / ngày kết thúc.</span>;
  }
  async function gui() {
    if (await goi(`/api/v1/danh-gia/ky/${ky.id}`, "PATCH", gt)) {
      hop.current?.close();
      router.refresh();
    }
  }
  return (
    <>
      <button type="button" className="nut" onClick={() => { datLoi(null); datGt({ loai: ky.loai, nam: ky.nam, so: ky.so }); hop.current?.showModal(); }}>Sửa kỳ</button>
      <HopThoai ref={hop} tieuDe="Sửa kỳ đánh giá" rong={480}>
        <div className="than">
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
          <div className="luoi-form">
            <div className="truong">
              <label htmlFor="ky-loai">Loại kỳ</label>
              <select id="ky-loai" value={gt.loai} onChange={(e) => datGt({ ...gt, loai: e.target.value as "thang" | "quy", so: e.target.value === "quy" ? Math.min(gt.so, 4) : gt.so })}>
                <option value="thang">Tháng</option>
                <option value="quy">Quý</option>
              </select>
            </div>
            <div className="truong">
              <label htmlFor="ky-nam">Năm</label>
              <input id="ky-nam" type="number" min={2020} max={2100} value={gt.nam} onChange={(e) => datGt({ ...gt, nam: Number(e.target.value) })} />
            </div>
            <div className="truong">
              <label htmlFor="ky-so">{gt.loai === "thang" ? "Tháng" : "Quý"}</label>
              <input id="ky-so" type="number" min={1} max={gt.loai === "thang" ? 12 : 4} value={gt.so} onChange={(e) => datGt({ ...gt, so: Number(e.target.value) })} />
            </div>
          </div>
          <p className="goi-y">Phiếu chưa chốt giữ nguyên chỉ tiêu; mở từng phiếu bấm “Làm mới số liệu” để tính theo khoảng ngày mới.</p>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>Đóng</button>
          <button type="button" className="nut chinh" onClick={gui} disabled={dangGui}>{dangGui ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </HopThoai>
    </>
  );
}
