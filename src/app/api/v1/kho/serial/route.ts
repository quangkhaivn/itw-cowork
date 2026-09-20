import { docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocSerial } from "@/modules/kho/luoc-do";
import { danhSachSerial } from "@/modules/kho/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachSerial(nc, docTruyVan(req, LuocDoLocSerial)), { quyen: "inventory.view" });
