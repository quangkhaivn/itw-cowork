"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

/** Công tắc bật/tắt một quy tắc. Tắt thì lần quét sau bỏ qua và ghi rõ là "đang tắt". */
export function CongTacQuyTac({ ma, bat, duocSua }: { ma: string; bat: boolean; duocSua: boolean }) {
  const router = useRouter();
  const { goi, dangGui } = useGoiApi();
  const [dangBat, datDangBat] = useState(bat);

  async function doi() {
    const moi = !dangBat;
    datDangBat(moi);
    const kq = await goi(`/api/v1/tu-dong-hoa/quy-tac/${ma}`, "PATCH", { bat: moi });
    if (!kq) {
      datDangBat(!moi);
      return;
    }
    router.refresh();
  }

  return (
    <label className="o-chon">
      <input type="checkbox" checked={dangBat} onChange={doi} disabled={!duocSua || dangGui} />
      <span>{dangBat ? "Đang bật" : "Đang tắt"}</span>
    </label>
  );
}

/**
 * Nút "Chạy quét ngay" — chạy đúng bản quét mà worker chạy mỗi sáng, chỉ khác là lần
 * chạy được ghi là "tay" kèm tên người bấm.
 */
export function NutChayQuet() {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [ketQua, datKetQua] = useState<string | null>(null);

  async function chay() {
    datKetQua(null);
    const kq = await goi<{ soViec: number; soThongBao: number; soQuyTacChay: number; soQuyTacBoQua: number }>(
      "/api/v1/tu-dong-hoa/chay",
      "POST",
      {},
    );
    if (!kq) {
      // Bản quét hỏng vẫn được ghi vào Lịch sử chạy nền (0.16.1) — tải lại để thấy dòng "Hỏng".
      router.refresh();
      return;
    }
    datKetQua(
      `Đã quét: ${kq.soQuyTacChay} quy tắc chạy, ${kq.soQuyTacBoQua} bỏ qua, sinh ${kq.soViec} việc và ${kq.soThongBao} thông báo.`,
    );
    router.refresh();
  }

  return (
    <>
      <button type="button" className="nut chinh" onClick={chay} disabled={dangGui}>
        {dangGui ? "Đang quét…" : "Chạy quét ngay"}
      </button>
      {loi && (
        <div className="hop-thong-bao loi" role="alert" style={{ marginTop: 10 }}>
          {loi.thongBao}
        </div>
      )}
      {ketQua && (
        <div className="hop-thong-bao tot" role="status" style={{ marginTop: 10 }}>
          {ketQua}
        </div>
      )}
    </>
  );
}
