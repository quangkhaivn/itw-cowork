import { z } from "zod";
import { docTruyVan, xuLyApi } from "@/lib/api";
import { traTheoSerial } from "@/modules/bao-hanh/service";

export const dynamic = "force-dynamic";

const LuocDo = z.object({ serial: z.string().trim().max(100).optional().default("") });

/** Tra bảo hành theo số sê-ri — khách gọi tới thường chỉ đọc được số máy. */
export const GET = xuLyApi((nc, req) => traTheoSerial(nc, docTruyVan(req, LuocDo).serial), { quyen: "service_desk.view" });
