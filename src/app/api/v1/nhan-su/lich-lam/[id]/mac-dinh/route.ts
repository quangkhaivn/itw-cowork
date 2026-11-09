import { z } from "zod";
import { xuLyApi } from "@/lib/api";
import { datLichMacDinh } from "@/modules/nhan-su/service";

export const dynamic = "force-dynamic";

const Than = z.object({ tuNgay: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ."), z.literal("")]).optional() });

/** 0.22.0 (QĐ-171, QĐ-187): chọn lịch này làm lịch mặc định, áp TỪ NGÀY chọn (mặc định hôm nay) — không hồi tố tháng đã khóa. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const d = Than.parse(await req.json().catch(() => ({})));
  return datLichMacDinh(nc, id, d.tuNgay || undefined);
}, { quyen: "nhan_su.update" });
