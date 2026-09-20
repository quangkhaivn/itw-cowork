import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoTaoKho } from "@/modules/kho/luoc-do";
import { danhSachKho, taoKho } from "@/modules/kho/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachKho(nc), { quyen: "inventory.view" });

export const POST = xuLyApi(async (nc, req) => taoKho(nc, await docThan(req, LuocDoTaoKho)));
