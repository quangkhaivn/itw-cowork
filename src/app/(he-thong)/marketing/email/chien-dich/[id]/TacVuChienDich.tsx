"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";

type Viec = "gui-duyet" | "tra-ve" | "duyet" | "tam-dung" | "tiep-tuc" | "huy";

const NHAN: Record<Viec, { nut: string; tieuDe: string; moTa: string; lyDo: "bat-buoc" | "tuy-chon" | "khong"; lop: string }> = {
  "gui-duyet": { nut: "Gửi duyệt", tieuDe: "Gửi duyệt", moTa: "Nội dung và điều kiện người nhận khóa lại cho tới khi người duyệt trả về.", lyDo: "khong", lop: "chinh" },
  "tra-ve": { nut: "Trả về Nháp", tieuDe: "Trả về Nháp", moTa: "Người lập sửa lại rồi gửi duyệt lần nữa.", lyDo: "bat-buoc", lop: "trong" },
  duyet: {
    nut: "Duyệt và gửi",
    tieuDe: "Duyệt và đưa vào hàng gửi",
    moTa: "Danh sách người nhận được chốt ngay lúc này (đã loại người từ chối, email hỏng, trùng). Máy bắt đầu gửi dần theo tốc độ ở Cấu hình.",
    lyDo: "khong",
    lop: "chinh",
  },
  "tam-dung": { nut: "Tạm dừng", tieuDe: "Tạm dừng gửi", moTa: "Thư đã gửi giữ nguyên; người còn chờ chưa nhận cho tới khi tiếp tục.", lyDo: "tuy-chon", lop: "" },
  "tiep-tuc": { nut: "Tiếp tục gửi", tieuDe: "Tiếp tục gửi", moTa: "Máy gửi tiếp cho người còn chờ. Không ai nhận hai lần.", lyDo: "khong", lop: "chinh" },
  huy: { nut: "Huỷ chiến dịch", tieuDe: "Huỷ chiến dịch", moTa: "Người còn chờ chuyển sang 'bị loại'. Không mở lại được.", lyDo: "bat-buoc", lop: "trong" },
};

export default function TacVuChienDich({ id, ma, viec }: { id: string; ma: string; viec: Viec[] }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [dang, datDang] = useState<Viec | null>(null);
  const [lyDo, datLyDo] = useState("");

  async function lam() {
    if (!dang) return;
    const kq = await goi(`/api/v1/email/chien-dich/${id}/${dang}`, "POST", NHAN[dang].lyDo === "khong" ? undefined : { lyDo });
    if (kq) {
      hop.current?.close();
      router.refresh();
    }
  }

  return (
    <>
      {viec.map((v) => (
        <button
          key={v}
          type="button"
          className={`nut ${NHAN[v].lop}`}
          onClick={() => {
            datLoi(null);
            datLyDo("");
            datDang(v);
            hop.current?.showModal();
          }}
        >
          {NHAN[v].nut}
        </button>
      ))}
      <HopThoai ref={hop} tieuDe={dang ? `${NHAN[dang].tieuDe} — ${ma}` : ""} rong={520}>
        <div className="than">
          {dang && <p className="phu">{NHAN[dang].moTa}</p>}
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          {dang && NHAN[dang].lyDo !== "khong" && (
            <div className="truong">
              <label htmlFor="cd-ly-do">Lý do{NHAN[dang].lyDo === "tuy-chon" ? " (tuỳ chọn)" : ""}</label>
              <textarea id="cd-ly-do" rows={3} value={lyDo} maxLength={2000} onChange={(e) => datLyDo(e.target.value)} />
            </div>
          )}
        </div>
        <div className="chan-form">
          <button type="button" className="nut trong" onClick={() => hop.current?.close()}>
            Thôi
          </button>
          <button type="button" className="nut chinh" disabled={dangGui || (dang !== null && NHAN[dang].lyDo === "bat-buoc" && lyDo.trim().length < 2)} onClick={lam}>
            {dang ? NHAN[dang].nut : ""}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
