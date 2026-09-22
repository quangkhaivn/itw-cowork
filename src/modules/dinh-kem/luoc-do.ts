import { z } from "zod";

/** Lược đồ tệp đính kèm. Luật: BUSINESS_RULES.md mục 20 (DK). */

export const LuocDoGoTep = z.object({
  lyDo: z.string().trim().min(2, "Gỡ tệp phải ghi lý do.").max(500),
});
export type DuLieuGoTep = z.infer<typeof LuocDoGoTep>;
