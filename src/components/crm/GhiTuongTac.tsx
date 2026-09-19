"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { LOAI_TUONG_TAC, NHAN_TUONG_TAC } from "@/modules/crm/hang-so";

/** "yyyy-mm-ddTHH:mm" theo giờ Việt Nam, cho giá trị mặc định của ô datetime-local. */
function bayGioVN(): string {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

/**
 * Form ghi nhanh một tương tác đã xảy ra (gọi, Zalo, gặp…). Gắn vào khách / lead / cơ hội
 * qua props. Lưu xong thì làm mới trang để dòng thời gian cập nhật.
 */
export default function GhiTuongTac({
  khachHangId,
  leadId,
  coHoiId,
  lienHe = [],
}: {
  khachHangId?: string;
  leadId?: string;
  coHoiId?: string;
  lienHe?: { id: string; hoTen: string }[];
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const macDinh = { loai: "call", tieuDe: "", noiDung: "", ketQua: "", luc: bayGioVN(), lienHeId: "" };
  const [gt, datGt] = useState(macDinh);
  const [daLuu, datDaLuu] = useState(false);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi("/api/v1/tuong-tac", "POST", {
      ...gt,
      khachHangId: khachHangId ?? null,
      leadId: leadId ?? null,
      coHoiId: coHoiId ?? null,
    });
    if (kq) {
      datGt({ ...macDinh, luc: bayGioVN() });
      datDaLuu(true);
      router.refresh();
    }
  }

  return (
    <form className="ghi-tuong-tac" onSubmit={gui} noValidate>
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      {daLuu && !loi && <div className="hop-thong-bao tot" role="status">Đã ghi tương tác.</div>}
      <div className="hang-nhap">
        <select aria-label="Loại tương tác" value={gt.loai} onChange={(e) => datGt({ ...gt, loai: e.target.value })}>
          {LOAI_TUONG_TAC.map((l) => (
            <option key={l} value={l}>
              {NHAN_TUONG_TAC[l]}
            </option>
          ))}
        </select>
        <input
          type="text"
          aria-label="Tóm tắt"
          placeholder="Tóm tắt: đã trao đổi gì?"
          value={gt.tieuDe}
          onChange={(e) => {
            datGt({ ...gt, tieuDe: e.target.value });
            datDaLuu(false);
          }}
          aria-invalid={loiCua(loi, "tieuDe") ? true : undefined}
        />
        <input
          type="datetime-local"
          aria-label="Thời điểm"
          value={gt.luc}
          max={bayGioVN()}
          onChange={(e) => datGt({ ...gt, luc: e.target.value })}
        />
      </div>
      {loiCua(loi, "tieuDe") && <span className="loi-truong">{loiCua(loi, "tieuDe")}</span>}
      {loiCua(loi, "luc") && <span className="loi-truong">{loiCua(loi, "luc")}</span>}
      <textarea
        aria-label="Nội dung chi tiết"
        placeholder="Nội dung chi tiết (tùy chọn)"
        value={gt.noiDung}
        onChange={(e) => datGt({ ...gt, noiDung: e.target.value })}
        rows={2}
      />
      <div className="hang-nhap">
        <input
          type="text"
          aria-label="Kết quả"
          placeholder="Kết quả (ví dụ: hẹn gửi báo giá thứ Hai)"
          value={gt.ketQua}
          onChange={(e) => datGt({ ...gt, ketQua: e.target.value })}
        />
        {lienHe.length > 0 && (
          <select aria-label="Người liên hệ" value={gt.lienHeId} onChange={(e) => datGt({ ...gt, lienHeId: e.target.value })}>
            <option value="">— Người liên hệ —</option>
            {lienHe.map((l) => (
              <option key={l.id} value={l.id}>
                {l.hoTen}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className="nut chinh" disabled={dangGui || gt.tieuDe.trim().length < 2}>
          {dangGui ? "Đang ghi…" : "Ghi tương tác"}
        </button>
      </div>
    </form>
  );
}
