"use client";

import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";
import { NHAN_TRANG_THAI_VIEC, TRANG_THAI_VIEC } from "@/modules/crm/hang-so";

/** Đổi trạng thái công việc ngay trên danh sách: ô đánh dấu "xong" + chọn trạng thái. */
export default function TacVuViec({ id, trangThai }: { id: string; trangThai: string }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();

  async function doi(moi: string) {
    const kq = await goi(`/api/v1/cong-viec/${id}`, "PATCH", { trangThai: moi });
    if (kq) router.refresh();
  }

  return (
    <div className="tac-vu-viec">
      <input
        type="checkbox"
        aria-label="Đánh dấu xong"
        checked={trangThai === "xong"}
        disabled={dangGui || trangThai === "huy"}
        onChange={(e) => doi(e.target.checked ? "xong" : "mo")}
      />
      <select aria-label="Trạng thái" value={trangThai} disabled={dangGui} onChange={(e) => doi(e.target.value)}>
        {TRANG_THAI_VIEC.map((t) => (
          <option key={t} value={t}>
            {NHAN_TRANG_THAI_VIEC[t]}
          </option>
        ))}
      </select>
      {loi && <span className="loi-truong">{loi.thongBao}</span>}
    </div>
  );
}
