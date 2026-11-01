import { z } from "zod";
import { docTruyVan, xuLyApi } from "@/lib/api";
import { soDuPhepCua } from "@/modules/nghi-phep/service";

export const dynamic = "force-dynamic";

const Loc = z.object({
  nguoiId: z.union([z.uuid(), z.literal("")]).optional().transform((x) => x || null),
  nam: z.coerce.number().int().min(2020).max(2100).optional(),
});

export const GET = xuLyApi((nc, req) => {
  const l = docTruyVan(req, Loc);
  return soDuPhepCua(nc, l.nguoiId, l.nam);
}, { quyen: "cham_cong.view" });
