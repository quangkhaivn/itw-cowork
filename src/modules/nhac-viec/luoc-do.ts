import { z } from "zod";

/** Lược đồ nhắc việc và tự động hóa. Luật: BUSINESS_RULES.md mục 13. */

export const LuocDoBoQuaViec = z.object({
  lyDo: z.string().trim().min(2, "Bỏ qua một việc phải ghi lý do.").max(500),
});

export const LuocDoBatTatQuyTac = z.object({
  bat: z.boolean(),
});
