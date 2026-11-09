"use client";

import { useState } from "react";
import { useGoiApi } from "@/components/ui/goi-api";

type KetQua = { lanCuoi: string | null; ipCuoi: string | null; giayTruoc: number | null; trucTuyen: boolean; goiY: string };

/** QĐ-178: nút "Kiểm tra kết nối" — hỏi máy chủ lần gọi cuối của máy và IP nguồn. */
export default function KiemTraKetNoi({ id }: { id: string }) {
  const { goi, dangGui, loi } = useGoiApi();
  const [kq, datKq] = useState<KetQua | null>(null);
  const truoc = (g: number) => (g < 60 ? `${g} giây trước` : g < 3600 ? `${Math.round(g / 60)} phút trước` : `${Math.round(g / 3600)} giờ trước`);
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, maxWidth: 360 }}>
      <button type="button" className="nut nho" disabled={dangGui} onClick={async () => datKq(await goi<KetQua>(`/api/v1/may-cham-cong/${id}/kiem-tra`, "GET"))}>
        {dangGui ? "Đang kiểm…" : "Kiểm tra kết nối"}
      </button>
      {loi && <span className="loi-truong" role="alert">{loi.thongBao}</span>}
      {kq && (
        <span className={`hop-thong-bao ${kq.trucTuyen ? "tot" : "canh-bao"} nho`} role="status">
          {kq.lanCuoi
            ? <>Lần gọi cuối: {new Date(kq.lanCuoi).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}{kq.giayTruoc !== null && ` (${truoc(kq.giayTruoc)})`} · IP nguồn {kq.ipCuoi ?? "—"}. </>
            : "Chưa nhận được lần gọi nào. "}
          {kq.goiY}
        </span>
      )}
    </span>
  );
}
