import { z } from "zod";
import { docTruyVan, xuLyApi } from "@/lib/api";
import { doTrungLead } from "@/modules/lead/service";

export const dynamic = "force-dynamic";

const LuocDo = z.object({
  congTy: z.string().trim().max(255).optional().default(""),
  maSoThue: z.string().trim().max(30).optional().default(""),
  dienThoai: z.string().trim().max(30).optional().default(""),
  email: z.string().trim().max(255).optional().default(""),
  boQuaId: z.union([z.uuid(), z.literal("")]).optional().default(""),
});

export const GET = xuLyApi((nc, req) => doTrungLead(nc, docTruyVan(req, LuocDo)));
