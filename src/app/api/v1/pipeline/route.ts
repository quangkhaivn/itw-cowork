import { z } from "zod";
import { docTruyVan, xuLyApi } from "@/lib/api";
import { duLieuPipeline } from "@/modules/co-hoi/service";

export const dynamic = "force-dynamic";

const LuocDo = z.object({ nguoiPhuTrach: z.union([z.uuid(), z.literal("")]).optional().default("") });

export const GET = xuLyApi((nc, req) => duLieuPipeline(nc, docTruyVan(req, LuocDo)), { quyen: "sales.view" });
