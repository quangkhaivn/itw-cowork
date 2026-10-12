"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

/** Ghi nhận khách đồng ý / từ chối nhận tin marketing (MK-13) — bắt buộc ghi qua đâu. */
export default function NutDongYNhanTin({ doiTuong, id, dangDongY }: { doiTuong: "lead" | "lien-he"; id: string; dangDongY: boolean }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement>(null);
  const { goi, dangGui, loi } = useGoiApi();
  const [nguon, datNguon] = useState("");
  const dongY = !dangDongY;
  return (
    <>
      <button type="button" className={`nut nho ${dangDongY ? "nguy-hiem" : ""}`} onClick={() => hop.current?.showModal()}>
        {dangDongY ? "Ghi nhận từ chối nhận tin" : "Ghi nhận đồng ý nhận tin"}
      </button>
      <HopThoai ref={hop} tieuDe={dongY ? "Khách đồng ý nhận tin marketing" : "Khách từ chối nhận tin marketing"}>
        <div className="than">
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
          <div className="truong">
            <label htmlFor={`dy-${id}`}>Khách {dongY ? "đồng ý" : "từ chối"} qua đâu, lúc nào</label>
            <input id={`dy-${id}`} type="text" value={nguon} onChange={(e) => datNguon(e.target.value)} placeholder="vd: gọi điện 12/10, khách nói rõ" />
            {dongY && <span className="goi-y">Chỉ ghi khi chính khách đồng ý. Từ chối luôn thắng: khách đã từ chối thì không gửi tin.</span>}
          </div>
        </div>
        <div className="chan-form">
          <button
            type="button"
            className="nut chinh"
            disabled={dangGui || nguon.trim().length < 2}
            onClick={async () => {
              if (await goi(`/api/v1/marketing/dong-y/${doiTuong}/${id}`, "POST", { dongY, nguon })) {
                hop.current?.close();
                router.refresh();
              }
            }}
          >
            Lưu
          </button>
        </div>
      </HopThoai>
    </>
  );
}
