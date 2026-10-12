import { z } from "zod";
import { docTruyVan, xuLyApi } from "@/lib/api";
import { nhatKyNhanLead } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

const LuocDo = z.object({
  kenh: z.enum(["", "form", "landing", "webhook", "nhap-tay"]).optional().default(""),
  ketQua: z.enum(["", "tao-moi", "ghi-them", "tu-choi", "spam"]).optional().default(""),
  chienDichId: z.union([z.uuid(), z.literal("")]).optional().default(""),
  webhookSourceId: z.union([z.uuid(), z.literal("")]).optional().default(""),
  formId: z.union([z.uuid(), z.literal("")]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
});

export const GET = xuLyApi((nc, req) => nhatKyNhanLead(nc, docTruyVan(req, LuocDo)), { quyen: "marketing.view" });
