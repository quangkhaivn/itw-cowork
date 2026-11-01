import { z } from "zod";
import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { danhSachNgayLe, taoNgayLe } from "@/modules/nhan-su/service";
import { LuocDoNgayLe } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

const Loc = z.object({ nam: z.coerce.number().int().min(2020).max(2100) });

export const GET = xuLyApi((nc, req) => danhSachNgayLe(nc, docTruyVan(req, Loc).nam), { quyen: "nhan_su.view" });
export const POST = xuLyApi(async (nc, req) => taoNgayLe(nc, await docThan(req, LuocDoNgayLe)), { quyen: "nhan_su.create" });
