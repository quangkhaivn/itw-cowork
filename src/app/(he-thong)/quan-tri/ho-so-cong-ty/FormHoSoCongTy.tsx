"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

interface Muc {
  khoa: string;
  nhan: string;
  moTa?: string;
  nhieuDong?: boolean;
  toiDa: number;
}

/**
 * Form hồ sơ công ty. Chỉ gửi lên những mục đã đổi, nên hai người sửa hai mục khác nhau
 * không đè lên nhau. Mỗi lần đổi đều ghi Nhật ký kiểm toán.
 */
export default function FormHoSoCongTy({
  muc,
  giaTri,
  thieu,
  duocSua,
}: {
  muc: Muc[];
  giaTri: Record<string, string>;
  thieu: string[];
  duocSua: boolean;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [ban, datBan] = useState<Record<string, string>>(() => Object.fromEntries(muc.map((m) => [m.khoa, giaTri[m.khoa] ?? ""])));
  const [daLuu, datDaLuu] = useState<number | null>(null);

  const thayDoi = muc.filter((m) => (giaTri[m.khoa] ?? "") !== ban[m.khoa]);

  async function luu(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ soDoi: number }>("/api/v1/ho-so-cong-ty", "PATCH", {
      giaTri: Object.fromEntries(thayDoi.map((m) => [m.khoa, ban[m.khoa]])),
    });
    if (kq) {
      datDaLuu(kq.soDoi);
      router.refresh();
    }
  }

  return (
    <form className="the" onSubmit={luu}>
      {loi && (
        <div className="hop-thong-bao loi" role="alert" style={{ margin: 16 }}>
          {loi.thongBao}
        </div>
      )}
      {daLuu !== null && thayDoi.length === 0 && (
        <div className="hop-thong-bao tot" role="status" style={{ margin: 16 }}>
          Đã lưu {daLuu} thay đổi.
        </div>
      )}
      {thieu.length > 0 && (
        <div className="hop-thong-bao canh-bao" role="status" style={{ margin: 16 }}>
          Chưa khai: {thieu.join(", ")}. Báo giá in ra sẽ thiếu những mục này.
        </div>
      )}

      <div className="phan-form">
        <h3>Thông tin in trên chứng từ</h3>
        <div className="luoi-form">
          {muc.map((m) => (
            <div className={`truong${m.nhieuDong ? " ca-dong" : ""}`} key={m.khoa}>
              <label htmlFor={`hs-${m.khoa}`}>{m.nhan}</label>
              {m.nhieuDong ? (
                <textarea
                  id={`hs-${m.khoa}`}
                  rows={3}
                  maxLength={m.toiDa}
                  disabled={!duocSua}
                  value={ban[m.khoa]}
                  onChange={(e) => datBan((c) => ({ ...c, [m.khoa]: e.target.value }))}
                />
              ) : (
                <input
                  id={`hs-${m.khoa}`}
                  type="text"
                  maxLength={m.toiDa}
                  disabled={!duocSua}
                  value={ban[m.khoa]}
                  onChange={(e) => datBan((c) => ({ ...c, [m.khoa]: e.target.value }))}
                />
              )}
              {m.moTa && <span className="goi-y">{m.moTa}</span>}
            </div>
          ))}
        </div>
      </div>

      {duocSua && (
        <div className="chan-form">
          <span className="goi-y" style={{ marginRight: "auto" }}>
            {thayDoi.length > 0 ? `${thayDoi.length} mục đang đổi` : "Chưa có thay đổi"}
          </span>
          <button type="submit" className="nut chinh" disabled={dangGui || thayDoi.length === 0}>
            {dangGui ? "Đang lưu…" : "Lưu hồ sơ"}
          </button>
        </div>
      )}
    </form>
  );
}
