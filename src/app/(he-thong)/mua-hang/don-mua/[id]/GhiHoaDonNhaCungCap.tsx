"use client";

import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

/**
 * Lập hóa đơn nhà cung cấp từ đơn mua này, rồi mở luôn hóa đơn đó.
 *
 * Gọi lần hai trả về đúng hóa đơn cũ (CT-02), nên bấm nhầm hai lần cũng không sinh hai
 * hóa đơn — chỉ mở lại cái đã có.
 */
export default function GhiHoaDonNhaCungCap({ donMuaId }: { donMuaId: string }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();

  async function lap() {
    const kq = await goi<{ id: string; daCoTruoc: boolean }>("/api/v1/hoa-don-mua", "POST", { donMuaId });
    if (!kq) return;
    router.push(`/tai-chinh/hoa-don-mua/${kq.id}${kq.daCoTruoc ? "" : "?moTao=1"}`);
  }

  return (
    <>
      <button type="button" className="nut" onClick={lap} disabled={dangGui}>
        {dangGui ? "Đang lập…" : "Ghi hóa đơn nhà cung cấp"}
      </button>
      {loi && (
        <div className="hop-thong-bao loi" role="alert" style={{ marginTop: 8 }}>
          {loi.thongBao}
        </div>
      )}
    </>
  );
}
