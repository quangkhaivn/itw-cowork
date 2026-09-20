"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Hủy một phiếu thu (ghi nhầm, séc không thanh toán). Phiếu không bị xóa — chuyển
 * trạng thái kèm lý do, và công nợ của hóa đơn quay lại đúng như trước (TC-09).
 */
export default function HuyPhieuThu({ phieuThuId, so }: { phieuThuId: string; so: string }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [lyDo, datLyDo] = useState("");

  async function chay() {
    const kq = await goi(`/api/v1/phieu-thu/${phieuThuId}/huy`, "POST", { lyDo });
    if (!kq) return;
    hop.current?.close();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="nut trong nho"
        onClick={() => {
          datLoi(null);
          datLyDo("");
          hop.current?.showModal();
        }}
      >
        Hủy
      </button>

      <HopThoai ref={hop} tieuDe={`Hủy phiếu thu ${so}`} rong={480}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <p className="goi-y" style={{ marginTop: 0 }}>
            Hủy phiếu thu thì công nợ của hóa đơn quay lại như trước khi thu. Phiếu vẫn nằm trong danh sách kèm lý do.
          </p>
          <div className="truong">
            <label htmlFor="pt-lydo">
              Lý do hủy <span className="bat-buoc">*</span>
            </label>
            <input id="pt-lydo" type="text" value={lyDo} onChange={(e) => datLyDo(e.target.value)} placeholder="Ví dụ: ghi nhầm khách, séc không thanh toán được" />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className="nut nguy-hiem" onClick={chay} disabled={dangGui || lyDo.trim().length < 2}>
            {dangGui ? "Đang lưu…" : "Hủy phiếu thu"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
