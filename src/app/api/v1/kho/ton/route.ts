import { docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocTonKho } from "@/modules/kho/luoc-do";
import { tonKho } from "@/modules/kho/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => tonKho(nc, docTruyVan(req, LuocDoLocTonKho)), { quyen: "inventory.view" });
