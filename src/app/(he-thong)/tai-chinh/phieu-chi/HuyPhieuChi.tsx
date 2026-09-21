"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Hủy một phiếu chi (chuyển nhầm, séc không thanh toán). Phiếu không bị xóa — chuyển
 * trạng thái kèm lý do, và nợ phải trả của hóa đơn quay lại đúng như trước (CT-09).
 */
export default function HuyPhieuChi({ phieuChiId, so }: { phieuChiId: string; so: string }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [lyDo, datLyDo] = useState("");

  async function chay() {
    const kq = await goi(`/api/v1/phieu-chi/${phieuChiId}/huy`, "POST", { lyDo });
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

      <HopThoai ref={hop} tieuDe={`Hủy phiếu chi ${so}`} rong={480}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <p className="goi-y" style={{ marginTop: 0 }}>
            Hủy phiếu chi thì nợ phải trả của hóa đơn quay lại như trước khi chi. Phiếu vẫn nằm trong danh sách kèm lý do.
          </p>
          <div className="truong">
            <label htmlFor="pc-lydo">
              Lý do hủy <span className="bat-buoc">*</span>
            </label>
            <input
              id="pc-lydo"
              type="text"
              value={lyDo}
              onChange={(e) => datLyDo(e.target.value)}
              placeholder="Ví dụ: chuyển nhầm số tài khoản"
            />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className="nut nguy-hiem" onClick={chay} disabled={dangGui || lyDo.trim().length < 2}>
            {dangGui ? "Đang lưu…" : "Hủy phiếu chi"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
