import { z } from "zod";
import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { danhSachMuc, LuocDoTaoMuc, taoMuc } from "@/modules/du-lieu-goc/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachMuc(nc, docTruyVan(req, z.object({ loai: z.string().max(50) })).loai));

export const POST = xuLyApi(async (nc, req) => taoMuc(nc, await docThan(req, LuocDoTaoMuc)));
