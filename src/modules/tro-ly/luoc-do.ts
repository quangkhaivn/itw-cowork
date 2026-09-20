import { z } from "zod";
import { uuidTuyChon } from "@/modules/crm/chung";

/** Lược đồ trợ lý AI. Luật: BUSINESS_RULES.md mục 15. */

export const LuocDoHoi = z.object({
  hoiThoaiId: uuidTuyChon,
  cauHoi: z.string().trim().min(2, "Nhập câu hỏi.").max(4000, "Câu hỏi quá dài."),
});

export const LuocDoTuChoiDeXuat = z.object({
  lyDo: z.string().trim().min(2, "Từ chối một đề xuất phải ghi lý do.").max(500),
});
