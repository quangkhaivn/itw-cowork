"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Sửa thời hạn hoặc hủy một phiếu bảo hành. Cả hai việc đều bắt ghi lý do (BH-04, BH-05)
 * — bảo hành là cam kết với khách, đổi thì phải biết vì sao và ai đổi.
 */
export default function TacVuBaoHanh({
  baoHanhId,
  soThang,
  ngayBatDau,
  daHuy,
}: {
  baoHanhId: string;
  soThang: number;
  ngayBatDau: string;
  daHuy: boolean;
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [viec, datViec] = useState<"sua" | "huy">("sua");
  const [thang, datThang] = useState(String(soThang));
  const [batDau, datBatDau] = useState(ngayBatDau);
  const [lyDo, datLyDo] = useState("");

  if (daHuy) return null;

  const mo = (v: "sua" | "huy") => {
    datViec(v);
    datLoi(null);
    datLyDo("");
    hop.current?.showModal();
  };

  async function chay() {
    const kq =
      viec === "sua"
        ? await goi(`/api/v1/bao-hanh/${baoHanhId}`, "PATCH", { soThang: Number(thang), ngayBatDau: batDau, lyDo })
        : await goi(`/api/v1/bao-hanh/${baoHanhId}/huy`, "POST", { lyDo });
    if (!kq) return;
    hop.current?.close();
    router.refresh();
  }

  return (
    <>
      <div className="hanh-dong">
        <button type="button" className="nut" onClick={() => mo("sua")}>
          Sửa thời hạn
        </button>
        <button type="button" className="nut nguy-hiem" onClick={() => mo("huy")}>
          Hủy bảo hành
        </button>
      </div>

      <HopThoai ref={hop} tieuDe={viec === "sua" ? "Sửa thời hạn bảo hành" : "Hủy bảo hành"} rong={520}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}

          {viec === "sua" ? (
            <div className="luoi-form">
              <div className="truong">
                <label htmlFor="bh-thang">Số tháng bảo hành</label>
                <input id="bh-thang" type="number" min={0} max={240} value={thang} onChange={(e) => datThang(e.target.value)} />
              </div>
              <div className="truong">
                <label htmlFor="bh-batdau">Tính từ ngày</label>
                <input id="bh-batdau" type="date" value={batDau} onChange={(e) => datBatDau(e.target.value)} />
              </div>
            </div>
          ) : (
            <p className="goi-y" style={{ marginTop: 0 }}>
              Phiếu bảo hành không bị xóa — nó chuyển sang trạng thái “đã hủy” kèm lý do, để sau này còn tra.
            </p>
          )}

          <div className="truong">
            <label htmlFor="bh-lydo">
              Lý do <span className="bat-buoc">*</span>
            </label>
            <input
              id="bh-lydo"
              type="text"
              value={lyDo}
              onChange={(e) => datLyDo(e.target.value)}
              placeholder={viec === "sua" ? "Ví dụ: hãng nâng bảo hành lên 36 tháng" : "Ví dụ: giao nhầm máy, đã thu hồi"}
            />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className={`nut ${viec === "huy" ? "nguy-hiem" : "chinh"}`} onClick={chay} disabled={dangGui || lyDo.trim().length < 2}>
            {dangGui ? "Đang lưu…" : viec === "sua" ? "Lưu thời hạn" : "Hủy bảo hành"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
